import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Transaction } from '$lib/db';
import {
	sortTransactionsByDate,
	groupTransactionsByDate,
	formatDateGroupLabel,
	buildListRows,
	groupRowsByDate,
	type SplitGroupRow
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

	describe('buildListRows', () => {
		it('keeps standalone transactions as single rows in order', () => {
			const rows = buildListRows([
				createMockTransaction({ id: 1 }),
				createMockTransaction({ id: 2 }),
				createMockTransaction({ id: 3 })
			]);

			expect(rows.map((r) => r.type)).toEqual(['single', 'single', 'single']);
			expect(rows.map((r) => (r.type === 'single' ? r.transaction.id : null))).toEqual([1, 2, 3]);
		});

		it('collapses children sharing a parentTransactionId into one split row', () => {
			const rows = buildListRows([
				createMockTransaction({ id: 10, parentTransactionId: 5, amount: 30, categoryId: 1 }),
				createMockTransaction({ id: 11, parentTransactionId: 5, amount: 70, categoryId: 2 })
			]);

			expect(rows.length).toBe(1);
			expect(rows[0].type).toBe('split');
			const split = rows[0] as SplitGroupRow;
			expect(split.parentId).toBe(5);
			expect(split.children.map((c) => c.id)).toEqual([10, 11]);
			expect(split.total).toBe(100);
			// Dominant = larger child (categoryId 2, amount 70)
			expect(split.dominantCategoryId).toBe(2);
		});

		it('places the split row at the position of its first child', () => {
			const rows = buildListRows([
				createMockTransaction({ id: 1 }),
				createMockTransaction({ id: 10, parentTransactionId: 5, amount: 30 }),
				createMockTransaction({ id: 2 }),
				createMockTransaction({ id: 11, parentTransactionId: 5, amount: 70 })
			]);

			// single(1), split(5) at index 1, single(2) at index 2
			expect(rows.map((r) => r.type)).toEqual(['single', 'split', 'single']);
			expect((rows[1] as SplitGroupRow).children.map((c) => c.id)).toEqual([10, 11]);
		});

		it('groups non-adjacent children of the same parent', () => {
			const rows = buildListRows([
				createMockTransaction({ id: 10, parentTransactionId: 5, amount: 30 }),
				createMockTransaction({ id: 99 }),
				createMockTransaction({ id: 11, parentTransactionId: 5, amount: 70 })
			]);

			expect(rows.length).toBe(2);
			expect((rows[0] as SplitGroupRow).children.map((c) => c.id)).toEqual([10, 11]);
		});

		it('demotes a single visible child back to a single row', () => {
			const rows = buildListRows([
				createMockTransaction({ id: 10, parentTransactionId: 5, amount: 30 })
			]);

			expect(rows.length).toBe(1);
			expect(rows[0].type).toBe('single');
			expect(rows[0].type === 'single' && rows[0].transaction.id).toBe(10);
		});

		it('aggregates shared totals across split children', () => {
			const rows = buildListRows([
				createMockTransaction({
					id: 10,
					parentTransactionId: 5,
					amount: 40,
					isShared: true,
					partnerShare: 20,
					isSettled: false
				}),
				createMockTransaction({
					id: 11,
					parentTransactionId: 5,
					amount: 60,
					isShared: true,
					partnerShare: 30,
					isSettled: true
				})
			]);

			const split = rows[0] as SplitGroupRow;
			expect(split.allShared).toBe(true);
			expect(split.anyPending).toBe(true); // child 10 is unsettled
			expect(split.partnerTotal).toBe(50); // 20 + 30
			expect(split.youTotal).toBe(50); // (40-20) + (60-30)
		});

		it('marks allShared false when any child is personal', () => {
			const rows = buildListRows([
				createMockTransaction({ id: 10, parentTransactionId: 5, amount: 40, isShared: true, partnerShare: 20 }),
				createMockTransaction({ id: 11, parentTransactionId: 5, amount: 60, isShared: false, partnerShare: 0 })
			]);

			expect((rows[0] as SplitGroupRow).allShared).toBe(false);
		});
	});

	describe('groupRowsByDate', () => {
		it('groups rows by date (newest first), counting a split as one row', () => {
			const rows = buildListRows([
				createMockTransaction({ id: 1, date: new Date(2025, 0, 15) }),
				createMockTransaction({ id: 10, parentTransactionId: 5, amount: 30, date: new Date(2025, 0, 15) }),
				createMockTransaction({ id: 11, parentTransactionId: 5, amount: 70, date: new Date(2025, 0, 15) }),
				createMockTransaction({ id: 2, date: new Date(2025, 0, 14) })
			]);

			const groups = groupRowsByDate(rows);

			expect(groups.map((g) => g.dateKey)).toEqual(['2025-01-15', '2025-01-14']);
			expect(groups[0].rows.length).toBe(2); // single(1) + split
			expect(groups[1].rows.length).toBe(1);
		});
	});
});
