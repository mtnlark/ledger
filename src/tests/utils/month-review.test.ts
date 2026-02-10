import { describe, it, expect } from 'vitest';
import { computeMostVisitedMerchant } from '$lib/insights/calculations/month-review';
import type { Transaction } from '$lib/db';

/** Minimal transaction factory */
function makeTx(
	overrides: Partial<Transaction> & Pick<Transaction, 'merchant'>
): Transaction {
	return {
		date: new Date('2025-01-15'),
		amount: 10,
		categoryId: 1,
		isShared: false,
		splitType: 'percentage',
		splitValue: 100,
		partnerShare: 0,
		isSettled: false,
		isEssential: false,
		isSubscription: false,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides
	};
}

describe('computeMostVisitedMerchant - split transaction dedup', () => {
	it('does not inflate count for split children', () => {
		const txs = [
			// Split children from one Target visit
			makeTx({ merchant: 'Target', parentTransactionId: 100, categoryId: 1 }),
			makeTx({ merchant: 'Target', parentTransactionId: 100, categoryId: 2 }),
			makeTx({ merchant: 'Target', parentTransactionId: 100, categoryId: 3 }),
			// Two real Costco visits
			makeTx({ merchant: 'Costco' }),
			makeTx({ merchant: 'Costco' })
		];
		const result = computeMostVisitedMerchant(txs);
		// Target = 1 visit (deduped), Costco = 2 visits
		expect(result).toEqual({ merchant: 'Costco', count: 2 });
	});

	it('returns null when split dedup brings count below threshold', () => {
		const txs = [
			// Looks like 3 visits but it's 1 after dedup
			makeTx({ merchant: 'Target', parentTransactionId: 100, categoryId: 1 }),
			makeTx({ merchant: 'Target', parentTransactionId: 100, categoryId: 2 }),
			makeTx({ merchant: 'Target', parentTransactionId: 100, categoryId: 3 })
		];
		const result = computeMostVisitedMerchant(txs);
		expect(result).toBeNull();
	});

	it('preserves original casing in result', () => {
		const txs = [
			makeTx({ merchant: 'Trader Joe\'s' }),
			makeTx({ merchant: 'Trader Joe\'s' }),
			makeTx({ merchant: 'trader joe\'s' })
		];
		const result = computeMostVisitedMerchant(txs);
		expect(result).toEqual({ merchant: 'Trader Joe\'s', count: 3 });
	});

	it('handles mix of split and non-split correctly', () => {
		const txs = [
			// Regular visit
			makeTx({ merchant: 'Target' }),
			// Split visit (counts as 1)
			makeTx({ merchant: 'Target', parentTransactionId: 100, categoryId: 1 }),
			makeTx({ merchant: 'Target', parentTransactionId: 100, categoryId: 2 }),
			// One Costco visit
			makeTx({ merchant: 'Costco' })
		];
		const result = computeMostVisitedMerchant(txs);
		// Target: 2 visits (1 regular + 1 split), Costco: 1
		expect(result).toEqual({ merchant: 'Target', count: 2 });
	});
});
