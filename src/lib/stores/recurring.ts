import { db, type Transaction } from '$lib/db';
import { getDismissedRecurring } from './settings';
import { normalizeMerchant } from '$lib/utils/string-helpers';

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
	/** Whether it's in the Subscriptions category (legacy - use amountType instead) */
	isSubscription: boolean;
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
 * Calculate coefficient of variation (relative standard deviation)
 * Returns a value between 0 and 1+ representing variance as percentage of mean
 */
function calculateVariance(amounts: number[]): number {
	if (amounts.length < 2) return 0;
	const avg = average(amounts);
	if (avg === 0) return 0;

	const squaredDiffs = amounts.map((a) => Math.pow(a - avg, 2));
	const variance = average(squaredDiffs);
	const stdDev = Math.sqrt(variance);

	return stdDev / avg; // Coefficient of variation
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

	// Check for monthly pattern (25-35 days)
	if (avgInterval >= 25 && avgInterval <= 35) {
		return { frequency: 'monthly', dayOfMonth };
	}

	// Check for semi-annual pattern (160-200 days, ~6 months)
	if (avgInterval >= 160 && avgInterval <= 200) {
		return { frequency: 'semi-annual', dayOfMonth };
	}

	// Check for annual pattern (350-380 days, ~12 months)
	if (avgInterval >= 350 && avgInterval <= 380) {
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

	// Get categories to check for "Subscriptions"
	const categories = await db.categories.toArray();
	const subscriptionsCategoryId = categories.find(
		(c) => c.name === 'Subscriptions'
	)?.id;

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

		// Calculate amount variance
		const amounts = transactions.map((t) => t.amount);
		const variance = calculateVariance(amounts);

		// Allow up to 50% variance for variable bills (utilities)
		// 50%+ is too unpredictable to be considered recurring
		if (variance >= 0.50) continue;

		// Classify as fixed (<15% variance) or variable (15-50% variance)
		const amountType: 'fixed' | 'variable' = variance <= 0.15 ? 'fixed' : 'variable';

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

		// Check if it's in the Subscriptions category (legacy field)
		const isSubscription = categoryId === subscriptionsCategoryId;

		detected.push({
			merchant: transactions[0].merchant, // Use original casing from first transaction
			categoryId,
			averageAmount: Math.round(avgAmount * 100) / 100, // Round to 2 decimal places
			averageUserAmount: Math.round(avgUserAmount * 100) / 100,
			frequency: pattern.frequency,
			dayOfMonth: pattern.dayOfMonth,
			occurrenceCount: transactions.length,
			isSubscription,
			amountType,
			variance: Math.round(variance * 100) / 100,
			isShared
		});
	}

	// Sort by average amount descending (highest recurring expenses first)
	detected.sort((a, b) => b.averageAmount - a.averageAmount);

	// Cache the results
	cachedRecurringExpenses = detected;
	return detected;
}

/**
 * Get summary stats for recurring expenses
 */
export async function getRecurringSummary(): Promise<{
	totalMonthlyRecurring: number;
	subscriptionsMonthly: number;
	recurringCount: number;
}> {
	const recurring = await detectRecurringExpenses();

	const totalMonthlyRecurring = recurring.reduce((sum, r) => sum + r.averageAmount, 0);
	const subscriptionsMonthly = recurring
		.filter((r) => r.isSubscription)
		.reduce((sum, r) => sum + r.averageAmount, 0);

	return {
		totalMonthlyRecurring: Math.round(totalMonthlyRecurring * 100) / 100,
		subscriptionsMonthly: Math.round(subscriptionsMonthly * 100) / 100,
		recurringCount: recurring.length
	};
}
