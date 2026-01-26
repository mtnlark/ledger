import { db, type Transaction } from '$lib/db';
import { getDismissedRecurring } from './settings';
import { normalizeMerchant } from '$lib/utils/string-helpers';
import { config } from '$lib/config';
import {
	generateDecayWeights,
	computeWeightedMean,
	computeWeightedStdDev
} from '$lib/insights/calculations/stats';
import { roundCurrency } from '$lib/utils/currency';

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
}

// Cache for recurring detection results - invalidated when transactions change
let cachedRecurringExpenses: DetectedRecurring[] | null = null;
let cacheVersion = 0;

/**
 * Invalidate the recurring detection cache
 * Call this when transactions are added, updated, or deleted
 */
export function invalidateRecurringCache(): void {
	cachedRecurringExpenses = null;
	cacheVersion++;
}

/**
 * Get the current cache version (for testing/debugging)
 */
export function getRecurringCacheVersion(): number {
	return cacheVersion;
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

/**
 * Find the most common value in an array (mode)
 */
function mode<T>(arr: T[]): T {
	const counts = new Map<T, number>();
	for (const val of arr) {
		counts.set(val, (counts.get(val) || 0) + 1);
	}

	let maxCount = 0;
	let modeValue = arr[0];
	for (const [val, count] of counts) {
		if (count > maxCount) {
			maxCount = count;
			modeValue = val;
		}
	}
	return modeValue;
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
function detectRecurringPattern(transactions: Transaction[]): PatternResult | null {
	if (transactions.length < 2) return null;

	// Sort by date
	const sorted = [...transactions].sort(
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
export async function detectRecurringExpenses(): Promise<DetectedRecurring[]> {
	// Return cached results if available
	if (cachedRecurringExpenses !== null) {
		return cachedRecurringExpenses;
	}

	const allTransactions = await db.transactions.toArray();

	if (allTransactions.length === 0) {
		cachedRecurringExpenses = [];
		return [];
	}

	// Filter out split parent transactions (they've been replaced by children)
	const activeTransactions = allTransactions.filter((tx) => !tx.isSplitParent);

	// Get dismissed merchants to filter out
	const dismissedMerchants = await getDismissedRecurring();

	// Group transactions by normalized merchant name
	// Exclude transactions already tagged as subscriptions (they're shown in subscriptions section)
	const merchantGroups = new Map<string, Transaction[]>();
	for (const tx of activeTransactions) {
		// Skip transactions already tagged as subscriptions
		if (tx.isSubscription) continue;

		const key = normalizeMerchant(tx.merchant);
		// Skip dismissed merchants
		if (dismissedMerchants.includes(key)) continue;
		const existing = merchantGroups.get(key) || [];
		merchantGroups.set(key, [...existing, tx]);
	}

	const detected: DetectedRecurring[] = [];

	for (const [, transactions] of merchantGroups) {
		// Need at least 2 occurrences to detect a pattern
		if (transactions.length < 2) continue;

		// Check for recurring pattern (monthly, semi-annual, or annual)
		const pattern = detectRecurringPattern(transactions);
		if (pattern === null) continue;

		// Sort transactions chronologically (oldest first) for weighted variance
		const sortedTransactions = [...transactions].sort(
			(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
		);

		// Calculate weighted variance (recent transactions have more influence)
		const amounts = sortedTransactions.map((t) => t.amount);
		const variance = calculateVariance(amounts, true, 0.85);

		// Get adaptive thresholds based on occurrence count
		const { maxVariance, fixedThreshold } = getAdaptiveVarianceThresholds(transactions.length);

		// Skip if variance is too high to be considered recurring
		if (variance >= maxVariance) continue;

		// Classify as fixed (low variance) or variable (higher variance)
		const amountType: 'fixed' | 'variable' = variance <= fixedThreshold ? 'fixed' : 'variable';

		// Calculate average amount
		const avgAmount = average(amounts);

		// Calculate user's portion (after split if shared)
		const userAmounts = transactions.map((t) =>
			t.isShared ? t.amount - t.partnerShare : t.amount
		);
		const avgUserAmount = average(userAmounts);

		// Determine if this is typically shared (majority of transactions are shared)
		const sharedCount = transactions.filter((t) => t.isShared).length;
		const isShared = sharedCount > transactions.length / 2;

		// Find most common category
		const categoryIds = transactions.map((t) => t.categoryId);
		const categoryId = mode(categoryIds);

		detected.push({
			merchant: transactions[0].merchant, // Use original casing from first transaction
			categoryId,
			averageAmount: roundCurrency(avgAmount),
			averageUserAmount: roundCurrency(avgUserAmount),
			frequency: pattern.frequency,
			dayOfMonth: pattern.dayOfMonth,
			occurrenceCount: transactions.length,
			amountType,
			variance: roundCurrency(variance),
			isShared
		});
	}

	// Sort by average amount descending (highest recurring expenses first)
	detected.sort((a, b) => b.averageAmount - a.averageAmount);

	// Cache the results
	cachedRecurringExpenses = detected;
	return detected;
}

