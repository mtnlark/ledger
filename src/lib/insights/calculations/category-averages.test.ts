import { describe, it, expect } from 'vitest';
import { computeCategoryAverages } from './category-averages';
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
