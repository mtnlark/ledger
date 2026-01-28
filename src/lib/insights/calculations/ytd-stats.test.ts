import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeYTDStats } from './ytd-stats';
import type { Transaction } from '$lib/db';

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
	return {
		date: new Date(2025, 2, 15, 12, 0, 0),
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

describe('computeYTDStats', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		// Use local time constructor to avoid UTC/local timezone mismatch
		vi.setSystemTime(new Date(2025, 2, 20, 12, 0, 0));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns zero stats for no transactions', () => {
		const result = computeYTDStats([], 2025);
		expect(result.totalSpent).toBe(0);
		expect(result.spendDays).toBe(0);
		expect(result.dailyAvg).toBe(0);
		expect(result.biggestMonth).toBeNull();
		expect(result.topMerchant).toBeNull();
		expect(result.dailySpending.size).toBe(0);
	});

	it('filters transactions to specified year', () => {
		const txs = [
			makeTx({ date: new Date(2025, 0, 10, 12), amount: 50 }),
			makeTx({ date: new Date(2024, 11, 20, 12), amount: 200 }) // previous year
		];

		const result = computeYTDStats(txs, 2025);
		expect(result.totalSpent).toBe(50);
	});

	it('calculates total spent with user amounts', () => {
		const txs = [
			makeTx({ amount: 100 }),
			makeTx({ amount: 60, isShared: true, partnerShare: 20 })
		];

		const result = computeYTDStats(txs, 2025);
		expect(result.totalSpent).toBe(140); // 100 + 40
	});

	it('counts unique spend days', () => {
		const txs = [
			makeTx({ date: new Date(2025, 2, 1, 12) }),
			makeTx({ date: new Date(2025, 2, 1, 12) }), // same day
			makeTx({ date: new Date(2025, 2, 2, 12) })
		];

		const result = computeYTDStats(txs, 2025);
		expect(result.spendDays).toBe(2);
	});

	it('calculates no-spend days correctly', () => {
		// March 20 = day 79 of year
		const txs = [makeTx({ date: new Date(2025, 2, 15, 12) })];

		const result = computeYTDStats(txs, 2025);
		expect(result.daysInYearSoFar).toBe(79);
		expect(result.noSpendDays).toBe(78); // 79 - 1 spend day
	});

	it('finds biggest spending month', () => {
		const txs = [
			makeTx({ date: new Date(2025, 0, 10, 12), amount: 100 }),
			makeTx({ date: new Date(2025, 0, 20, 12), amount: 50 }),
			makeTx({ date: new Date(2025, 1, 10, 12), amount: 200 }),
			makeTx({ date: new Date(2025, 2, 5, 12), amount: 80 })
		];

		const result = computeYTDStats(txs, 2025);
		expect(result.biggestMonth?.label).toBe('February');
		expect(result.biggestMonth?.amount).toBe(200);
	});

	it('finds most frequent merchant', () => {
		const txs = [
			makeTx({ merchant: 'Costco' }),
			makeTx({ merchant: 'Costco' }),
			makeTx({ merchant: 'Costco' }),
			makeTx({ merchant: 'Target' }),
			makeTx({ merchant: 'Target' })
		];

		const result = computeYTDStats(txs, 2025);
		expect(result.topMerchant?.merchant).toBe('Costco');
		expect(result.topMerchant?.count).toBe(3);
	});

	it('builds daily spending map', () => {
		const txs = [
			makeTx({ date: new Date(2025, 2, 15, 12), amount: 50 }),
			makeTx({ date: new Date(2025, 2, 15, 12), amount: 30 }),
			makeTx({ date: new Date(2025, 2, 16, 12), amount: 25 })
		];

		const result = computeYTDStats(txs, 2025);
		expect(result.dailySpending.get('2025-03-15')).toBe(80);
		expect(result.dailySpending.get('2025-03-16')).toBe(25);
	});

	it('excludes future-dated transactions from spend days count', () => {
		// System time is March 20, 2025
		// Transaction on March 15 (past) and March 25 (future)
		const txs = [
			makeTx({ date: new Date(2025, 2, 15, 12) }), // past
			makeTx({ date: new Date(2025, 2, 25, 12) }) // future (5 days from now)
		];

		const result = computeYTDStats(txs, 2025);
		// Should only count the past transaction, not the future one
		expect(result.spendDays).toBe(1);
		expect(result.daysInYearSoFar).toBe(79); // March 20 = day 79
		expect(result.noSpendDays).toBe(78); // 79 - 1 = 78
	});
});
