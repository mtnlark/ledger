import { describe, it, expect } from 'vitest';
import {
	calculateBudgetAlerts,
	APPROACHING_THRESHOLD,
	type CategoryBudgetData,
	type BudgetAlert
} from './budget-alerts';

describe('calculateBudgetAlerts', () => {
	const makeCategory = (
		name: string,
		budgetAmount: number,
		spent: number
	): CategoryBudgetData => ({
		categoryId: Math.random(),
		categoryName: name,
		categoryIcon: '📦',
		budgetAmount,
		spent
	});

	describe('alert type classification', () => {
		it('should return "over" alert when spent exceeds budget', () => {
			const alerts = calculateBudgetAlerts([makeCategory('Food', 100, 120)]);

			expect(alerts).toHaveLength(1);
			expect(alerts[0].type).toBe('over');
			expect(alerts[0].categoryName).toBe('Food');
			expect(alerts[0].amount).toBe(20);
		});

		it('should return "at" alert when spent equals budget exactly', () => {
			const alerts = calculateBudgetAlerts([makeCategory('Food', 100, 100)]);

			expect(alerts).toHaveLength(1);
			expect(alerts[0].type).toBe('at');
			expect(alerts[0].categoryName).toBe('Food');
			expect(alerts[0].amount).toBe(0);
		});

		it('should return "approaching" alert when within threshold but not at budget', () => {
			const alerts = calculateBudgetAlerts([makeCategory('Food', 100, 96)]);

			expect(alerts).toHaveLength(1);
			expect(alerts[0].type).toBe('approaching');
			expect(alerts[0].categoryName).toBe('Food');
			expect(alerts[0].amount).toBe(4);
		});

		it('should not return alert when well under budget', () => {
			const alerts = calculateBudgetAlerts([makeCategory('Food', 100, 50)]);

			expect(alerts).toHaveLength(0);
		});

		it('should not return alert when exactly at threshold boundary', () => {
			// $5 remaining is the threshold - should still show approaching
			const alerts = calculateBudgetAlerts([
				makeCategory('Food', 100, 100 - APPROACHING_THRESHOLD)
			]);

			expect(alerts).toHaveLength(1);
			expect(alerts[0].type).toBe('approaching');
		});

		it('should not return alert when well over threshold', () => {
			// $6 remaining (threshold is $5) - should not trigger alert
			const alerts = calculateBudgetAlerts([
				makeCategory('Food', 100, 100 - APPROACHING_THRESHOLD - 1)
			]);

			expect(alerts).toHaveLength(0);
		});
	});

	describe('floating point precision handling', () => {
		it('should treat tiny negative values as "at budget" not "over"', () => {
			// Simulate floating point error: spent is 100.000000001 instead of 100
			const alerts = calculateBudgetAlerts([makeCategory('Food', 100, 100.000000001)]);

			expect(alerts).toHaveLength(1);
			expect(alerts[0].type).toBe('at');
		});

		it('should treat tiny positive values as "at budget" not "approaching"', () => {
			// Simulate floating point error: spent is 99.999999999 instead of 100
			const alerts = calculateBudgetAlerts([makeCategory('Food', 100, 99.999999999)]);

			expect(alerts).toHaveLength(1);
			expect(alerts[0].type).toBe('at');
		});

		it('should treat small remaining (<$0.50) as "at" budget', () => {
			// $0.49 remaining rounds to $0, so it's "at budget" (not "approaching $0 left")
			const alerts = calculateBudgetAlerts([makeCategory('Food', 100, 99.51)]);

			expect(alerts).toHaveLength(1);
			expect(alerts[0].type).toBe('at');
		});

		it('should handle accumulated floating point errors from multiple transactions', () => {
			// Simulating: $33.33 + $33.33 + $33.34 should equal $100
			// But floating point might give us 99.99999999999999 or 100.00000000000001
			const spent = 33.33 + 33.33 + 33.34;
			const alerts = calculateBudgetAlerts([makeCategory('Food', 100, spent)]);

			expect(alerts).toHaveLength(1);
			expect(alerts[0].type).toBe('at');
		});

		it('should treat small overage (<$0.50) as "at" budget', () => {
			// $0.49 over rounds to $0, so it's "at budget" (not "$0 over")
			const alerts = calculateBudgetAlerts([makeCategory('Food', 100, 100.49)]);

			expect(alerts).toHaveLength(1);
			expect(alerts[0].type).toBe('at');
		});

		it('should correctly identify over budget when >= $0.50 over', () => {
			// $1 over is clearly over budget
			const alerts = calculateBudgetAlerts([makeCategory('Food', 100, 101)]);

			expect(alerts).toHaveLength(1);
			expect(alerts[0].type).toBe('over');
			expect(alerts[0].amount).toBeCloseTo(1);
		});

		it('should correctly identify approaching despite floating point', () => {
			// Clear $3 remaining should still be "approaching"
			const alerts = calculateBudgetAlerts([makeCategory('Food', 100, 97)]);

			expect(alerts).toHaveLength(1);
			expect(alerts[0].type).toBe('approaching');
			expect(alerts[0].amount).toBeCloseTo(3);
		});

		it('should handle decimal currency amounts correctly', () => {
			// Budget of $60.60 with exact spending
			const alerts = calculateBudgetAlerts([makeCategory('Food', 60.6, 60.6)]);

			expect(alerts).toHaveLength(1);
			expect(alerts[0].type).toBe('at');
		});

		it('should handle common problematic decimal: 0.1 + 0.2', () => {
			// Famous JS floating point issue: 0.1 + 0.2 = 0.30000000000000004
			const spent = 0.1 + 0.2;
			const alerts = calculateBudgetAlerts([makeCategory('Food', 0.3, spent)]);

			expect(alerts).toHaveLength(1);
			expect(alerts[0].type).toBe('at');
		});
	});

	describe('sorting', () => {
		it('should sort over alerts before at alerts', () => {
			const alerts = calculateBudgetAlerts([
				makeCategory('Zebra', 100, 100), // at
				makeCategory('Apple', 100, 120) // over
			]);

			expect(alerts).toHaveLength(2);
			expect(alerts[0].type).toBe('over');
			expect(alerts[0].categoryName).toBe('Apple');
			expect(alerts[1].type).toBe('at');
			expect(alerts[1].categoryName).toBe('Zebra');
		});

		it('should sort at alerts before approaching alerts', () => {
			const alerts = calculateBudgetAlerts([
				makeCategory('Zebra', 100, 97), // approaching
				makeCategory('Apple', 100, 100) // at
			]);

			expect(alerts).toHaveLength(2);
			expect(alerts[0].type).toBe('at');
			expect(alerts[0].categoryName).toBe('Apple');
			expect(alerts[1].type).toBe('approaching');
			expect(alerts[1].categoryName).toBe('Zebra');
		});

		it('should sort alphabetically within same type', () => {
			const alerts = calculateBudgetAlerts([
				makeCategory('Zebra', 100, 120),
				makeCategory('Apple', 100, 110),
				makeCategory('Mango', 100, 105)
			]);

			expect(alerts).toHaveLength(3);
			expect(alerts[0].categoryName).toBe('Apple');
			expect(alerts[1].categoryName).toBe('Mango');
			expect(alerts[2].categoryName).toBe('Zebra');
		});

		it('should handle full sorting with all three types', () => {
			const alerts = calculateBudgetAlerts([
				makeCategory('Cat', 100, 97), // approaching
				makeCategory('Bat', 100, 120), // over
				makeCategory('Ant', 100, 100), // at
				makeCategory('Dog', 100, 110), // over
				makeCategory('Eel', 100, 100), // at
				makeCategory('Fox', 100, 98) // approaching
			]);

			expect(alerts).toHaveLength(6);
			// Over: Bat, Dog
			expect(alerts[0]).toMatchObject({ type: 'over', categoryName: 'Bat' });
			expect(alerts[1]).toMatchObject({ type: 'over', categoryName: 'Dog' });
			// At: Ant, Eel
			expect(alerts[2]).toMatchObject({ type: 'at', categoryName: 'Ant' });
			expect(alerts[3]).toMatchObject({ type: 'at', categoryName: 'Eel' });
			// Approaching: Cat, Fox
			expect(alerts[4]).toMatchObject({ type: 'approaching', categoryName: 'Cat' });
			expect(alerts[5]).toMatchObject({ type: 'approaching', categoryName: 'Fox' });
		});
	});

	describe('edge cases', () => {
		it('should handle empty input', () => {
			const alerts = calculateBudgetAlerts([]);
			expect(alerts).toHaveLength(0);
		});

		it('should handle zero budget', () => {
			const alerts = calculateBudgetAlerts([makeCategory('Food', 0, 0)]);
			expect(alerts).toHaveLength(1);
			expect(alerts[0].type).toBe('at');
		});

		it('should handle zero budget with spending', () => {
			const alerts = calculateBudgetAlerts([makeCategory('Food', 0, 50)]);
			expect(alerts).toHaveLength(1);
			expect(alerts[0].type).toBe('over');
			expect(alerts[0].amount).toBe(50);
		});

		it('should preserve category icon in alert', () => {
			const data: CategoryBudgetData = {
				categoryId: 1,
				categoryName: 'Food',
				categoryIcon: '🍕',
				budgetAmount: 100,
				spent: 120
			};
			const alerts = calculateBudgetAlerts([data]);

			expect(alerts[0].categoryIcon).toBe('🍕');
		});
	});
});
