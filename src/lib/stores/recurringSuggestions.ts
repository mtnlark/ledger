/**
 * Recurring Suggestions Store
 *
 * Computes pending recurring transaction suggestions by merging:
 * 1. Auto-detected recurring expenses (from detectRecurringExpenses)
 * 2. User-tagged subscriptions (transactions marked isSubscription: true)
 *
 * Subscriptions take priority over detected recurring for the same merchant.
 */

import { db, type Transaction, parseMonthKey } from '$lib/db';
import { detectRecurringExpenses, type RecurringFrequency } from './recurring';
import { getSettings, getCancelledSubscriptions } from './settings';
import { normalizeMerchant } from '$lib/utils/string-helpers';

export interface RecurringSuggestion {
	/** Unique ID - normalized merchant name */
	id: string;
	/** Display name (original casing) */
	merchant: string;
	categoryId: number;
	/** Expected amount for this month (editable before adding) */
	expectedAmount: number;
	/** Expected day of month (1-31) */
	expectedDate: number;
	frequency: RecurringFrequency;
	isShared: boolean;
	splitType: 'percentage' | 'fixed';
	splitValue: number;
	isSubscription: boolean;
	isEssential: boolean;
	/** 'fixed' = low variance (subscriptions), 'variable' = higher variance (utilities) */
	amountType: 'fixed' | 'variable';
}

/**
 * Check if the recurring suggestion banner should be shown.
 * Returns true if the current month differs from the last suggested month.
 */
export function shouldShowRecurringBanner(
	currentMonth: string,
	lastSuggestedMonth?: string
): boolean {
	if (!lastSuggestedMonth) return true;
	return currentMonth !== lastSuggestedMonth;
}

/**
 * Check if a suggestion has already been added this month.
 * Matches by normalized merchant name only - if ANY transaction for that
 * merchant exists this month, consider it added (regardless of amount).
 * This handles cases where prices change or amounts vary.
 */
function isAlreadyAdded(suggestion: RecurringSuggestion, monthTxns: Transaction[]): boolean {
	const normalized = suggestion.id;

	return monthTxns.some((tx) => {
		// Skip split parent and soft-deleted transactions
		if (tx.isSplitParent || tx.isDeleted) return false;
		return normalizeMerchant(tx.merchant) === normalized;
	});
}

/**
 * Check if a recurring item is expected this month based on its frequency.
 * For semi-annual and annual items, checks if this is the expected month.
 */
function isExpectedThisMonth(
	frequency: RecurringFrequency,
	dayOfMonth: number,
	lastOccurrence: Date | null,
	targetMonth: string
): boolean {
	// Monthly items are always expected
	if (frequency === 'monthly') return true;

	// For semi-annual and annual, we need to check if this is the right month
	if (!lastOccurrence) return false;

	const targetDate = parseMonthKey(targetMonth);
	const targetMonthNum = targetDate.getMonth();
	const lastMonthNum = lastOccurrence.getMonth();

	if (frequency === 'semi-annual') {
		// Expected every 6 months from last occurrence
		// Check if target month is ~6 months from last occurrence
		const monthsDiff = (targetMonthNum - lastMonthNum + 12) % 12;
		return monthsDiff === 6 || monthsDiff === 0;
	}

	if (frequency === 'annual') {
		// Expected same month as last occurrence
		return targetMonthNum === lastMonthNum;
	}

	return false;
}

/**
 * Get user-tagged subscriptions from transactions.
 * Groups by merchant and extracts the most recent occurrence's details.
 */
