import { db, type Transaction } from '$lib/db';
import { getDismissedRecurring } from './settings';
import { normalizeMerchant } from '$lib/utils/string-helpers';

export interface DetectedRecurring {
	merchant: string;
	categoryId: number;
	averageAmount: number;
	frequency: 'monthly';
	dayOfMonth: number;
	occurrenceCount: number;
	isSubscription: boolean;
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

/**
 * Check if transactions follow a monthly pattern
 * Returns the day of month if pattern detected, null otherwise
 */
function detectMonthlyPattern(transactions: Transaction[]): number | null {
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

	// Check if average interval is monthly (25-35 days)
	const avgInterval = average(intervals);
	if (avgInterval < 25 || avgInterval > 35) {
		return null; // Not a monthly pattern
	}

	// Find the most common day of month
	const daysOfMonth = sorted.map((t) => new Date(t.date).getDate());
	return mode(daysOfMonth);
}

/**
 * Detect recurring expenses from transaction history
 * Looks for patterns: same merchant, similar amounts, monthly cadence
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

	// Get dismissed merchants to filter out
	const dismissedMerchants = await getDismissedRecurring();

	// Get categories to check for "Subscriptions"
	const categories = await db.categories.toArray();
	const subscriptionsCategoryId = categories.find(
		(c) => c.name === 'Subscriptions'
	)?.id;

	// Group transactions by normalized merchant name
	const merchantGroups = new Map<string, Transaction[]>();
	for (const tx of allTransactions) {
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

		// Check amount variance (must be within 15%)
		const amounts = transactions.map((t) => t.amount);
		const variance = calculateVariance(amounts);
		if (variance > 0.15) continue;

		// Check for monthly pattern
		const dayOfMonth = detectMonthlyPattern(transactions);
		if (dayOfMonth === null) continue;

		// Calculate average amount
		const avgAmount = average(amounts);

		// Find most common category
		const categoryIds = transactions.map((t) => t.categoryId);
		const categoryId = mode(categoryIds);

		// Check if it's a subscription
		const isSubscription = categoryId === subscriptionsCategoryId;

		detected.push({
			merchant: transactions[0].merchant, // Use original casing from first transaction
			categoryId,
			averageAmount: Math.round(avgAmount * 100) / 100, // Round to 2 decimal places
			frequency: 'monthly',
			dayOfMonth,
			occurrenceCount: transactions.length,
			isSubscription
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
