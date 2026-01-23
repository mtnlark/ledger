import { describe, it, expect } from 'vitest';
import { calculatePaceProjection } from './pace-projection';
import type { MonthlyBudget } from '$lib/db';

const budget: MonthlyBudget = {
	month: '2025-01',
	income: 5000,
	savedAmount: 1000
};

describe('calculatePaceProjection', () => {
	it('returns null when no budget', () => {
		const result = calculatePaceProjection(500, null, 15, 31);
		expect(result).toBeNull();
	});

	it('returns null when currentDay is 0', () => {
		const result = calculatePaceProjection(500, budget, 0, 31);
		expect(result).toBeNull();
	});

	it('projects under budget correctly', () => {
		// $1000 spent in 15 days -> ~$66.67/day -> projected ~$2067
		// Available: $5000 - $1000 = $4000
		const result = calculatePaceProjection(1000, budget, 15, 31);
		expect(result).not.toBeNull();
		expect(result!.projected).toBe(2067); // 1000 + (1000/15) * 16 ≈ 2067
		expect(result!.available).toBe(4000);
		expect(result!.isOverBudget).toBe(false);
	});

	it('detects over-budget projection', () => {
		// $3000 spent in 10 days -> $300/day -> projected $9300
		// Available: $4000
		const result = calculatePaceProjection(3000, budget, 10, 31);
		expect(result).not.toBeNull();
		expect(result!.isOverBudget).toBe(true);
		expect(result!.projected).toBe(9300); // 3000 + 300*21
	});

	it('calculates percent of budget', () => {
		const result = calculatePaceProjection(2000, budget, 20, 30);
		// 2000/20 = $100/day, projected = 2000 + 100*10 = 3000
		// available = 4000, percent = 3000/4000*100 = 75%
		expect(result!.percentOfBudget).toBe(75);
	});

	it('handles zero available gracefully', () => {
		const zeroBudget: MonthlyBudget = { month: '2025-01', income: 0, savedAmount: 0 };
		const result = calculatePaceProjection(100, zeroBudget, 10, 30);
		expect(result!.percentOfBudget).toBe(0);
	});
});
