import { describe, it, expect } from 'vitest';
import { calculatePaceProjection } from './pace-projection';
import type { MonthlyBudget } from '$lib/db';

const budget: MonthlyBudget = {
	month: '2025-01',
	income: 5000,
	savedAmount: 0 // Deprecated field, not used in calculation
};

// Savings from contributions that affect available (bank_transfer, other)
const savedFromContributions = 1000;

describe('calculatePaceProjection', () => {
	it('returns null when no budget', () => {
		const result = calculatePaceProjection(500, null, 0, 15, 31);
		expect(result).toBeNull();
	});

	it('returns null when currentDay is 0', () => {
		const result = calculatePaceProjection(500, budget, savedFromContributions, 0, 31);
		expect(result).toBeNull();
	});

	it('projects under budget correctly', () => {
		// $1000 spent in 15 days -> ~$66.67/day -> projected ~$2067
		// Available: $5000 - $1000 = $4000
		const result = calculatePaceProjection(1000, budget, savedFromContributions, 15, 31);
		expect(result).not.toBeNull();
		expect(result!.projected).toBe(2067); // 1000 + (1000/15) * 16 ≈ 2067
		expect(result!.available).toBe(4000);
		expect(result!.isOverBudget).toBe(false);
	});

	it('detects over-budget projection', () => {
		// $3000 spent in 10 days -> $300/day -> projected $9300
		// Available: $4000
		const result = calculatePaceProjection(3000, budget, savedFromContributions, 10, 31);
		expect(result).not.toBeNull();
		expect(result!.isOverBudget).toBe(true);
		expect(result!.projected).toBe(9300); // 3000 + 300*21
	});

	it('calculates percent of budget', () => {
		const result = calculatePaceProjection(2000, budget, savedFromContributions, 20, 30);
		// 2000/20 = $100/day, projected = 2000 + 100*10 = 3000
		// available = 4000, percent = 3000/4000*100 = 75%
		expect(result!.percentOfBudget).toBe(75);
	});

	it('handles zero available gracefully', () => {
		const zeroBudget: MonthlyBudget = { month: '2025-01', income: 0, savedAmount: 0 };
		const result = calculatePaceProjection(100, zeroBudget, 0, 10, 30);
		expect(result!.percentOfBudget).toBe(0);
	});

	describe('early-month suppression (minMonthFraction)', () => {
		it('does not suppress when minMonthFraction is omitted (default 0)', () => {
			// Day 1 of the month would normally extrapolate wildly, but with no fraction
			// the projection is still returned (backward-compatible default).
			const result = calculatePaceProjection(500, budget, savedFromContributions, 1, 30);
			expect(result).not.toBeNull();
		});

		it('returns null before the fraction cutoff', () => {
			// 30-day month, 0.25 -> ceil(7.5) = day 8. Day 5 is below the cutoff.
			const result = calculatePaceProjection(900, budget, savedFromContributions, 5, 30, 0.25);
			expect(result).toBeNull();
		});

		it('returns a projection once the cutoff day is reached', () => {
			// 30-day month, 0.25 -> day 8. Day 8 is the first day shown.
			const result = calculatePaceProjection(1150, budget, savedFromContributions, 8, 30, 0.25);
			expect(result).not.toBeNull();
		});

		it('adapts the cutoff to month length (February)', () => {
			// 28-day month, 0.25 -> ceil(7) = day 7.
			expect(calculatePaceProjection(800, budget, savedFromContributions, 6, 28, 0.25)).toBeNull();
			expect(calculatePaceProjection(800, budget, savedFromContributions, 7, 28, 0.25)).not.toBeNull();
		});

		it('adapts the cutoff to month length (31-day month)', () => {
			// 31-day month, 0.25 -> ceil(7.75) = day 8.
			expect(calculatePaceProjection(800, budget, savedFromContributions, 7, 31, 0.25)).toBeNull();
			expect(calculatePaceProjection(800, budget, savedFromContributions, 8, 31, 0.25)).not.toBeNull();
		});
	});

	it('uses savedFromContributions instead of budget.savedAmount', () => {
		// Budget with deprecated savedAmount field (should be ignored)
		const budgetWithOldField: MonthlyBudget = {
			month: '2025-01',
			income: 5000,
			savedAmount: 9999 // This should NOT be used
		};
		// savedFromContributions = 1000, so available = 5000 - 1000 = 4000
		const result = calculatePaceProjection(1000, budgetWithOldField, 1000, 15, 31);
		expect(result!.available).toBe(4000); // Uses savedFromContributions, not budget.savedAmount
	});
});
