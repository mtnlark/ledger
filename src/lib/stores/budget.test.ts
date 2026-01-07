import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, initializeDatabase } from '$lib/db';
import {
	getBudgetForMonth,
	saveBudget,
	calculateCashFlow
} from './budget';

describe('MonthlyBudget Operations', () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
		await initializeDatabase();
	});

	afterEach(async () => {
		await db.delete();
	});

	describe('getBudgetForMonth', () => {
		it('returns null for month with no budget', async () => {
			const budget = await getBudgetForMonth('2025-12');
			expect(budget).toBeNull();
		});

		it('returns existing budget for month', async () => {
			// First save a budget
			await saveBudget('2025-12', {
				income: 7500,
				savedAmount: 1200
			});

			const budget = await getBudgetForMonth('2025-12');
			expect(budget).not.toBeNull();
			expect(budget?.income).toBe(7500);
			expect(budget?.savedAmount).toBe(1200);
		});
	});

	describe('saveBudget', () => {
		it('creates new budget for month', async () => {
			await saveBudget('2025-12', {
				income: 7657.54,
				savedAmount: 1135.76
			});

			const budget = await getBudgetForMonth('2025-12');
			expect(budget?.income).toBe(7657.54);
			expect(budget?.savedAmount).toBe(1135.76);
			expect(budget?.month).toBe('2025-12');
		});

		it('updates existing budget for month', async () => {
			// Create initial budget
			await saveBudget('2025-12', {
				income: 7000,
				savedAmount: 1000
			});

			// Update it
			await saveBudget('2025-12', {
				income: 8000,
				savedAmount: 1500,
				notes: 'Got a raise!'
			});

			const budget = await getBudgetForMonth('2025-12');
			expect(budget?.income).toBe(8000);
			expect(budget?.savedAmount).toBe(1500);
			expect(budget?.notes).toBe('Got a raise!');
		});

		it('stores optional notes', async () => {
			await saveBudget('2025-12', {
				income: 7500,
				savedAmount: 1200,
				notes: 'Holiday bonus included'
			});

			const budget = await getBudgetForMonth('2025-12');
			expect(budget?.notes).toBe('Holiday bonus included');
		});

		it('handles multiple months independently', async () => {
			await saveBudget('2025-11', { income: 7000, savedAmount: 1000 });
			await saveBudget('2025-12', { income: 8000, savedAmount: 1500 });

			const nov = await getBudgetForMonth('2025-11');
			const dec = await getBudgetForMonth('2025-12');

			expect(nov?.income).toBe(7000);
			expect(dec?.income).toBe(8000);
		});
	});

	describe('calculateCashFlow', () => {
		it('calculates available correctly', () => {
			const result = calculateCashFlow(7657.54, 1135.76, 5161.46);

			expect(result.income).toBe(7657.54);
			expect(result.saved).toBe(1135.76);
			expect(result.available).toBeCloseTo(6521.78, 2);
		});

		it('calculates surplus correctly', () => {
			const result = calculateCashFlow(7657.54, 1135.76, 5161.46);

			expect(result.spent).toBe(5161.46);
			expect(result.surplus).toBeCloseTo(1360.32, 2);
		});

		it('handles negative surplus (overspending)', () => {
			const result = calculateCashFlow(5000, 500, 5500);

			expect(result.available).toBe(4500);
			expect(result.surplus).toBe(-1000);
			expect(result.isOverBudget).toBe(true);
		});

		it('handles zero values', () => {
			const result = calculateCashFlow(0, 0, 0);

			expect(result.available).toBe(0);
			expect(result.surplus).toBe(0);
			expect(result.isOverBudget).toBe(false);
		});

		it('calculates percentage spent', () => {
			const result = calculateCashFlow(10000, 2000, 4000);

			// Available is 8000, spent 4000 = 50%
			expect(result.percentSpent).toBe(50);
		});

		it('handles percentSpent when available is zero', () => {
			const result = calculateCashFlow(1000, 1000, 500);

			// Available is 0, so percentSpent should be 100 (or handle gracefully)
			expect(result.available).toBe(0);
			expect(result.percentSpent).toBe(100); // Cap at 100 when no budget
		});
	});
});
