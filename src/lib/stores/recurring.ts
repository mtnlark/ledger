import { db, type Transaction } from '$lib/db';
import { getDismissedRecurring } from './settings';
import { normalizeMerchant } from '$lib/utils/string-helpers';
import { config } from '$lib/config';
import {
	generateDecayWeights,
	computeWeightedMean,
	computeWeightedStdDev,
	mode
} from '$lib/insights/calculations/stats';
import { roundCurrency, roundCoefficient } from '$lib/utils/currency';
import { getCachedRecurring, setCachedRecurring } from './recurringCache';
import {
	groupTransactionsIntoPurchases,
	type PurchaseAllocation,
	type TransactionPurchase
} from '$lib/utils/transaction-grouping';

// Re-export cache functions for backward compatibility
export { invalidateRecurringCache, getRecurringCacheVersion } from './recurringCache';

export interface DetectedRecurring {
	merchant: string;
	categoryId: number;
	/** Average total amount (before any split) */
	averageAmount: number;
	/** Average user's portion (after split if shared) */
	averageUserAmount: number;
	frequency: RecurringFrequency;
	dayOfMonth: number;
	occurrenceCount: number;
	/** 'fixed' = low variance (subscriptions, insurance), 'variable' = higher variance (utilities) */
	amountType: 'fixed' | 'variable';
	/** Coefficient of variation (0-1+) - how much the amount varies */
	variance: number;
	/** Whether this recurring expense is typically shared */
	isShared: boolean;
	/** Category allocation pattern from the most recent split occurrence. */
	allocationTemplate?: PurchaseAllocation[];
}

/**
 * Calculate average of numbers
 */
