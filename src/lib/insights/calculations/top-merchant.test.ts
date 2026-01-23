import { describe, it, expect } from 'vitest';
import { getTopMerchant } from './top-merchant';
import type { Transaction } from '$lib/db';

function makeTx(merchant: string): Transaction {
	return {
		date: new Date('2025-01-15'),
		merchant,
		amount: 50,
		categoryId: 1,
		isShared: false,
		splitType: 'percentage',
		splitValue: 50,
		partnerShare: 0,
		isSettled: false,
		isEssential: false,
		isSubscription: false,
		createdAt: new Date(),
		updatedAt: new Date()
	};
}

describe('getTopMerchant', () => {
	it('returns null for empty transactions', () => {
		expect(getTopMerchant([])).toBeNull();
	});

	it('returns null when no merchant meets minimum visits', () => {
		const txs = [makeTx('A'), makeTx('B'), makeTx('C')];
		expect(getTopMerchant(txs, 2)).toBeNull();
	});

	it('returns the most frequent merchant', () => {
		const txs = [
			makeTx('Trader Joe'),
			makeTx('Trader Joe'),
			makeTx('Trader Joe'),
			makeTx('Costco'),
			makeTx('Costco')
		];

		const result = getTopMerchant(txs, 2);
		expect(result).toEqual({ merchant: 'Trader Joe', count: 3 });
	});

	it('uses default minVisits of 2', () => {
		const txs = [makeTx('Only Once')];
		expect(getTopMerchant(txs)).toBeNull();

		const txs2 = [makeTx('Twice'), makeTx('Twice')];
		expect(getTopMerchant(txs2)).toEqual({ merchant: 'Twice', count: 2 });
	});
});
