import { describe, it, expect } from 'vitest';
import {
	computeCategoryAverages,
	computeCategoryStats,
	computeWeightedCategoryStats
} from './category-averages';
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

	it('computes mean, stdDev, and sampleCount across months', () => {
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
		expect(stats.sampleCount).toBe(3);
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

describe('computeWeightedCategoryStats', () => {
	it('returns empty map for no months', () => {
		const result = computeWeightedCategoryStats(() => [], []);
		expect(result.size).toBe(0);
	});

	it('weights recent months more heavily', () => {
		const data: Record<string, Transaction[]> = {
			'2025-01': [makeTx({ categoryId: 1, amount: 100 })], // oldest, lowest weight
			'2025-02': [makeTx({ categoryId: 1, amount: 100 })],
			'2025-03': [makeTx({ categoryId: 1, amount: 200 })]  // most recent, highest weight
		};

		const weighted = computeWeightedCategoryStats(
			(month) => data[month] || [],
			['2025-01', '2025-02', '2025-03'],
			{ decay: 0.5 }
		);

		const unweighted = computeCategoryStats(
			(month) => data[month] || [],
			['2025-01', '2025-02', '2025-03']
		);

		// Unweighted mean = (100+100+200)/3 = 133.33
		expect(unweighted.get(1)!.mean).toBeCloseTo(133.33, 1);

		// Weighted mean should be higher (closer to 200) because
		// recent month with 200 has higher weight
		expect(weighted.get(1)!.mean).toBeGreaterThan(unweighted.get(1)!.mean);
	});

	it('reduces apparent variance when recent values are stable', () => {
		const data: Record<string, Transaction[]> = {
			'2025-01': [makeTx({ categoryId: 1, amount: 50 })],  // old volatile
			'2025-02': [makeTx({ categoryId: 1, amount: 200 })], // old volatile
			'2025-03': [makeTx({ categoryId: 1, amount: 100 })], // recent stable
			'2025-04': [makeTx({ categoryId: 1, amount: 100 })]  // recent stable
		};

		const weighted = computeWeightedCategoryStats(
			(month) => data[month] || [],
			['2025-01', '2025-02', '2025-03', '2025-04'],
			{ decay: 0.5 }
		);

		const unweighted = computeCategoryStats(
			(month) => data[month] || [],
			['2025-01', '2025-02', '2025-03', '2025-04']
		);

		// Weighted stdDev should be lower because recent stable values dominate
		expect(weighted.get(1)!.stdDev).toBeLessThan(unweighted.get(1)!.stdDev);
	});

	it('includes sampleCount', () => {
		const data: Record<string, Transaction[]> = {
			'2025-01': [makeTx({ categoryId: 1, amount: 100 })],
			'2025-02': [makeTx({ categoryId: 1, amount: 200 })]
		};

		const result = computeWeightedCategoryStats(
			(month) => data[month] || [],
			['2025-01', '2025-02']
		);

		expect(result.get(1)!.sampleCount).toBe(2);
	});

	it('sorts months chronologically for consistent weighting', () => {
		const data: Record<string, Transaction[]> = {
			'2025-03': [makeTx({ categoryId: 1, amount: 300 })], // most recent
			'2025-01': [makeTx({ categoryId: 1, amount: 100 })], // oldest
			'2025-02': [makeTx({ categoryId: 1, amount: 200 })]
		};

		// Pass months out of order
		const result = computeWeightedCategoryStats(
			(month) => data[month] || [],
			['2025-03', '2025-01', '2025-02'],  // intentionally unsorted
			{ decay: 0.5 }
		);

		// Should still weight 2025-03 highest regardless of input order
		// With 0.5 decay: weights are [0.25, 0.5, 1] for oldest to newest
		// weighted mean = (100*0.25 + 200*0.5 + 300*1) / 1.75 = 425/1.75 ≈ 242.86
		expect(result.get(1)!.mean).toBeCloseTo(242.86, 0);
	});

	it('excluding incomplete current month preserves stats stability', () => {
		// Simulate: 3 complete months of steady $200 grocery spending,
		// plus a partial current month where only $50 has been spent so far.
		// The partial month gets weight 1.0 (most recent) and distorts stats.
		const data: Record<string, Transaction[]> = {
			'2025-10': [makeTx({ categoryId: 1, amount: 200 })],
			'2025-11': [makeTx({ categoryId: 1, amount: 200 })],
			'2025-12': [makeTx({ categoryId: 1, amount: 200 })],
			'2026-01': [makeTx({ categoryId: 1, amount: 50 })]  // partial month
		};

		const withPartial = computeWeightedCategoryStats(
			(month) => data[month] || [],
			['2025-10', '2025-11', '2025-12', '2026-01'],
			{ decay: 0.85 }
		);

		const withoutPartial = computeWeightedCategoryStats(
			(month) => data[month] || [],
			['2025-10', '2025-11', '2025-12'],
			{ decay: 0.85 }
		);

		// Without partial: steady $200, mean ≈ 200, stdDev ≈ 0
		expect(withoutPartial.get(1)!.mean).toBeCloseTo(200, 0);
		expect(withoutPartial.get(1)!.stdDev).toBeCloseTo(0, 0);

		// With partial: $50 at weight 1.0 pulls mean down and inflates stdDev
		expect(withPartial.get(1)!.mean).toBeLessThan(withoutPartial.get(1)!.mean);
		expect(withPartial.get(1)!.stdDev).toBeGreaterThan(withoutPartial.get(1)!.stdDev);

		// CV changes from ~0 (Steady) to significant (would flip classification)
		const cvWithout = withoutPartial.get(1)!.stdDev / withoutPartial.get(1)!.mean;
		const cvWith = withPartial.get(1)!.stdDev / withPartial.get(1)!.mean;
		expect(cvWithout).toBeLessThan(0.01); // essentially zero → Steady
		expect(cvWith).toBeGreaterThan(0.2);   // significant → no longer Steady
	});

	it('uses default decay of 0.85', () => {
		const data: Record<string, Transaction[]> = {
			'2025-01': [makeTx({ categoryId: 1, amount: 100 })],
			'2025-02': [makeTx({ categoryId: 1, amount: 200 })]
		};

		const resultDefault = computeWeightedCategoryStats(
			(month) => data[month] || [],
			['2025-01', '2025-02']
		);

		const resultExplicit = computeWeightedCategoryStats(
			(month) => data[month] || [],
			['2025-01', '2025-02'],
			{ decay: 0.85 }
		);

		expect(resultDefault.get(1)!.mean).toBe(resultExplicit.get(1)!.mean);
	});
});