function average(numbers: number[]): number {
	if (numbers.length === 0) return 0;
	return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

/**
 * Calculate coefficient of variation (relative standard deviation) with optional weighting.
 * Uses exponential decay weighting so recent transactions have more influence on
 * the calculated variance. This is useful for detecting if a subscription price
 * has recently changed.
 *
 * Returns a value between 0 and 1+ representing variance as percentage of mean.
 *
 * @param amounts Array of amounts in chronological order (oldest first)
 * @param useWeighting Whether to apply exponential decay weighting (default true)
 * @param decay Decay factor per period (default 0.85)
 */
function calculateVariance(amounts: number[], useWeighting = true, decay = 0.85): number {
	if (amounts.length < 2) return 0;

	if (useWeighting) {
		const weights = generateDecayWeights(amounts.length, decay);
		const mean = computeWeightedMean(amounts, weights);
		if (mean === 0) return 0;
		const stdDev = computeWeightedStdDev(amounts, weights);
		return stdDev / mean;
	} else {
		const avg = average(amounts);
		if (avg === 0) return 0;
		const squaredDiffs = amounts.map((a) => Math.pow(a - avg, 2));
		const variance = average(squaredDiffs);
		const stdDev = Math.sqrt(variance);
		return stdDev / avg;
	}
}

/**
 * Get adaptive variance thresholds based on occurrence count.
 * With fewer data points, we need more lenient thresholds because
 * the variance calculation is noisier.
 *
 * Formula: threshold × (1 + 1/occurrenceCount)
 * - 2 occurrences: threshold × 1.5
 * - 3 occurrences: threshold × 1.33
 * - 6 occurrences: threshold × 1.17
 * - 12+ occurrences: approaches base threshold
 */
function getAdaptiveVarianceThresholds(
	occurrenceCount: number
): { maxVariance: number; fixedThreshold: number } {
	const adjustment = 1 + 1 / Math.max(occurrenceCount, 2);
	return {
		maxVariance: config.recurring.maxVariance * adjustment,
		fixedThreshold: config.recurring.fixedVarianceThreshold * adjustment
	};
}

export type RecurringFrequency = 'monthly' | 'semi-annual' | 'annual';

interface PatternResult {
	frequency: RecurringFrequency;
	dayOfMonth: number;
}

/**
 * Check if transactions follow a recurring pattern (monthly, semi-annual, or annual)
 * Returns the frequency and day of month if pattern detected, null otherwise
 */
function detectRecurringPattern(purchases: TransactionPurchase[]): PatternResult | null {
	if (purchases.length < 2) return null;

	// Sort by date
	const sorted = [...purchases].sort(
		(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
	);

	// Calculate intervals between consecutive transactions (in days)
	const intervals: number[] = [];
	for (let i = 1; i < sorted.length; i++) {
		const prevDate = new Date(sorted[i - 1].date);
		const currDate = new Date(sorted[i].date);
		const days = Math.round(
			(currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
		);
		intervals.push(days);
	}

	const avgInterval = average(intervals);

	// Find the most common day of month
	const daysOfMonth = sorted.map((t) => new Date(t.date).getDate());
	const dayOfMonth = mode(daysOfMonth);

	const { intervals: intervalConfig } = config.recurring;

	// Check for monthly pattern
	if (avgInterval >= intervalConfig.monthly.min && avgInterval <= intervalConfig.monthly.max) {
		return { frequency: 'monthly', dayOfMonth };
	}

	// Check for semi-annual pattern (~6 months)
	if (avgInterval >= intervalConfig.semiAnnual.min && avgInterval <= intervalConfig.semiAnnual.max) {
		return { frequency: 'semi-annual', dayOfMonth };
	}

	// Check for annual pattern (~12 months)
	if (avgInterval >= intervalConfig.annual.min && avgInterval <= intervalConfig.annual.max) {
		return { frequency: 'annual', dayOfMonth };
	}

	return null; // No recognized pattern
}

/**
 * Detect recurring expenses from transaction history
 * Looks for patterns: same merchant, monthly cadence
 * Allows both fixed amounts (subscriptions, insurance) and variable amounts (utilities)
 * Excludes transactions already tagged as subscriptions (those are shown separately)
 * Results are cached until invalidated
 */
export async function detectRecurringExpenses(providedTransactions?: Transaction[]): Promise<DetectedRecurring[]> {
	// Return cached results if available
	const cached = getCachedRecurring();
	if (cached !== null) {
		return cached;
	}

	const allTransactions = providedTransactions ?? await db.transactions.toArray();

	if (allTransactions.length === 0) {
		setCachedRecurring([]);
		return [];
	}

	// Filter out split parent and soft-deleted transactions
	const purchases = groupTransactionsIntoPurchases(allTransactions);

	// Get dismissed merchants to filter out
	const dismissedMerchants = await getDismissedRecurring();

	// Group transactions by normalized merchant name
	// Exclude transactions already tagged as subscriptions (they're shown in subscriptions section)
	const merchantGroups = new Map<string, TransactionPurchase[]>();
	for (const purchase of purchases) {
		// Skip transactions already tagged as subscriptions
		if (purchase.sourceTransactions.some((transaction) => transaction.isSubscription)) continue;

		const key = normalizeMerchant(purchase.merchant);
		// Skip dismissed merchants
		if (dismissedMerchants.includes(key)) continue;
		const existing = merchantGroups.get(key) || [];
		merchantGroups.set(key, [...existing, purchase]);
	}

	const detected: DetectedRecurring[] = [];

	for (const [, merchantPurchases] of merchantGroups) {
		// Need at least 2 occurrences to detect a pattern
		if (merchantPurchases.length < 2) continue;

		// Check for recurring pattern (monthly, semi-annual, or annual)
		const pattern = detectRecurringPattern(merchantPurchases);
		if (pattern === null) continue;

		// Sort transactions chronologically (oldest first) for weighted variance
		const sortedPurchases = [...merchantPurchases].sort(
			(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
		);

		// Calculate weighted variance (recent transactions have more influence)
		const amounts = sortedPurchases.map((purchase) => purchase.totalAmount);
		const variance = calculateVariance(amounts, true, 0.85);

		// Get adaptive thresholds based on occurrence count
		const { maxVariance, fixedThreshold } = getAdaptiveVarianceThresholds(merchantPurchases.length);

		// Skip if variance is too high to be considered recurring
		if (variance >= maxVariance) continue;

		// Classify as fixed (low variance) or variable (higher variance)
		const amountType: 'fixed' | 'variable' = variance <= fixedThreshold ? 'fixed' : 'variable';

		// Calculate average amount
		const avgAmount = average(amounts);

		// Calculate user's portion (after split if shared)
		const userAmounts = merchantPurchases.map((purchase) => purchase.userAmount);
		const avgUserAmount = average(userAmounts);

		// Determine if this is typically shared (majority of transactions are shared)
		const sharedCount = merchantPurchases.filter((purchase) => purchase.isShared).length;
		const isShared = sharedCount > merchantPurchases.length / 2;

		// Find most common category
		const categoryIds = merchantPurchases.map((purchase) => purchase.dominantCategoryId);
		const categoryId = mode(categoryIds);
		const mostRecentSplit = [...sortedPurchases].reverse().find((purchase) => purchase.isSplit);

		detected.push({
			merchant: merchantPurchases[0].merchant, // Use original casing from first transaction
			categoryId,
			averageAmount: roundCurrency(avgAmount),
			averageUserAmount: roundCurrency(avgUserAmount),
			frequency: pattern.frequency,
			dayOfMonth: pattern.dayOfMonth,
			occurrenceCount: merchantPurchases.length,
			amountType,
			variance: roundCoefficient(variance),
			isShared,
			allocationTemplate: mostRecentSplit?.allocations.map((allocation) => ({ ...allocation }))
		});
	}

	// Sort by average amount descending (highest recurring expenses first)
	detected.sort((a, b) => b.averageAmount - a.averageAmount);

	// Cache the results
	setCachedRecurring(detected);
	return detected;
}
