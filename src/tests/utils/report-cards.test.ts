// src/tests/utils/report-cards.test.ts
import { describe, it, expect } from 'vitest';
import { computeMerchantReport, computeTagReport } from '$lib/utils/report-cards';
import type { Transaction, Category } from '$lib/db';

const categories = [
	{ id: 1, name: 'Coffee & snacks', icon: '☕', isActive: true, sortOrder: 0, isEssential: false },
	{ id: 2, name: 'Groceries', icon: '🛒', isActive: true, sortOrder: 1, isEssential: true }
] as Category[];

const TODAY = new Date('2026-06-15T12:00:00');

function tx(
	date: string,
	merchant: string,
	amount: number,
	extra: Partial<Transaction> = {}
): Transaction {
	return {
		id: Math.floor(Math.random() * 1e9),
		date: new Date(`${date}T12:00:00`),
		merchant,
		amount,
		categoryId: 1,
		isShared: false,
		partnerShare: 0,
		...extra
	} as Transaction;
}

describe('computeMerchantReport', () => {
	it('matches merchants case-insensitively and totals user share', () => {
		const txns = [
			tx('2026-06-01', "Dunkin'", 4),
			tx('2026-06-08', "dunkin'", 6, { isShared: true, partnerShare: 2 }),
			tx('2026-06-09', 'Starbucks', 10)
		];
		const report = computeMerchantReport(txns, categories, "Dunkin'", TODAY);
		expect(report).not.toBeNull();
		expect(report!.total).toBe(8); // 4 + (6 - 2)
		expect(report!.visits).toBe(2);
		expect(report!.average).toBe(4);
	});

	it('counts a split group as one visit and skips the hidden parent', () => {
		const txns = [
			tx('2026-06-01', 'Target', 100, { isSplitParent: true }),
			tx('2026-06-01', 'Target', 60, { parentTransactionId: 7, categoryId: 2 }),
			tx('2026-06-01', 'Target', 40, { parentTransactionId: 7 }),
			tx('2026-06-10', 'Target', 25)
		];
		const report = computeMerchantReport(txns, categories, 'Target', TODAY);
		expect(report!.total).toBe(125); // children + single, parent excluded
		expect(report!.visits).toBe(2); // split group once + single
	});

	it('buckets the trailing 12 months and ranks categories', () => {
		const txns = [
			tx('2026-06-01', 'Target', 30, { categoryId: 2 }),
			tx('2026-05-01', 'Target', 20),
			tx('2024-01-01', 'Target', 999) // outside the window: total yes, bars no
		];
		const report = computeMerchantReport(txns, categories, 'Target', TODAY);
		expect(report!.monthly).toHaveLength(12);
		expect(report!.monthly[11]).toEqual({ month: '2026-06', amount: 30 });
		expect(report!.monthly[10]).toEqual({ month: '2026-05', amount: 20 });
		expect(report!.total).toBe(1049);
		expect(report!.topCategories[0].name).toBe('Coffee & snacks'); // 999 + 20
	});

	it('returns null for unknown merchants', () => {
		expect(computeMerchantReport([], categories, 'Nope', TODAY)).toBeNull();
	});
});

describe('computeTagReport', () => {
	it('aggregates transactions carrying the tag', () => {
		const txns = [
			tx('2026-06-01', 'Hotel', 200, { notes: 'rome #italy-trip' }),
			tx('2026-06-03', 'Trattoria', 50, { notes: '#italy-trip dinner', isShared: true, partnerShare: 25 }),
			tx('2026-06-04', 'Local cafe', 5, { notes: 'no tag' })
		];
		const report = computeTagReport(txns, categories, 'italy-trip', TODAY);
		expect(report!.total).toBe(225);
		expect(report!.count).toBe(2);
		expect(report!.firstDate.getDate()).toBe(1);
		expect(report!.lastDate.getDate()).toBe(3);
	});

	it('counts a tag once per split purchase while summing only tagged allocations', () => {
		const txns = [
			tx('2026-06-01', 'Target', 60, { parentTransactionId: 7, categoryId: 2, notes: '#trip supplies' }),
			tx('2026-06-01', 'Target', 40, { parentTransactionId: 7, notes: '#trip snacks' }),
			tx('2026-06-03', 'Hotel', 200, { notes: '#trip' }),
			tx('2026-06-04', 'Target', 20, { parentTransactionId: 8, notes: 'not tagged' })
		];

		const report = computeTagReport(txns, categories, 'trip', TODAY);

		expect(report!.total).toBe(300);
		expect(report!.count).toBe(2);
	});
});
