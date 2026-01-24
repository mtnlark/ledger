import { describe, it, expect } from 'vitest';
import { computeTopCategoryShift, computeCategoryDeepDiveShift } from './category-shift';
import type { Transaction, Category } from '$lib/db';
import type { CategoryStats } from './category-averages';

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
	zScoreThreshold: 1.0,
	minAmount: 20,
	fallbackMinDifference: 30
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

	it('skips shifts below fallbackMinDifference when no stats', () => {
		const current = [makeTx({ categoryId: 1, amount: 50 })];
		const previous = [makeTx({ categoryId: 1, amount: 30 })]; // diff = $20 < fallback of $30

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

	it('uses stdDev-based threshold when categoryStats provided', () => {
		const current = [makeTx({ categoryId: 1, amount: 250 })];
		const previous = [makeTx({ categoryId: 1, amount: 200 })];
		// diff = $50, stdDev = 100, threshold = 100 * 1.0 = $100
		// $50 < $100 → not significant
		const stats = new Map<number, CategoryStats>([[1, { mean: 200, stdDev: 100 }]]);

		const result = computeTopCategoryShift(
			current, previous, categories, 20, [], defaultConfig, stats
		);
		expect(result).toBeNull();
	});

	it('flags shift when it exceeds stdDev threshold', () => {
		const current = [makeTx({ categoryId: 1, amount: 200 })];
		const previous = [makeTx({ categoryId: 1, amount: 50 })];
		// diff = $150, stdDev = 10, threshold = 10 * 1.0 = $10
		// $150 > $10 → significant
		const stats = new Map<number, CategoryStats>([[1, { mean: 100, stdDev: 10 }]]);

		const result = computeTopCategoryShift(
			current, previous, categories, 20, [], defaultConfig, stats
		);
		expect(result).not.toBeNull();
		expect(result!.diff).toBe(150);
	});

	it('uses fallback when category has no stats entry', () => {
		const current = [makeTx({ categoryId: 1, amount: 100 })];
		const previous = [makeTx({ categoryId: 1, amount: 50 })];
		// diff = $50 > fallbackMinDifference of $30 → significant
		const stats = new Map<number, CategoryStats>(); // empty

		const result = computeTopCategoryShift(
			current, previous, categories, 20, [], defaultConfig, stats
		);
		expect(result).not.toBeNull();
	});

	it('uses fallback when category stdDev is 0', () => {
		const current = [makeTx({ categoryId: 1, amount: 60 })];
		const previous = [makeTx({ categoryId: 1, amount: 25 })];
		// diff = $35 > fallbackMinDifference of $30 → significant
		const stats = new Map<number, CategoryStats>([[1, { mean: 50, stdDev: 0 }]]);

		const result = computeTopCategoryShift(
			current, previous, categories, 20, [], defaultConfig, stats
		);
		expect(result).not.toBeNull();
	});

	it('high-variance category needs larger diff to be significant', () => {
		const current = [
			makeTx({ categoryId: 1, amount: 240 }),
			makeTx({ categoryId: 2, amount: 70 })
		];
		const previous = [
			makeTx({ categoryId: 1, amount: 200 }),  // diff=$40
			makeTx({ categoryId: 2, amount: 50 })    // diff=$20
		];
		// Cat 1: stdDev=200, threshold=$200 → $40 not significant
		// Cat 2: stdDev=10, threshold=$10 → $20 significant (and > minAmount)
		const stats = new Map<number, CategoryStats>([
			[1, { mean: 200, stdDev: 200 }],
			[2, { mean: 60, stdDev: 10 }]
		]);

		const result = computeTopCategoryShift(
			current, previous, categories, 20, [], defaultConfig, stats
		);
		expect(result?.name).toBe('Fun');
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
