// src/tests/components/VarianceBreakdown.test.ts
import { describe, it, expect } from 'vitest';
import { computeCategoryVariance } from '$lib/components/insights/VarianceBreakdown.svelte';
import type { Transaction, Category } from '$lib/db';

const categories = [
	{ id: 1, name: 'Groceries', icon: '🛒', isActive: true, sortOrder: 0, isEssential: true },
	{ id: 2, name: 'Restaurants', icon: '🍽️', isActive: true, sortOrder: 1, isEssential: false },
	{ id: 3, name: 'Travel', icon: '✈️', isActive: true, sortOrder: 2, isEssential: false },
	{ id: 4, name: 'Electronics', icon: '💻', isActive: true, sortOrder: 3, isEssential: false }
] as Category[];

function tx(
	date: string,
	categoryId: number,
	amount: number,
	extra: Partial<Transaction> = {}
): Transaction {
	return {
		date: new Date(`${date}T12:00:00`),
		merchant: 'Test',
		amount,
		categoryId,
		isShared: false,
		partnerShare: 0,
		...extra
	} as Transaction;
}

describe('computeCategoryVariance', () => {
	it('returns null with fewer than two baseline months', () => {
		const txns = [tx('2026-05-10', 1, 100), tx('2026-06-05', 1, 200)];
		expect(computeCategoryVariance(txns, categories, '2026-06', { today: new Date('2026-07-15T12:00:00') })).toBeNull();
	});

	it('computes per-category deltas against the baseline average (past month)', () => {
		const txns = [
			// Baseline: April + May, Groceries averages (100 + 200) / 2 = 150
			tx('2026-04-10', 1, 100),
			tx('2026-05-10', 1, 200),
			// Selected month (past): Groceries 250 → delta +100
			tx('2026-06-05', 1, 250)
		];
		const result = computeCategoryVariance(txns, categories, '2026-06', {
			today: new Date('2026-08-15T12:00:00')
		});
		expect(result).not.toBeNull();
		expect(result!.throughDay).toBeNull();
		expect(result!.baselineMonthCount).toBe(2);
		expect(result!.items).toHaveLength(1);
		expect(result!.items[0]).toMatchObject({ categoryId: 1, current: 250, baseline: 150, delta: 100 });
		expect(result!.totalDelta).toBe(100);
	});

	it('clips both sides to the same day for the current month', () => {
		const txns = [
			// Baseline months: early spend counts, late spend should be clipped out
			tx('2026-04-05', 1, 100),
			tx('2026-04-25', 1, 500),
			tx('2026-05-05', 1, 100),
			tx('2026-05-25', 1, 500),
			// Current month through day 10
			tx('2026-06-05', 1, 180)
		];
		const result = computeCategoryVariance(txns, categories, '2026-06', {
			today: new Date('2026-06-10T12:00:00')
		});
		// Baseline through day 10: (100 + 100) / 2 = 100; current 180 → +80
		expect(result!.throughDay).toBe(10);
		expect(result!.items[0]).toMatchObject({ current: 180, baseline: 100, delta: 80 });
	});

	it('uses the user share for shared transactions', () => {
		const txns = [
			tx('2026-04-10', 2, 100, { isShared: true, partnerShare: 50 }),
			tx('2026-05-10', 2, 100, { isShared: true, partnerShare: 50 }),
			tx('2026-06-05', 2, 200, { isShared: true, partnerShare: 100 })
		];
		const result = computeCategoryVariance(txns, categories, '2026-06', {
			today: new Date('2026-08-15T12:00:00')
		});
		// Baseline: 50 avg; current 100 → +50
		expect(result!.items[0]).toMatchObject({ current: 100, baseline: 50, delta: 50 });
	});

	it('filters small deltas, sorts by magnitude, and respects maxItems', () => {
		const txns = [
			tx('2026-04-10', 1, 100), tx('2026-05-10', 1, 100),
			tx('2026-04-10', 2, 50), tx('2026-05-10', 2, 50),
			tx('2026-04-10', 3, 10), tx('2026-05-10', 3, 10),
			// June: Groceries +200, Restaurants −50, Travel +5 (below minDelta)
			tx('2026-06-05', 1, 300),
			tx('2026-06-05', 3, 15)
		];
		const result = computeCategoryVariance(txns, categories, '2026-06', {
			today: new Date('2026-08-15T12:00:00'),
			minDelta: 15,
			maxItems: 2
		});
		expect(result!.items.map((i) => i.categoryId)).toEqual([1, 2]);
		expect(result!.items[0].delta).toBe(200);
		expect(result!.items[1].delta).toBe(-50);
		// totalDelta includes the small Travel delta too: 200 - 50 + 5
		expect(result!.totalDelta).toBe(155);
	});

	it('flags statistically unusual categories using the anomaly detector', () => {
		const txns = [
			// Groceries baseline: 90/110 alternating → mean 100, stdDev 10
			tx('2026-02-10', 1, 90), tx('2026-03-10', 1, 110),
			tx('2026-04-10', 1, 90), tx('2026-05-10', 1, 110),
			// Restaurants baseline: identical spread
			tx('2026-02-10', 2, 90), tx('2026-03-10', 2, 110),
			tx('2026-04-10', 2, 90), tx('2026-05-10', 2, 110),
			// June: Groceries z-score 10 (unusual), Restaurants z-score 2
			// (below the adaptive threshold of 2.0 × (1 + 1/4) = 2.5)
			tx('2026-06-05', 1, 200),
			tx('2026-06-05', 2, 120)
		];
		const result = computeCategoryVariance(txns, categories, '2026-06', {
			today: new Date('2026-08-15T12:00:00')
		});
		const groceries = result!.items.find((i) => i.categoryId === 1)!;
		const restaurants = result!.items.find((i) => i.categoryId === 2)!;
		expect(groceries.isUnusual).toBe(true);
		expect(restaurants.isUnusual).toBe(false);
	});

	it('never flags categories that dropped below their baseline', () => {
		const txns = [
			tx('2026-02-10', 1, 90), tx('2026-03-10', 1, 110),
			tx('2026-04-10', 1, 90), tx('2026-05-10', 1, 110),
			// June: Groceries collapses to 10 → big negative delta, not "unusual"
			tx('2026-06-05', 1, 10)
		];
		const result = computeCategoryVariance(txns, categories, '2026-06', {
			today: new Date('2026-08-15T12:00:00')
		});
		expect(result!.items[0].delta).toBeLessThan(0);
		expect(result!.items[0].isUnusual).toBe(false);
	});

	it('skips soft-deleted transactions and split parents', () => {
		const txns = [
			tx('2026-04-10', 1, 100), tx('2026-05-10', 1, 100),
			tx('2026-06-05', 1, 150),
			tx('2026-06-06', 1, 999, { isDeleted: true }),
			tx('2026-06-07', 1, 999, { isSplitParent: true })
		];
		const result = computeCategoryVariance(txns, categories, '2026-06', {
			today: new Date('2026-08-15T12:00:00')
		});
		expect(result!.items[0].current).toBe(150);
	});

	it('does not let a one-off historical spike create a phantom decrease', () => {
		const txns = [
			// Groceries: steady $100/month across all 6 baseline months + current
			// (keeps monthsWithData populated; delta should be 0)
			tx('2025-12-10', 1, 100), tx('2026-01-10', 1, 100), tx('2026-02-10', 1, 100),
			tx('2026-03-10', 1, 100), tx('2026-04-10', 1, 100), tx('2026-05-10', 1, 100),
			tx('2026-06-05', 1, 100),
			// Electronics: one-off $700 purchase in February (e.g. a new laptop),
			// $0 in every other baseline month and $0 again this month.
			tx('2026-02-15', 4, 700)
		];
		const result = computeCategoryVariance(txns, categories, '2026-06', {
			today: new Date('2026-08-15T12:00:00')
		});
		expect(result!.baselineMonthCount).toBe(6);
		// A mean baseline of 700/6 ≈ $116.67 would make this month look like a
		// -$116.67 "decrease" in Electronics even though nothing changed there.
		// The median baseline ($0, since 5 of 6 months were $0) correctly
		// reports no change.
		expect(result!.items.find((i) => i.name === 'Electronics')).toBeUndefined();
		expect(result!.totalDelta).toBe(0);
	});

	it('uses the median (not mean) as the displayed baseline for an asymmetric history', () => {
		// Groceries: $50 in five months, $350 in one (e.g. a big holiday grocery
		// run). Mean = 100, median = 50 — the median better reflects "typical".
		const txns = [
			tx('2025-12-10', 1, 50), tx('2026-01-10', 1, 50), tx('2026-02-10', 1, 350),
			tx('2026-03-10', 1, 50), tx('2026-04-10', 1, 50), tx('2026-05-10', 1, 50),
			// Current month: back to the typical $50 → delta should be ~0, not -50
			tx('2026-06-05', 1, 50)
		];
		const result = computeCategoryVariance(txns, categories, '2026-06', {
			today: new Date('2026-08-15T12:00:00')
		});
		expect(result!.items.find((i) => i.categoryId === 1)).toBeUndefined();
		expect(result!.totalDelta).toBe(0);
	});
});
