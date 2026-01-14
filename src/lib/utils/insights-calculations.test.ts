import { describe, it, expect } from 'vitest';
import type { Transaction, MonthlyBudget } from '$lib/db';
import {
	getSpendingByCategory,
	getUserAmount,
	calculateCategoryAverages,
	detectAnomalies,
	calculatePaceProjection,
	calculateNeedsVsWants,
	calculateVelocityComparison,
	getTopMerchant
} from './insights-calculations';

// Helper to create mock transactions
function createMockTransaction(overrides: Partial<Transaction> = {}): Transaction {
	return {
		id: 1,
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
	} as Transaction;
}

describe('insights-calculations', () => {
	describe('getUserAmount', () => {
		it('returns full amount for non-shared transaction', () => {
			const tx = createMockTransaction({ amount: 100, isShared: false });
			expect(getUserAmount(tx)).toBe(100);
		});

		it('returns user portion for shared transaction', () => {
			const tx = createMockTransaction({ amount: 100, isShared: true, partnerShare: 50 });
			expect(getUserAmount(tx)).toBe(50);
		});
	});

	describe('getSpendingByCategory', () => {
		it('sums spending by category', () => {
			const transactions = [
				createMockTransaction({ categoryId: 1, amount: 50 }),
				createMockTransaction({ categoryId: 1, amount: 30 }),
				createMockTransaction({ categoryId: 2, amount: 75 })
			];

			const result = getSpendingByCategory(transactions);

			expect(result.get(1)).toBe(80);
			expect(result.get(2)).toBe(75);
		});

		it('handles shared transactions correctly', () => {
			const transactions = [
				createMockTransaction({ categoryId: 1, amount: 100, isShared: true, partnerShare: 50 })
			];

			const result = getSpendingByCategory(transactions);

			expect(result.get(1)).toBe(50);
		});

		it('returns empty map for no transactions', () => {
			const result = getSpendingByCategory([]);
			expect(result.size).toBe(0);
		});
	});

	describe('calculateCategoryAverages', () => {
		it('calculates average spending per category', () => {
			const monthlySpending: Map<string, Map<number, number>> = new Map([
				['2024-10', new Map([[1, 100], [2, 200]])],
				['2024-11', new Map([[1, 150], [2, 250]])],
				['2024-12', new Map([[1, 200], [2, 300]])]
			]);

			const result = calculateCategoryAverages(monthlySpending, ['2024-10', '2024-11', '2024-12']);

			expect(result.get(1)).toBe(150); // (100 + 150 + 200) / 3
			expect(result.get(2)).toBe(250); // (200 + 250 + 300) / 3
		});

		it('returns empty map when no months provided', () => {
			const result = calculateCategoryAverages(new Map(), []);
			expect(result.size).toBe(0);
		});

		it('handles categories not present in all months', () => {
			const monthlySpending: Map<string, Map<number, number>> = new Map([
				['2024-10', new Map([[1, 100]])],
				['2024-11', new Map([[1, 200], [2, 150]])]
			]);

			const result = calculateCategoryAverages(monthlySpending, ['2024-10', '2024-11']);

			expect(result.get(1)).toBe(150);
			expect(result.get(2)).toBe(75); // 150 / 2 (only in one month, but divided by total months)
		});
	});

	describe('detectAnomalies', () => {
		it('detects spending significantly above average', () => {
			const currentSpending = new Map([[1, 300]]);
			const averages = new Map([[1, 100]]);
			const categories = [{ id: 1, name: 'Groceries' }];
			const minAverage = 10;
			const ratioThreshold = 1.5;
			const maxToShow = 3;

			const result = detectAnomalies(
				currentSpending,
				averages,
				categories,
				minAverage,
				ratioThreshold,
				maxToShow
			);

			expect(result.length).toBe(1);
			expect(result[0].name).toBe('Groceries');
			expect(result[0].ratio).toBe(3);
		});

		it('ignores categories below ratio threshold', () => {
			const currentSpending = new Map([[1, 120]]);
			const averages = new Map([[1, 100]]);
			const categories = [{ id: 1, name: 'Groceries' }];

			const result = detectAnomalies(currentSpending, averages, categories, 10, 1.5, 3);

			expect(result.length).toBe(0);
		});

		it('ignores categories with low average (no historical data)', () => {
			const currentSpending = new Map([[1, 500]]);
			const averages = new Map([[1, 5]]); // Below minAverage threshold
			const categories = [{ id: 1, name: 'New Category' }];

			const result = detectAnomalies(currentSpending, averages, categories, 10, 1.5, 3);

			expect(result.length).toBe(0);
		});

		it('sorts by ratio and limits results', () => {
			const currentSpending = new Map([
				[1, 300], // 3x average
				[2, 400], // 4x average
				[3, 200]  // 2x average
			]);
			const averages = new Map([
				[1, 100],
				[2, 100],
				[3, 100]
			]);
			const categories = [
				{ id: 1, name: 'Cat1' },
				{ id: 2, name: 'Cat2' },
				{ id: 3, name: 'Cat3' }
			];

			const result = detectAnomalies(currentSpending, averages, categories, 10, 1.5, 2);

			expect(result.length).toBe(2);
			expect(result[0].name).toBe('Cat2'); // Highest ratio
			expect(result[1].name).toBe('Cat1');
		});
	});

	describe('calculatePaceProjection', () => {
		it('calculates projection based on current spending rate', () => {
			const budget: MonthlyBudget = {
				id: 1,
				month: '2025-01',
				income: 5000,
				savedAmount: 1000
			};

			// Spent $1000 in 10 days, 30 days in month
			const result = calculatePaceProjection(1000, budget, 10, 30);

			expect(result).not.toBeNull();
			expect(result!.projected).toBe(3000); // $100/day * 30 days
			expect(result!.available).toBe(4000); // $5000 - $1000
			expect(result!.isOverBudget).toBe(false);
		});

		it('detects over budget projection', () => {
			const budget: MonthlyBudget = {
				id: 1,
				month: '2025-01',
				income: 2000,
				savedAmount: 500
			};

			// Spent $1000 in 10 days → projected $3000
			const result = calculatePaceProjection(1000, budget, 10, 30);

			expect(result!.isOverBudget).toBe(true);
			expect(result!.projected).toBe(3000);
		});

		it('returns null when no budget', () => {
			const result = calculatePaceProjection(1000, null, 10, 30);
			expect(result).toBeNull();
		});

		it('returns null on day 0', () => {
			const budget: MonthlyBudget = {
				id: 1,
				month: '2025-01',
				income: 5000,
				savedAmount: 1000
			};

			const result = calculatePaceProjection(0, budget, 0, 30);
			expect(result).toBeNull();
		});
	});

	describe('calculateNeedsVsWants', () => {
		it('calculates needs vs wants percentage', () => {
			const transactions = [
				createMockTransaction({ amount: 60, isEssential: true }),
				createMockTransaction({ amount: 40, isEssential: false })
			];

			const result = calculateNeedsVsWants(transactions);

			expect(result).not.toBeNull();
			expect(result!.needsPercent).toBe(60);
			expect(result!.needsTotal).toBe(60);
			expect(result!.wantsTotal).toBe(40);
		});

		it('handles shared transactions', () => {
			const transactions = [
				createMockTransaction({ amount: 100, isShared: true, partnerShare: 50, isEssential: true }),
				createMockTransaction({ amount: 50, isEssential: false })
			];

			const result = calculateNeedsVsWants(transactions);

			expect(result!.needsTotal).toBe(50);
			expect(result!.wantsTotal).toBe(50);
			expect(result!.needsPercent).toBe(50);
		});

		it('returns null for empty transactions', () => {
			const result = calculateNeedsVsWants([]);
			expect(result).toBeNull();
		});
	});

	describe('calculateVelocityComparison', () => {
		it('calculates percentage difference in daily spending', () => {
			// Current: $300 over 10 days = $30/day
			// Previous: $600 over 30 days = $20/day
			// 50% increase
			const result = calculateVelocityComparison(300, 600, 10, 30, 10);

			expect(result).not.toBeNull();
			expect(result!.percentChange).toBe(50);
			expect(result!.isUp).toBe(true);
		});

		it('detects spending decrease', () => {
			// Current: $200 over 20 days = $10/day
			// Previous: $600 over 30 days = $20/day
			// -50% change
			const result = calculateVelocityComparison(200, 600, 20, 30, 10);

			expect(result!.percentChange).toBe(-50);
			expect(result!.isUp).toBe(false);
		});

		it('returns null when below threshold', () => {
			// Very small change
			const result = calculateVelocityComparison(100, 300, 10, 30, 10);
			expect(result).toBeNull(); // 0% change, below threshold
		});

		it('returns null when previous spending is zero', () => {
			const result = calculateVelocityComparison(100, 0, 10, 30, 10);
			expect(result).toBeNull();
		});

		it('returns null on day 0', () => {
			const result = calculateVelocityComparison(0, 600, 0, 30, 10);
			expect(result).toBeNull();
		});
	});

	describe('getTopMerchant', () => {
		it('finds most frequent merchant', () => {
			const transactions = [
				createMockTransaction({ merchant: 'Starbucks' }),
				createMockTransaction({ merchant: 'Starbucks' }),
				createMockTransaction({ merchant: 'Starbucks' }),
				createMockTransaction({ merchant: 'Target' }),
				createMockTransaction({ merchant: 'Target' })
			];

			const result = getTopMerchant(transactions, 3);

			expect(result).not.toBeNull();
			expect(result!.merchant).toBe('Starbucks');
			expect(result!.count).toBe(3);
		});

		it('returns null when below minimum visits', () => {
			const transactions = [
				createMockTransaction({ merchant: 'Store A' }),
				createMockTransaction({ merchant: 'Store B' })
			];

			const result = getTopMerchant(transactions, 3);
			expect(result).toBeNull();
		});

		it('returns null for empty transactions', () => {
			const result = getTopMerchant([], 1);
			expect(result).toBeNull();
		});
	});
});
