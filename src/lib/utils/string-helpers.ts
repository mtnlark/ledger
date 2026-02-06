import { roundCurrency, currencyEquals } from './currency';

/**
 * Normalize merchant name for comparison and indexing
 * Converts to lowercase and trims whitespace
 */
export function normalizeMerchant(name: string): string {
	return name.toLowerCase().trim();
}

/**
 * Build a composite key for a specific subscription slot.
 * Two transactions from the same merchant with different amounts
 * represent different subscriptions (e.g., Apple iCloud $2.99 + Apple Music $2.16).
 *
 * @returns "normalizedmerchant|amount" (e.g., "apple|2.99")
 */
export function subscriptionKey(merchant: string, amount: number): string {
	return `${normalizeMerchant(merchant)}|${roundCurrency(amount)}`;
}

/**
 * Extract the normalized merchant name from a composite subscription key.
 *
 * @param key - A composite key from subscriptionKey() (e.g., "apple|2.99")
 * @returns The merchant portion (e.g., "apple")
 */
export function merchantFromSubscriptionKey(key: string): string {
	const pipeIndex = key.lastIndexOf('|');
	return pipeIndex === -1 ? key : key.substring(0, pipeIndex);
}

/**
 * Minimal shape for subscription entry used by supersession detection.
 */
interface SubscriptionEntry {
	key: string;
	merchant: string;
	amount: number;
	latestDate: Date;
}

/**
 * Minimal shape for a subscription transaction used by supersession detection.
 */
interface SubscriptionTxn {
	merchant: string;
	amount: number;
	date: Date | string;
}

/**
 * Identify subscription entries that have been superseded by a newer amount
 * for the same merchant (e.g., a price increase from $14.99 to $18.99).
 *
 * An older amount is "superseded" when:
 *   1. A newer amount exists for the same merchant (more recent latest charge)
 *   2. The older amount was never charged after the newer amount started
 *
 * Concurrent subscriptions from the same merchant (e.g., Apple iCloud + Apple Music)
 * are preserved because they have overlapping charge periods.
 *
 * @param entries - Grouped subscription entries with composite keys and latest dates
 * @param allSubTxns - All subscription transactions (for finding first-charge dates)
 * @returns Set of composite keys that should be removed (superseded)
 */
export function findSupersededSubscriptionKeys(
	entries: SubscriptionEntry[],
	allSubTxns: SubscriptionTxn[]
): Set<string> {
	const superseded = new Set<string>();

	// Group entries by merchant
	const byMerchant = new Map<string, SubscriptionEntry[]>();
	for (const entry of entries) {
		const m = normalizeMerchant(entry.merchant);
		const group = byMerchant.get(m) || [];
		group.push(entry);
		byMerchant.set(m, group);
	}

	for (const [merchant, group] of byMerchant) {
		if (group.length <= 1) continue;

		// Pre-compute earliest charge date for each amount group
		const earliestByKey = new Map<string, number>();
		for (const entry of group) {
			const txns = allSubTxns.filter(
				(tx) =>
					normalizeMerchant(typeof tx.merchant === 'string' ? tx.merchant : '') === merchant &&
					currencyEquals(tx.amount, entry.amount)
			);
			const earliest = Math.min(...txns.map((tx) => new Date(tx.date).getTime()));
			earliestByKey.set(entry.key, earliest);
		}

		// Pairwise supersession: A is superseded if a newer B exists
		// and A's latest charge is before B's earliest charge
		for (const entryA of group) {
			for (const entryB of group) {
				if (entryA.key === entryB.key) continue;

				if (
					entryB.latestDate.getTime() > entryA.latestDate.getTime() &&
					entryA.latestDate.getTime() < earliestByKey.get(entryB.key)!
				) {
					superseded.add(entryA.key);
					break; // Already superseded, no need to check other entries
				}
			}
		}
	}

	return superseded;
}
