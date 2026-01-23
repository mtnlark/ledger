import { describe, it, expect } from 'vitest';
import { getUserAmount, getSpendingByCategory, getTotalSpent } from './spending';
import type { Transaction } from '$lib/db';

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
	return {
		date: new Date('2025-01-15'),
		merchant: 'Test Store',
		amount: 100,
		categoryId: 1,
		isShared: false,
		splitType: 'percentage',
		splitValue: 50,
		partnerShare: 0,
		isSettled: false,
		isEssential: false,
		isSubscription: false,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides
	};
}

describe('getUserAmount', () => {
	it('returns full amount for non-shared transaction', () => {
		const tx = makeTx({ amount: 100, isShared: false });
		expect(getUserAmount(tx)).toBe(100);
	});

	it('returns user portion for shared transaction', () => {
		const tx = makeTx({ amount: 100, isShared: true, partnerShare: 40 });
		expect(getUserAmount(tx)).toBe(60);
	});

	it('returns 0 when partner covers full amount', () => {
		const tx = makeTx({ amount: 50, isShared: true, partnerShare: 50 });
		expect(getUserAmount(tx)).toBe(0);
	});
});

describe('getSpendingByCategory', () => {
	it('returns empty map for no transactions', () => {
		expect(getSpendingByCategory([])).toEqual(new Map());
	});

	it('groups spending by categoryId', () => {
		const txs = [
			makeTx({ categoryId: 1, amount: 50 }),
			makeTx({ categoryId: 2, amount: 30 }),
			makeTx({ categoryId: 1, amount: 20 })
		];

		const result = getSpendingByCategory(txs);
		expect(result.get(1)).toBe(70);
		expect(result.get(2)).toBe(30);
	});

	it('uses user portion for shared transactions', () => {
		const txs = [
			makeTx({ categoryId: 1, amount: 100, isShared: true, partnerShare: 40 }),
			makeTx({ categoryId: 1, amount: 50, isShared: false })
		];

		const result = getSpendingByCategory(txs);
		expect(result.get(1)).toBe(110); // 60 + 50
	});
});

describe('getTotalSpent', () => {
	it('returns 0 for no transactions', () => {
		expect(getTotalSpent([])).toBe(0);
	});

	it('sums user amounts across all transactions', () => {
		const txs = [
			makeTx({ amount: 50 }),
			makeTx({ amount: 30 }),
			makeTx({ amount: 20, isShared: true, partnerShare: 10 })
		];

		expect(getTotalSpent(txs)).toBe(90); // 50 + 30 + 10
	});
});
