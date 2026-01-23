import { describe, it, expect } from 'vitest';
import { computeTopCategoryShift, computeCategoryDeepDiveShift } from './category-shift';
import type { Transaction, Category } from '$lib/db';

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
	return {
		date: new Date('2025-01-15'),
		merchant: 'Test',
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

const categories: Category[] = [
	{ id: 1, name: 'Groceries', isActive: true, sortOrder: 0, isEssential: true },
	{ id: 2, name: 'Fun', isActive: true, sortOrder: 1, isEssential: false },
	{ id: 3, name: 'Travel', isActive: true, sortOrder: 2, isEssential: false }
];

const defaultConfig = {
	earlyMonthCutoff: 15,
	earlyMonthRatio: 0.2,
	minDifference: 30,
	minAmount: 20
};

describe('computeTopCategoryShift', () => {
	it('returns null when no previous transactions', () => {
		const current = [makeTx({ categoryId: 1, amount: 100 })];
		const result = computeTopCategoryShift(current, [], categories, 20, [], defaultConfig);
		expect(result).toBeNull();
	});

	it('finds the biggest absolute shift', () => {
		const current = [
			makeTx({ categoryId: 1, amount: 200 }),
			makeTx({ categoryId: 2, amount: 50 })
		];
		const previous = [
			makeTx({ categoryId: 1, amount: 100 }),
			makeTx({ categoryId: 2, amount: 40 })
		];

		const result = computeTopCategoryShift(current, previous, categories, 20, [], defaultConfig);
		expect(result).toEqual({
			name: 'Groceries',
			current: 200,
			previous: 100,
			diff: 100,
			isIncrease: true
		});
	});

	it('skips categories with $0 current when decrease', () => {
		const current = [makeTx({ categoryId: 1, amount: 100 })];
		// Category 2 was $200 last month, $0 this month
		const previous = [
			makeTx({ categoryId: 1, amount: 50 }),
			makeTx({ categoryId: 2, amount: 200 })
		];

		const result = computeTopCategoryShift(current, previous, categories, 20, [], defaultConfig);
		// Should show Groceries (up $50) not Fun (down $200, but $0 current)
		expect(result?.name).toBe('Groceries');
	});

	it('skips shifts below minDifference', () => {
		const current = [makeTx({ categoryId: 1, amount: 50 })];
		const previous = [makeTx({ categoryId: 1, amount: 30 })]; // diff = $20 < minDifference of $30

		const result = computeTopCategoryShift(current, previous, categories, 20, [], defaultConfig);
		expect(result).toBeNull();
	});

	it('excludes shifts that are already anomalies', () => {
		const current = [makeTx({ categoryId: 1, amount: 200 })];
		const previous = [makeTx({ categoryId: 1, amount: 50 })];
		const anomalies = [
			{ catId: 1, name: 'Groceries', current: 200, avg: 50, ratio: 4 }
		];

		const result = computeTopCategoryShift(
			current,
			previous,
			categories,
			20,
			anomalies,
			defaultConfig
		);
		expect(result).toBeNull();
	});

	it('filters early-month decreases below ratio threshold', () => {
		const current = [makeTx({ categoryId: 1, amount: 10 })]; // very low
		const previous = [makeTx({ categoryId: 1, amount: 200 })];

		// Day 5, early in month — current/previous = 10/200 = 0.05 < 0.2
		const result = computeTopCategoryShift(current, previous, categories, 5, [], defaultConfig);
		expect(result).toBeNull();
	});
});

describe('computeCategoryDeepDiveShift', () => {
	it('returns null when no previous transactions', () => {
		const result = computeCategoryDeepDiveShift(
			[makeTx({ categoryId: 1, amount: 100 })],
			[],
			categories
		);
		expect(result).toBeNull();
	});

	it('returns null when no current transactions', () => {
		const result = computeCategoryDeepDiveShift(
			[],
			[makeTx({ categoryId: 1, amount: 100 })],
			categories
		);
		expect(result).toBeNull();
	});

	it('finds biggest absolute dollar change', () => {
		const current = [
			makeTx({ categoryId: 1, amount: 300 }),
			makeTx({ categoryId: 2, amount: 50 })
		];
		const previous = [
			makeTx({ categoryId: 1, amount: 100 }),
			makeTx({ categoryId: 2, amount: 200 })
		];

		const result = computeCategoryDeepDiveShift(current, previous, categories);
		expect(result?.name).toBe('Groceries'); // $200 diff vs $150 diff
		expect(result?.current).toBe(300);
		expect(result?.previous).toBe(100);
		expect(result?.changePercent).toBe(200); // (300-100)/100 * 100
	});

	it('handles categories only in one month', () => {
		const current = [makeTx({ categoryId: 3, amount: 500 })];
		const previous = [makeTx({ categoryId: 1, amount: 50 })];

		const result = computeCategoryDeepDiveShift(current, previous, categories);
		expect(result?.name).toBe('Travel');
		expect(result?.changePercent).toBe(0); // previous was 0
	});
});