async function getUserSubscriptions(): Promise<Map<string, RecurringSuggestion>> {
	// Filter in-memory since isSubscription isn't indexed
	const allTransactions = await db.transactions.toArray();
	const allTxns = allTransactions.filter((tx) => tx.isSubscription);

	// Group by normalized merchant
	const grouped = new Map<string, Transaction[]>();
	for (const tx of allTxns) {
		const key = normalizeMerchant(tx.merchant);
		const existing = grouped.get(key) || [];
		grouped.set(key, [...existing, tx]);
	}

	const subscriptions = new Map<string, RecurringSuggestion>();

	for (const [key, txns] of grouped) {
		// Sort by date descending to get most recent
		const sorted = [...txns].sort(
			(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
		);
		const mostRecent = sorted[0];

		// Use most recent amount (not average) since subscription prices change over time
		const expectedAmount = mostRecent.amount;

		// Determine day of month (most common)
		const days = txns.map((t) => new Date(t.date).getDate());
		const dayOfMonth = mode(days);

		// Map subscription frequency to RecurringFrequency
		let frequency: RecurringFrequency = 'monthly';
		if (mostRecent.subscriptionFrequency === 'annual') {
			frequency = 'annual';
		}

		// Determine if typically shared
		const sharedCount = txns.filter((t) => t.isShared).length;
		const isShared = sharedCount > txns.length / 2;

		// Get split settings from most recent shared transaction, or defaults
		let splitType: 'percentage' | 'fixed' = 'percentage';
		let splitValue = 0.5;
		if (isShared) {
			const sharedTx = sorted.find((t) => t.isShared);
			if (sharedTx) {
				splitType = sharedTx.splitType;
				splitValue = sharedTx.splitValue;
			}
		}

		subscriptions.set(key, {
			id: key,
			merchant: mostRecent.merchant,
			categoryId: mostRecent.categoryId,
			expectedAmount,
			expectedDate: dayOfMonth,
			frequency,
			isShared,
			splitType,
			splitValue,
			isSubscription: true,
			isEssential: mostRecent.isEssential,
			amountType: 'fixed' // Subscriptions are typically fixed
		});
	}

	return subscriptions;
}

/**
 * Find mode (most common value) in an array.
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
 * Get last occurrence date for a merchant from all transactions.
 */
async function getLastOccurrence(normalizedMerchant: string): Promise<Date | null> {
	const allTxns = await db.transactions.toArray();
	const matching = allTxns.filter(
		(tx) => normalizeMerchant(tx.merchant) === normalizedMerchant
	);

	if (matching.length === 0) return null;

	// Sort by date descending
	matching.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
	return new Date(matching[0].date);
}

/**
 * Get recurring suggestions for a given month.
 * Merges detected recurring with user-tagged subscriptions.
 * Filters out already-added transactions and cancelled subscriptions.
 */
export async function getRecurringSuggestions(month: string): Promise<RecurringSuggestion[]> {
	const settings = await getSettings();
	const cancelledSubs = await getCancelledSubscriptions();
	const cancelledMerchants = new Set(cancelledSubs.map((c) => c.merchant));

	// Get transactions for this month (to check if already added)
	const monthStart = parseMonthKey(month);
	const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
	const monthTxns = await db.transactions
		.where('date')
		.between(monthStart, monthEnd, true, true)
		.toArray();

	// Get user-tagged subscriptions (priority)
	const userSubscriptions = await getUserSubscriptions();

	// Get detected recurring expenses
	const detectedRecurring = await detectRecurringExpenses();

	// Build merged suggestions map (subscriptions override detected)
	const suggestionsMap = new Map<string, RecurringSuggestion>();

	// First, add detected recurring
	for (const detected of detectedRecurring) {
		const key = normalizeMerchant(detected.merchant);

		// Skip if cancelled
		if (cancelledMerchants.has(key)) continue;

		// Get last occurrence for frequency check
		const lastOccurrence = await getLastOccurrence(key);

		// Skip if not expected this month
		if (!isExpectedThisMonth(detected.frequency, detected.dayOfMonth, lastOccurrence, month)) {
			continue;
		}

		// Get split settings from last shared transaction if applicable
		let splitType: 'percentage' | 'fixed' = 'percentage';
		let splitValue = settings.defaultSplitValue;

		if (detected.isShared) {
			// Find the most recent transaction for this merchant to get split settings
			const merchantTxns = monthTxns.filter(
				(tx) => normalizeMerchant(tx.merchant) === key && tx.isShared
			);
			if (merchantTxns.length > 0) {
				const recent = merchantTxns.sort(
					(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
				)[0];
				splitType = recent.splitType;
				splitValue = recent.splitValue;
			}
		}

		suggestionsMap.set(key, {
			id: key,
			merchant: detected.merchant,
			categoryId: detected.categoryId,
			expectedAmount: detected.averageAmount,
			expectedDate: detected.dayOfMonth,
			frequency: detected.frequency,
			isShared: detected.isShared,
			splitType,
			splitValue,
			isSubscription: false,
			isEssential: false, // Will be set from category default
			amountType: detected.amountType
		});
	}

	// Then, add/override with user subscriptions
	for (const [key, subscription] of userSubscriptions) {
		// Skip if cancelled
		if (cancelledMerchants.has(key)) continue;

		// Get last occurrence for frequency check
		const lastOccurrence = await getLastOccurrence(key);

		// Skip if not expected this month
		if (
			!isExpectedThisMonth(
				subscription.frequency,
				subscription.expectedDate,
				lastOccurrence,
				month
			)
		) {
			continue;
		}

		// User subscription overrides detected
		suggestionsMap.set(key, subscription);
	}

	// Convert to array
	let suggestions = Array.from(suggestionsMap.values());

	// Filter out already-added transactions
	suggestions = suggestions.filter((s) => !isAlreadyAdded(s, monthTxns));

	// Sort by expected date, then amount
	suggestions.sort((a, b) => {
		if (a.expectedDate !== b.expectedDate) return a.expectedDate - b.expectedDate;
		return b.expectedAmount - a.expectedAmount;
	});

	return suggestions;
}
