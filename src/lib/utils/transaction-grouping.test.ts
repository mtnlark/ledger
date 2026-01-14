import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Transaction } from '$lib/db';
import {
	sortTransactionsByDate,
	groupTransactionsByDate,
	formatDateGroupLabel,
	type DateGroup
} from './transaction-grouping';

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

describe('transaction-grouping', () => {
	describe('sortTransactionsByDate', () => {
		it('sorts transactions by date descending (newest first)', () => {
			const transactions = [
				createMockTransaction({ id: 1, date: new Date(2025, 0, 10) }), // Jan 10
				createMockTransaction({ id: 2, date: new Date(2025, 0, 15) }), // Jan 15
				createMockTransaction({ id: 3, date: new Date(2025, 0, 5) }) // Jan 5
			];

			const sorted = sortTransactionsByDate(transactions);

			expect(sorted[0].id).toBe(2); // Jan 15 (newest)
			expect(sorted[1].id).toBe(1); // Jan 10
			expect(sorted[2].id).toBe(3); // Jan 5 (oldest)
		});

		it('does not mutate original array', () => {
			const transactions = [
				createMockTransaction({ id: 1, date: new Date(2025, 0, 10) }),
				createMockTransaction({ id: 2, date: new Date(2025, 0, 15) })
			];
			const originalFirst = transactions[0];

			sortTransactionsByDate(transactions);

			expect(transactions[0]).toBe(originalFirst);
		});

		it('handles empty array', () => {
			const sorted = sortTransactionsByDate([]);
			expect(sorted).toEqual([]);
		});

		it('handles single transaction', () => {
			const tx = createMockTransaction({ id: 1 });
			const sorted = sortTransactionsByDate([tx]);

			expect(sorted.length).toBe(1);
			expect(sorted[0].id).toBe(1);
		});

		it('maintains stable sort for same dates', () => {
			const transactions = [
				createMockTransaction({ id: 1, date: new Date(2025, 0, 15), merchant: 'Store A' }),
				createMockTransaction({ id: 2, date: new Date(2025, 0, 15), merchant: 'Store B' }),
				createMockTransaction({ id: 3, date: new Date(2025, 0, 15), merchant: 'Store C' })
			];

			const sorted = sortTransactionsByDate(transactions);

			// All same date, should maintain relative order
			expect(sorted.map((t) => t.id)).toEqual([1, 2, 3]);
		});
	});

	describe('groupTransactionsByDate', () => {
		it('groups transactions by date', () => {
			// Use explicit local dates to avoid timezone issues
			const transactions = [
				createMockTransaction({ id: 1, date: new Date(2025, 0, 15) }), // Jan 15
				createMockTransaction({ id: 2, date: new Date(2025, 0, 15) }), // Jan 15
				createMockTransaction({ id: 3, date: new Date(2025, 0, 14) }) // Jan 14
			];

			const groups = groupTransactionsByDate(transactions);

			expect(groups.size).toBe(2);
			expect(groups.get('2025-01-15')?.length).toBe(2);
			expect(groups.get('2025-01-14')?.length).toBe(1);
		});

		it('returns empty map for empty array', () => {
			const groups = groupTransactionsByDate([]);
			expect(groups.size).toBe(0);
		});

		it('normalizes dates to start of day', () => {
			// Use explicit local time
			const transactions = [
				createMockTransaction({ id: 1, date: new Date(2025, 0, 15, 10, 30) }),
				createMockTransaction({ id: 2, date: new Date(2025, 0, 15, 14, 45) })
			];

			const groups = groupTransactionsByDate(transactions);

			expect(groups.size).toBe(1);
			expect(groups.get('2025-01-15')?.length).toBe(2);
		});
	});

	describe('formatDateGroupLabel', () => {
		// Mock the current date to make tests deterministic
		beforeEach(() => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2025-01-15T12:00:00'));
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('returns "Today" for current date', () => {
			const label = formatDateGroupLabel('2025-01-15');
			expect(label).toBe('Today');
		});

		it('returns "Yesterday" for previous date', () => {
			const label = formatDateGroupLabel('2025-01-14');
			expect(label).toBe('Yesterday');
		});

		it('returns formatted date for other dates', () => {
			const label = formatDateGroupLabel('2025-01-10');
			expect(label).toBe('Friday, January 10');
		});

		it('handles year boundary correctly', () => {
			const label = formatDateGroupLabel('2024-12-25');
			expect(label).toBe('Wednesday, December 25');
		});
	});
});
