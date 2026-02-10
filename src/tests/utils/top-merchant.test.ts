import { describe, it, expect } from 'vitest';
import { countMerchantVisits, getTopMerchant } from '$lib/insights/calculations/top-merchant';
import type { Transaction } from '$lib/db';

/** Minimal transaction factory for testing */
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

describe('countMerchantVisits', () => {
	it('counts regular transactions normally', () => {
		const txs = [
			makeTx({ merchant: 'Target' }),
			makeTx({ merchant: 'Target' }),
			makeTx({ merchant: 'Costco' })
		];
		const visits = countMerchantVisits(txs);
		expect(visits.get('Target')).toBe(2);
		expect(visits.get('Costco')).toBe(1);
	});

	it('counts split children with same parentTransactionId as one visit', () => {
		const txs = [
			makeTx({ merchant: 'Target', parentTransactionId: 100, categoryId: 1 }),
			makeTx({ merchant: 'Target', parentTransactionId: 100, categoryId: 2 }),
			makeTx({ merchant: 'Target', parentTransactionId: 100, categoryId: 3 })
		];
		const visits = countMerchantVisits(txs);
		expect(visits.get('Target')).toBe(1);
	});

	it('counts split children from different parents as separate visits', () => {
		const txs = [
			makeTx({ merchant: 'Target', parentTransactionId: 100 }),
			makeTx({ merchant: 'Target', parentTransactionId: 100 }),
			makeTx({ merchant: 'Target', parentTransactionId: 200 }),
			makeTx({ merchant: 'Target', parentTransactionId: 200 })
		];
		const visits = countMerchantVisits(txs);
		expect(visits.get('Target')).toBe(2);
	});

	it('handles mix of split and non-split transactions', () => {
		const txs = [
			// Regular visit
			makeTx({ merchant: 'Target' }),
			// Split visit (counts as 1)
			makeTx({ merchant: 'Target', parentTransactionId: 100, categoryId: 1 }),
			makeTx({ merchant: 'Target', parentTransactionId: 100, categoryId: 2 }),
			// Another regular visit
			makeTx({ merchant: 'Target' })
		];
		const visits = countMerchantVisits(txs);
		expect(visits.get('Target')).toBe(3);
	});

	it('applies normalizeKey for case-insensitive grouping', () => {
		const txs = [
			makeTx({ merchant: 'Target' }),
			makeTx({ merchant: 'TARGET' }),
			makeTx({ merchant: 'target' })
		];
		const visits = countMerchantVisits(txs, (m) => m.toLowerCase());
		expect(visits.get('target')).toBe(3);
	});

	it('returns empty map for empty input', () => {
		const visits = countMerchantVisits([]);
		expect(visits.size).toBe(0);
	});
});

describe('getTopMerchant', () => {
	it('does not inflate count from split children', () => {
		const txs = [
			// 3 split children from one visit
			makeTx({ merchant: 'Target', parentTransactionId: 100, categoryId: 1 }),
			makeTx({ merchant: 'Target', parentTransactionId: 100, categoryId: 2 }),
			makeTx({ merchant: 'Target', parentTransactionId: 100, categoryId: 3 }),
			// 2 genuine visits to Costco
			makeTx({ merchant: 'Costco' }),
			makeTx({ merchant: 'Costco' })
		];
		const result = getTopMerchant(txs);
		// Target has 1 visit (split deduped), Costco has 2
		expect(result).toEqual({ merchant: 'Costco', count: 2 });
	});

	it('returns null when split dedup brings count below threshold', () => {
		const txs = [
			// Looks like 3 visits but it's really 1
			makeTx({ merchant: 'Target', parentTransactionId: 100, categoryId: 1 }),
			makeTx({ merchant: 'Target', parentTransactionId: 100, categoryId: 2 }),
			makeTx({ merchant: 'Target', parentTransactionId: 100, categoryId: 3 })
		];
		const result = getTopMerchant(txs, 2);
		expect(result).toBeNull();
	});
});
