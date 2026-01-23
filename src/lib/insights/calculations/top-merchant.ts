/**
 * Top merchant detection: most frequently visited merchant.
 */

import type { Transaction } from '$lib/db';
import type { TopMerchantResult } from '../types';

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

	const freq = new Map<string, number>();
	for (const t of transactions) {
		freq.set(t.merchant, (freq.get(t.merchant) || 0) + 1);
	}

	let top = { merchant: '', count: 0 };
	for (const [merchant, count] of freq) {
		if (count > top.count) {
			top = { merchant, count };
		}
	}

	return top.count >= minVisits ? top : null;
}
