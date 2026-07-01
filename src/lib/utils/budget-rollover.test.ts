import { describe, it, expect } from 'vitest';
import { baseFromEffective, computeEffectiveBudgets } from './budget-rollover';
import type { CategoryBudget } from '$lib/db';

function row(month: string, categoryId: number, budgetAmount: number, rollsOver?: boolean): CategoryBudget {
	return { month, categoryId, budgetAmount, rollsOver, createdAt: new Date(), updatedAt: new Date() } as CategoryBudget;
}

function spendMap(entries: Array<[string, number, number]>): Map<string, Map<number, number>> {
	const m = new Map<string, Map<number, number>>();
	for (const [month, categoryId, amount] of entries) {
		if (!m.has(month)) m.set(month, new Map());
		m.get(month)!.set(categoryId, amount);
	}
	return m;
}

describe('computeEffectiveBudgets', () => {
	it('returns base budgets when there is no history', () => {
		const result = computeEffectiveBudgets([row('2026-06', 1, 200)], spendMap([]), '2026-06');
		expect(result.byCategory.get(1)).toMatchObject({ base: 200, carryover: 0, effective: 200, rollsOver: false });
		expect(result.deficitCarried).toBe(0);
		expect(result.carryoverTotal).toBe(0);
		expect(result.effectiveTotal).toBe(200);
		expect(result.prevMonth).toBe('2026-05');
	});

	it('carries a surplus from a rollover month into the same category', () => {
		const budgets = [row('2026-05', 1, 200, true), row('2026-06', 1, 200, true)];
		const spending = spendMap([['2026-05', 1, 150]]);
		const result = computeEffectiveBudgets(budgets, spending, '2026-06');
		expect(result.byCategory.get(1)).toMatchObject({ base: 200, carryover: 50, effective: 250 });
		expect(result.carryoverTotal).toBe(50);
		expect(result.effectiveTotal).toBe(250);
	});

	it('chains surpluses across consecutive rollover months', () => {
		const budgets = [row('2026-04', 1, 200, true), row('2026-05', 1, 200, true), row('2026-06', 1, 200, true)];
		// April: 200 - 100 = 100 surplus; May effective 300, spent 250 → 50 surplus
		const spending = spendMap([['2026-04', 1, 100], ['2026-05', 1, 250]]);
		const result = computeEffectiveBudgets(budgets, spending, '2026-06');
		expect(result.byCategory.get(1)).toMatchObject({ carryover: 50, effective: 250 });
	});

	it('does not carry when the prior month has rollsOver off (or undefined)', () => {
		const budgets = [row('2026-05', 1, 200), row('2026-06', 1, 200, true)];
		const spending = spendMap([['2026-05', 1, 100]]);
		const result = computeEffectiveBudgets(budgets, spending, '2026-06');
		expect(result.byCategory.get(1)!.carryover).toBe(0);
	});

	it('breaks the chain on a month with no budget row', () => {
		// April surplus, no May row, June budget — gap resets carryover
		const budgets = [row('2026-04', 1, 200, true), row('2026-06', 1, 200, true)];
		const spending = spendMap([['2026-04', 1, 50]]);
		const result = computeEffectiveBudgets(budgets, spending, '2026-06');
		expect(result.byCategory.get(1)!.carryover).toBe(0);
	});

	it('routes overspend to the month-level pool, not the category', () => {
		const budgets = [row('2026-05', 1, 200, true), row('2026-06', 1, 200, true), row('2026-06', 2, 100)];
		const spending = spendMap([['2026-05', 1, 260]]);
		const result = computeEffectiveBudgets(budgets, spending, '2026-06');
		// Category keeps its full base budget
		expect(result.byCategory.get(1)).toMatchObject({ base: 200, carryover: 0, effective: 200 });
		// Deficit hits the pool: (200 + 100) - 60
		expect(result.deficitCarried).toBe(60);
		expect(result.effectiveTotal).toBe(240);
	});

	it('gives deficits one-month memory only', () => {
		// April overspend on a rollover row; May clean; June pool unaffected
		const budgets = [row('2026-04', 1, 200, true), row('2026-05', 1, 200, true), row('2026-06', 1, 200, true)];
		const spending = spendMap([['2026-04', 1, 300], ['2026-05', 1, 200]]);
		const result = computeEffectiveBudgets(budgets, spending, '2026-06');
		expect(result.deficitCarried).toBe(0);
	});

	it('counts a prior-month deficit even if the category has no budget this month', () => {
		const budgets = [row('2026-05', 1, 200, true), row('2026-06', 2, 100)];
		const spending = spendMap([['2026-05', 1, 250]]);
		const result = computeEffectiveBudgets(budgets, spending, '2026-06');
		expect(result.byCategory.has(1)).toBe(false);
		expect(result.deficitCarried).toBe(50);
		expect(result.effectiveTotal).toBe(50); // 100 - 50
	});

	it('ignores overspend on non-rollover rows (current behavior preserved)', () => {
		const budgets = [row('2026-05', 1, 200), row('2026-06', 1, 200)];
		const spending = spendMap([['2026-05', 1, 500]]);
		const result = computeEffectiveBudgets(budgets, spending, '2026-06');
		expect(result.deficitCarried).toBe(0);
		expect(result.byCategory.get(1)!.effective).toBe(200);
	});

	it('handles mixed surplus and deficit across categories', () => {
		const budgets = [
			row('2026-05', 1, 200, true), row('2026-05', 2, 100, true),
			row('2026-06', 1, 200, true), row('2026-06', 2, 100, true)
		];
		const spending = spendMap([['2026-05', 1, 150], ['2026-05', 2, 130]]);
		const result = computeEffectiveBudgets(budgets, spending, '2026-06');
		expect(result.byCategory.get(1)).toMatchObject({ carryover: 50, effective: 250 });
		expect(result.byCategory.get(2)).toMatchObject({ carryover: 0, effective: 100 });
		expect(result.deficitCarried).toBe(30);
		expect(result.carryoverTotal).toBe(50);
		expect(result.effectiveTotal).toBe(320); // 250 + 100 - 30
	});

	it('clips the chain at maxChainMonths', () => {
		// Surplus two months back, but cap of 1 only sees the previous month
		const budgets = [row('2026-04', 1, 200, true), row('2026-05', 1, 200, true), row('2026-06', 1, 200, true)];
		const spending = spendMap([['2026-04', 1, 0], ['2026-05', 1, 200]]);
		const result = computeEffectiveBudgets(budgets, spending, '2026-06', { maxChainMonths: 1 });
		// April's 200 surplus is outside the window; May spent its full base → nothing carries
		expect(result.byCategory.get(1)!.carryover).toBe(0);
	});

	it('crosses year boundaries and rounds currency', () => {
		const budgets = [row('2025-12', 1, 100.1, true), row('2026-01', 1, 100, true)];
		const spending = spendMap([['2025-12', 1, 33.33]]);
		const result = computeEffectiveBudgets(budgets, spending, '2026-01');
		expect(result.prevMonth).toBe('2025-12');
		expect(result.byCategory.get(1)).toMatchObject({ carryover: 66.77, effective: 166.77 });
	});
});

describe('baseFromEffective', () => {
	it('subtracts the carryover from the desired month total', () => {
		expect(baseFromEffective(500, 150)).toBe(350);
	});

	it('clamps to zero when the total is at or below the carryover', () => {
		expect(baseFromEffective(100, 150)).toBe(0);
		expect(baseFromEffective(150, 150)).toBe(0);
	});

	it('is a passthrough with no carryover', () => {
		expect(baseFromEffective(500, 0)).toBe(500);
	});

	it('rounds currency', () => {
		expect(baseFromEffective(500.005, 100)).toBe(400.01);
	});
});
