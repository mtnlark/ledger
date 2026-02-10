/**
 * Top merchant detection: most frequently visited merchant.
 *
 * Split transactions (children sharing a parentTransactionId) are
 * counted as a single visit to avoid inflating merchant popularity.
 */

import type { Transaction } from '$lib/db';
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
	const seenParents = new Set<number>();

	for (const t of transactions) {
		if (t.parentTransactionId) {
			if (seenParents.has(t.parentTransactionId)) continue;
			seenParents.add(t.parentTransactionId);
		}
		const key = normalizeKey(t.merchant);
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
