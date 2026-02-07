import { describe, it, expect } from 'vitest';
import { calculateCashFlow } from '$lib/stores/budget';
import { calculateTotalSpent } from '$lib/utils/currency';
import type { Transaction } from '$lib/db';

/**
 * Helper to build a minimal transaction for testing total spent calculation.
 */
function makeTx(overrides: Partial<Transaction> = {}): Transaction {
	return {
		id: 1,
		date: new Date('2026-01-15'),
		merchant: 'Test',
		amount: 100,
		categoryId: 1,
		isShared: false,
		splitType: 'percentage',
		splitValue: 0.5,
		partnerShare: 0,
		isSettled: false,
		isEssential: false,
		isSubscription: false,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides
	};
}

describe('calculateTotalSpent', () => {
	it('sums personal transactions at full amount', () => {
		const txns = [
			makeTx({ amount: 50 }),
			makeTx({ amount: 30 })
		];
		expect(calculateTotalSpent(txns)).toBe(80);
	});

	it('counts only user share for shared transactions', () => {
		const txns = [
			makeTx({ amount: 100, isShared: true, partnerShare: 50 })
		];
		expect(calculateTotalSpent(txns)).toBe(50);
	});

	it('handles mix of shared and personal transactions', () => {
		const txns = [
			makeTx({ amount: 100, isShared: false, partnerShare: 0 }),
			makeTx({ amount: 60, isShared: true, partnerShare: 30 }),
			makeTx({ amount: 40, isShared: true, partnerShare: 20 })
		];
		// 100 + (60 - 30) + (40 - 20) = 100 + 30 + 20 = 150
		expect(calculateTotalSpent(txns)).toBe(150);
	});

	it('returns 0 for empty transaction list', () => {
		expect(calculateTotalSpent([])).toBe(0);
	});

	it('handles shared transaction where partner pays nothing', () => {
		const txns = [
			makeTx({ amount: 100, isShared: true, partnerShare: 0 })
		];
		expect(calculateTotalSpent(txns)).toBe(100);
	});

	it('handles shared transaction where partner pays everything', () => {
		const txns = [
			makeTx({ amount: 100, isShared: true, partnerShare: 100 })
		];
		expect(calculateTotalSpent(txns)).toBe(0);
	});
});

describe('calculateCashFlow edge cases', () => {
	it('basic cash flow: income minus savings and spending', () => {
		const result = calculateCashFlow(5000, 500, 3000);
		expect(result.available).toBe(4500);
		expect(result.surplus).toBe(1500);
		expect(result.isOverBudget).toBe(false);
	});

	it('zero income yields zero available and negative surplus', () => {
		const result = calculateCashFlow(0, 0, 100);
		expect(result.available).toBe(0);
		expect(result.surplus).toBe(-100);
		expect(result.isOverBudget).toBe(true);
		expect(result.percentSpent).toBe(100);
	});

	it('savings contributions reduce available amount', () => {
		const result = calculateCashFlow(5000, 2000, 2000);
		expect(result.available).toBe(3000);
		expect(result.surplus).toBe(1000);
		expect(result.isOverBudget).toBe(false);
	});

	it('negative surplus when spending exceeds available', () => {
		const result = calculateCashFlow(3000, 500, 3500);
		expect(result.available).toBe(2500);
		expect(result.surplus).toBe(-1000);
		expect(result.isOverBudget).toBe(true);
	});

	it('handles negative available (savings exceed income)', () => {
		const result = calculateCashFlow(1000, 1500, 0);
		expect(result.available).toBe(-500);
		// When available is <= 0, percentSpent caps at 100
		expect(result.percentSpent).toBe(100);
	});

	it('percentSpent handles exact spending matching available', () => {
		const result = calculateCashFlow(5000, 1000, 4000);
		expect(result.available).toBe(4000);
		expect(result.percentSpent).toBe(100);
		expect(result.isOverBudget).toBe(false);
	});

	it('percentSpent with fractional values', () => {
		const result = calculateCashFlow(10000, 2000, 4000);
		// available = 8000, spent = 4000, 50%
		expect(result.percentSpent).toBe(50);
	});

	it('all zeros is valid (no income, no spending)', () => {
		const result = calculateCashFlow(0, 0, 0);
		expect(result.available).toBe(0);
		expect(result.surplus).toBe(0);
		expect(result.isOverBudget).toBe(false);
	});
});
