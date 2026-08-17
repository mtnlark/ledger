/**
 * Top merchant detection: most frequently visited merchant.
 *
 * Split transactions (children sharing a parentTransactionId) are
 * counted as a single visit to avoid inflating merchant popularity.
 */

import type { Transaction } from '$lib/db';
import { groupTransactionsIntoPurchases } from '$lib/utils/transaction-grouping';
import type { TopMerchantResult } from '../types';

/**
 * Count merchant visits, treating all split children sharing a
 * parentTransactionId as one visit.
 *
 * @param transactions List of transactions (should exclude isSplitParent)
 * @param normalizeKey Optional key normalization (e.g. lowercase for case-insensitive grouping)
 * @returns Map of merchant key → visit count
 */
export function countMerchantVisits(
	transactions: Transaction[],
	normalizeKey: (merchant: string) => string = (m) => m
): Map<string, number> {
	const freq = new Map<string, number>();
	for (const purchase of groupTransactionsIntoPurchases(transactions)) {
		const key = normalizeKey(purchase.merchant);
		freq.set(key, (freq.get(key) || 0) + 1);
	}
	return freq;
}

/**
 * Find the most frequently visited merchant.
 *
 * @param transactions List of transactions
 * @param minVisits Minimum visits to be considered (default: 2)
 * @returns Top merchant info or null if no merchant meets threshold
 */
export function getTopMerchant(
	transactions: Transaction[],
	minVisits = 2
): TopMerchantResult | null {
	if (transactions.length === 0) return null;

	const freq = countMerchantVisits(transactions);

	let top = { merchant: '', count: 0 };
	for (const [merchant, count] of freq) {
		if (count > top.count) {
			top = { merchant, count };
		}
	}

	return top.count >= minVisits ? top : null;
}
