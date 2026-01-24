import { describe, it, expect } from 'vitest';
import { computeCategoryAverages, computeCategoryStats } from './category-averages';
import type { Transaction } from '$lib/db';

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

describe('computeCategoryAverages', () => {
	it('returns empty map for no months', () => {
		const result = computeCategoryAverages(() => [], []);
		expect(result.size).toBe(0);
	});

	it('computes average across months', () => {
		const data: Record<string, Transaction[]> = {
			'2025-01': [makeTx({ categoryId: 1, amount: 100 })],
			'2025-02': [makeTx({ categoryId: 1, amount: 200 })],
			'2025-03': [makeTx({ categoryId: 1, amount: 300 })]
		};

		const result = computeCategoryAverages(
			(month) => data[month] || [],
			['2025-01', '2025-02', '2025-03']
		);

		expect(result.get(1)).toBe(200); // (100+200+300)/3
	});

	it('divides by total months, not months with spending', () => {
		const data: Record<string, Transaction[]> = {
			'2025-01': [makeTx({ categoryId: 1, amount: 300 })],
			'2025-02': [], // no spending in cat 1
			'2025-03': []
		};

		const result = computeCategoryAverages(
			(month) => data[month] || [],
			['2025-01', '2025-02', '2025-03']
		);

		expect(result.get(1)).toBe(100); // 300/3, not 300/1
	});

	it('handles multiple categories', () => {
		const data: Record<string, Transaction[]> = {
			'2025-01': [
				makeTx({ categoryId: 1, amount: 100 }),
				makeTx({ categoryId: 2, amount: 50 })
			],
			'2025-02': [
				makeTx({ categoryId: 1, amount: 200 }),
				makeTx({ categoryId: 2, amount: 150 })
			]
		};

		const result = computeCategoryAverages(
			(month) => data[month] || [],
			['2025-01', '2025-02']
		);

		expect(result.get(1)).toBe(150);
		expect(result.get(2)).toBe(100);
	});
});

describe('computeCategoryStats', () => {
	it('returns empty map for no months', () => {
		const result = computeCategoryStats(() => [], []);
		expect(result.size).toBe(0);
	});

	it('computes mean and stdDev across months', () => {
		const data: Record<string, Transaction[]> = {
			'2025-01': [makeTx({ categoryId: 1, amount: 100 })],
			'2025-02': [makeTx({ categoryId: 1, amount: 200 })],
			'2025-03': [makeTx({ categoryId: 1, amount: 300 })]
		};

		const result = computeCategoryStats(
			(month) => data[month] || [],
			['2025-01', '2025-02', '2025-03']
		);

		const stats = result.get(1)!;
		expect(stats.mean).toBe(200); // (100+200+300)/3
		// stdDev: sqrt(((100-200)²+(200-200)²+(300-200)²)/3) = sqrt(20000/3) ≈ 81.65
		expect(stats.stdDev).toBeCloseTo(81.65, 1);
	});

	it('includes zero-spending months in calculations', () => {
		const data: Record<string, Transaction[]> = {
			'2025-01': [makeTx({ categoryId: 1, amount: 300 })],
			'2025-02': [],
			'2025-03': []
		};

		const result = computeCategoryStats(
			(month) => data[month] || [],
			['2025-01', '2025-02', '2025-03']
		);

		const stats = result.get(1)!;
		expect(stats.mean).toBe(100); // 300/3
		// values: [300, 0, 0], mean=100
		// squaredDiffs: (300-100)²+(0-100)²+(0-100)² = 40000+10000+10000 = 60000
		// variance = 60000/3 = 20000, stdDev = sqrt(20000) ≈ 141.42
		expect(stats.stdDev).toBeCloseTo(141.42, 1);
	});

	it('returns stdDev of 0 for single month', () => {
		const data: Record<string, Transaction[]> = {
			'2025-01': [makeTx({ categoryId: 1, amount: 200 })]
		};

		const result = computeCategoryStats(
			(month) => data[month] || [],
			['2025-01']
		);

		const stats = result.get(1)!;
		expect(stats.mean).toBe(200);
		expect(stats.stdDev).toBe(0);
	});

	it('handles multiple categories independently', () => {
		const data: Record<string, Transaction[]> = {
			'2025-01': [
				makeTx({ categoryId: 1, amount: 100 }),
				makeTx({ categoryId: 2, amount: 50 })
			],
			'2025-02': [
				makeTx({ categoryId: 1, amount: 100 }),
				makeTx({ categoryId: 2, amount: 150 })
			]
		};

		const result = computeCategoryStats(
			(month) => data[month] || [],
			['2025-01', '2025-02']
		);

		// Category 1: constant at 100, stdDev = 0
		expect(result.get(1)!.mean).toBe(100);
		expect(result.get(1)!.stdDev).toBe(0);

		// Category 2: [50, 150], mean=100, stdDev=50
		expect(result.get(2)!.mean).toBe(100);
		expect(result.get(2)!.stdDev).toBe(50);
	});

	it('pads zeros for categories appearing in later months', () => {
		const data: Record<string, Transaction[]> = {
			'2025-01': [makeTx({ categoryId: 1, amount: 100 })],
			'2025-02': [
				makeTx({ categoryId: 1, amount: 100 }),
				makeTx({ categoryId: 2, amount: 200 })  // cat 2 first appears in month 2
			],
			'2025-03': [
				makeTx({ categoryId: 1, amount: 100 }),
				makeTx({ categoryId: 2, amount: 200 })
			]
		};

		const result = computeCategoryStats(
			(month) => data[month] || [],
			['2025-01', '2025-02', '2025-03']
		);

		// Category 2: values [0, 200, 200] (padded), mean = 133.33
		const cat2 = result.get(2)!;
		expect(cat2.mean).toBeCloseTo(133.33, 1);
	});
});
