/**
 * Recurring Suggestions Store
 *
 * Computes pending recurring transaction suggestions by merging:
 * 1. Auto-detected recurring expenses (from detectRecurringExpenses)
 * 2. User-tagged subscriptions (transactions marked isSubscription: true)
 *
 * Subscriptions take priority over detected recurring for the same merchant.
 *
 * Groups by merchant+amount composite key so multiple subscriptions from
 * the same merchant (e.g., Apple iCloud $2.99 + Apple Music $2.16) are
 * tracked independently.
 */

import { db, type Transaction, parseMonthKey } from '$lib/db';
import { detectRecurringExpenses, type RecurringFrequency } from './recurring';
import { getSettings, getCancelledSubscriptions } from './settings';
import { normalizeMerchant, subscriptionKey, findSupersededSubscriptionKeys } from '$lib/utils/string-helpers';
import { roundCurrency, currencyEquals } from '$lib/utils/currency';
import { mode } from '$lib/insights/calculations/stats';
import { config } from '$lib/config';

export interface RecurringSuggestion {
	/** Unique ID - composite key (merchant|amount) for subscriptions, normalized merchant for detected */
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
 * For subscriptions (with composite key), matches by merchant + amount within tolerance.
 * For detected recurring (merchant-only key), matches by merchant name only.
 */
function isAlreadyAdded(suggestion: RecurringSuggestion, monthTxns: Transaction[]): boolean {
	const normalizedMerchant = normalizeMerchant(suggestion.merchant);
	const tolerance = config.recurringSuggestions.amountTolerance;

	return monthTxns.some((tx) => {
		// Skip split parent and soft-deleted transactions
		if (tx.isSplitParent || tx.isDeleted) return false;
		if (normalizeMerchant(tx.merchant) !== normalizedMerchant) return false;

		// For subscription suggestions, also match by amount (within tolerance)
		if (suggestion.isSubscription) {
			const expected = suggestion.expectedAmount;
			if (expected === 0) return true; // Edge case: free subscriptions
			const diff = Math.abs(tx.amount - expected) / expected;
			return diff <= tolerance;
		}

		// For detected recurring (non-subscription), merchant match is sufficient
		return true;
	});
}

/**
 * Check if a recurring item is expected this month based on its frequency.
 * For semi-annual and annual items, checks if this is the expected month.
 */
export function isExpectedThisMonth(
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

	// Calculate total months difference accounting for year
	const totalMonthsDiff =
		(targetDate.getFullYear() - lastOccurrence.getFullYear()) * 12 +
		(targetDate.getMonth() - lastOccurrence.getMonth());

	// Must be in a future month relative to last occurrence
	if (totalMonthsDiff <= 0) return false;

	if (frequency === 'semi-annual') {
		return totalMonthsDiff % 6 === 0;
	}

	if (frequency === 'annual') {
		return totalMonthsDiff % 12 === 0;
	}

	return false;
}

/**
 * Get user-tagged subscriptions from transactions.
 * Groups by merchant+amount composite key so multiple subscriptions from
 * the same merchant with different amounts are tracked independently.
 */
export async function getUserSubscriptions(providedTransactions?: Transaction[]): Promise<Map<string, RecurringSuggestion>> {
	// Filter in-memory since isSubscription isn't indexed
	const allTransactions = providedTransactions ?? await db.transactions.toArray();
	const allTxns = allTransactions.filter((tx) => tx.isSubscription && !tx.isDeleted && !tx.isSplitParent);

	// Group by composite key (merchant|amount)
	const grouped = new Map<string, Transaction[]>();
	for (const tx of allTxns) {
		const key = subscriptionKey(tx.merchant, tx.amount);
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

		// Map subscription frequency to RecurringFrequency (types now align)
		const frequency: RecurringFrequency = mostRecent.subscriptionFrequency ?? 'monthly';

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

	// Filter out superseded entries (price changes, plan upgrades)
	const entries = Array.from(subscriptions.entries()).map(([key, s]) => ({
		key,
		merchant: s.merchant,
		amount: s.expectedAmount,
		latestDate: new Date(
			Math.max(...(grouped.get(key) || []).map((tx) => new Date(tx.date).getTime()))
		)
	}));
	const superseded = findSupersededSubscriptionKeys(entries, allTxns);
	for (const key of superseded) {
		subscriptions.delete(key);
	}

	return subscriptions;
}

/**
 * Pre-built lookup maps for last occurrence dates, avoiding N+1 queries.
 * - merchantLastDate: keyed by normalized merchant, latest date across all amounts
 * - merchantAmountLastDate: keyed by `merchant|amount` (rounded), latest date for that specific amount
 */
interface LastOccurrenceMaps {
	merchantLastDate: Map<string, Date>;
	merchantAmountLastDate: Map<string, Date>;
}

/**
 * Build last-occurrence lookup maps from all transactions in a single pass.
 */
function buildLastOccurrenceMaps(allTxns: Transaction[]): LastOccurrenceMaps {
	const merchantLastDate = new Map<string, Date>();
	const merchantAmountLastDate = new Map<string, Date>();

	for (const tx of allTxns) {
		const merchant = normalizeMerchant(tx.merchant);
		const txDate = new Date(tx.date);

		// Merchant-level: latest date for this merchant (any amount)
		const existing = merchantLastDate.get(merchant);
		if (!existing || txDate.getTime() > existing.getTime()) {
			merchantLastDate.set(merchant, txDate);
		}

		// Merchant+amount-level: latest date for this specific amount
		const amountKey = `${merchant}|${roundCurrency(tx.amount)}`;
		const existingAmount = merchantAmountLastDate.get(amountKey);
		if (!existingAmount || txDate.getTime() > existingAmount.getTime()) {
			merchantAmountLastDate.set(amountKey, txDate);
		}
	}

	return { merchantLastDate, merchantAmountLastDate };
}

/**
 * Look up last occurrence date for a merchant from pre-built maps.
 *
 * @param maps - Pre-built lookup maps
 * @param normalizedMerchant - Normalized merchant name
 * @param amount - Optional amount to filter by. When provided, looks up the
 *                 merchant+amount composite key for exact (rounded) match.
 */
function getLastOccurrence(
	maps: LastOccurrenceMaps,
	normalizedMerchant: string,
	amount?: number
): Date | null {
	if (amount != null && amount > 0) {
		const amountKey = `${normalizedMerchant}|${roundCurrency(amount)}`;
		return maps.merchantAmountLastDate.get(amountKey) ?? null;
	}
	return maps.merchantLastDate.get(normalizedMerchant) ?? null;
}

/**
 * Check if a subscription is cancelled.
 * Checks both targeted (merchant+amount) and legacy (merchant-only) cancellation records.
 */
function isCancelledSubscription(
	normalizedMerchant: string,
	cancelledSubs: { merchant: string; cancelledDate: string; amount?: number }[],
	amount?: number
): boolean {
	return cancelledSubs.some((c) => {
		if (c.merchant !== normalizedMerchant) return false;
		// Legacy record (no amount) cancels ALL subscriptions from this merchant
		if (c.amount == null) return true;
		// Targeted record: match if amounts are equal (within tolerance)
		if (amount != null) return currencyEquals(c.amount, amount);
		// Targeted record but no amount to check against: match
		return true;
	});
}

/**
 * Get recurring suggestions for a given month.
 * Merges detected recurring with user-tagged subscriptions.
 * Filters out already-added transactions and cancelled subscriptions.
 */
export async function getRecurringSuggestions(month: string, providedTransactions?: Transaction[]): Promise<RecurringSuggestion[]> {
	const settings = await getSettings();
	const cancelledSubs = await getCancelledSubscriptions();

	// Use provided transactions or fall back to DB query
	const allTxns = providedTransactions ?? await db.transactions.toArray();

	// Get transactions for this month from the full set (avoids separate DB query)
	const monthStart = parseMonthKey(month);
	const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
	const monthTxns = allTxns.filter((tx) => {
		const d = new Date(tx.date);
		return d >= monthStart && d <= monthEnd;
	});

	// Get user-tagged subscriptions (priority) — pass full transactions to avoid re-querying
	const userSubscriptions = await getUserSubscriptions(allTxns);

	// Get detected recurring expenses — pass full transactions to avoid re-querying
	const detectedRecurring = await detectRecurringExpenses(allTxns);

	// Build last-occurrence maps once (fixes N+1: was fetching all txns per item)
	const occurrenceMaps = buildLastOccurrenceMaps(allTxns);

	// Build merged suggestions map (subscriptions override detected)
	const suggestionsMap = new Map<string, RecurringSuggestion>();

	// First, add detected recurring
	for (const detected of detectedRecurring) {
		const key = normalizeMerchant(detected.merchant);

		// Skip if cancelled (merchant-wide check for detected recurring)
		if (isCancelledSubscription(key, cancelledSubs)) continue;

		// Get last occurrence for frequency check
		const lastOccurrence = getLastOccurrence(occurrenceMaps, key);

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
		const merchant = normalizeMerchant(subscription.merchant);

		// Skip if cancelled (check targeted + legacy)
		if (isCancelledSubscription(merchant, cancelledSubs, subscription.expectedAmount)) continue;

		// Get last occurrence for frequency check (filtered by amount)
		const lastOccurrence = getLastOccurrence(occurrenceMaps, merchant, subscription.expectedAmount);

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

		// User subscription overrides detected for same merchant
		// Remove any detected entry for this merchant before adding
		const detectedKey = merchant;
		if (suggestionsMap.has(detectedKey)) {
			suggestionsMap.delete(detectedKey);
		}

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
