import { describe, it, expect } from 'vitest';
import {
	paginateTransactions,
	mergePages,
	calculatePageInfo,
	getPage,
	shouldLoadMore,
	DEFAULT_PAGE_SIZE
} from './pagination';
import type { Transaction } from '$lib/db';

// Helper to create mock transactions
function createMockTransaction(id: number, date: Date): Transaction {
	return {
		id,
		date,
		merchant: `Merchant ${id}`,
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
		updatedAt: new Date()
	};
}

describe('pagination', () => {
	describe('DEFAULT_PAGE_SIZE', () => {
		it('has default page size of 50', () => {
			expect(DEFAULT_PAGE_SIZE).toBe(50);
		});
	});

	describe('paginateTransactions', () => {
		it('returns first page of transactions', () => {
			const transactions = Array.from({ length: 10 }, (_, i) =>
				createMockTransaction(i + 1, new Date(2025, 0, 10 - i))
			);

			const result = paginateTransactions(transactions, { limit: 5 });

			expect(result.items).toHaveLength(5);
			expect(result.hasMore).toBe(true);
			expect(result.nextCursor).toBeDefined();
		});

		it('returns items in date descending order', () => {
			const transactions = [
				createMockTransaction(1, new Date(2025, 0, 1)),
				createMockTransaction(2, new Date(2025, 0, 15)),
				createMockTransaction(3, new Date(2025, 0, 10))
			];

			const result = paginateTransactions(transactions, { limit: 10 });

			expect(result.items[0].id).toBe(2); // Jan 15 first
			expect(result.items[1].id).toBe(3); // Jan 10 second
			expect(result.items[2].id).toBe(1); // Jan 1 last
		});

		it('uses cursor to get next page', () => {
			const transactions = Array.from({ length: 10 }, (_, i) =>
				createMockTransaction(i + 1, new Date(2025, 0, 10 - i))
			);

			const firstPage = paginateTransactions(transactions, { limit: 3 });
			const secondPage = paginateTransactions(transactions, {
				limit: 3,
				cursor: firstPage.nextCursor
			});

			expect(secondPage.items).toHaveLength(3);
			// Second page should start after first page
			expect(secondPage.items[0].id).toBe(4);
		});

		it('returns empty next cursor on last page', () => {
			const transactions = Array.from({ length: 5 }, (_, i) =>
				createMockTransaction(i + 1, new Date(2025, 0, 5 - i))
			);

			const result = paginateTransactions(transactions, { limit: 10 });

			expect(result.items).toHaveLength(5);
			expect(result.hasMore).toBe(false);
			expect(result.nextCursor).toBeNull();
		});

		it('handles empty transactions', () => {
			const result = paginateTransactions([], { limit: 10 });

			expect(result.items).toHaveLength(0);
			expect(result.hasMore).toBe(false);
			expect(result.nextCursor).toBeNull();
		});

		it('handles cursor beyond all transactions', () => {
			const transactions = [
				createMockTransaction(1, new Date(2025, 0, 10)),
				createMockTransaction(2, new Date(2025, 0, 5))
			];

			const result = paginateTransactions(transactions, {
				limit: 10,
				cursor: new Date(2024, 0, 1) // Before all transactions
			});

			expect(result.items).toHaveLength(0);
			expect(result.hasMore).toBe(false);
		});
	});

	describe('mergePages', () => {
		it('merges new items with existing', () => {
			const existing = [{ id: 1 }, { id: 2 }];
			const newItems = [{ id: 3 }, { id: 4 }];

			const result = mergePages(existing, newItems);

			expect(result).toHaveLength(4);
		});

		it('deduplicates items by id', () => {
			const existing = [{ id: 1 }, { id: 2 }];
			const newItems = [{ id: 2 }, { id: 3 }];

			const result = mergePages(existing, newItems);

			expect(result).toHaveLength(3);
			expect(result.map((i) => i.id)).toEqual([1, 2, 3]);
		});

		it('preserves order with existing first', () => {
			const existing = [{ id: 1 }];
			const newItems = [{ id: 2 }];

			const result = mergePages(existing, newItems);

			expect(result[0].id).toBe(1);
			expect(result[1].id).toBe(2);
		});
	});

	describe('calculatePageInfo', () => {
		it('calculates page info correctly', () => {
			const info = calculatePageInfo(100, 10, 1);

			expect(info.currentPage).toBe(1);
			expect(info.totalPages).toBe(10);
			expect(info.startItem).toBe(1);
			expect(info.endItem).toBe(10);
			expect(info.totalItems).toBe(100);
		});

		it('calculates last page correctly', () => {
			const info = calculatePageInfo(95, 10, 10);

			expect(info.startItem).toBe(91);
			expect(info.endItem).toBe(95);
		});

		it('handles single page', () => {
			const info = calculatePageInfo(5, 10, 1);

			expect(info.totalPages).toBe(1);
			expect(info.startItem).toBe(1);
			expect(info.endItem).toBe(5);
		});

		it('handles empty list', () => {
			const info = calculatePageInfo(0, 10, 1);

			expect(info.totalPages).toBe(0);
			expect(info.startItem).toBe(0);
			expect(info.endItem).toBe(0);
		});
	});

	describe('getPage', () => {
		it('returns correct page of items', () => {
			const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

			expect(getPage(items, 1, 3)).toEqual([1, 2, 3]);
			expect(getPage(items, 2, 3)).toEqual([4, 5, 6]);
			expect(getPage(items, 4, 3)).toEqual([10]);
		});

		it('returns empty array for out of bounds page', () => {
			const items = [1, 2, 3];

			expect(getPage(items, 5, 3)).toEqual([]);
		});
	});

	describe('shouldLoadMore', () => {
		it('returns true when near bottom', () => {
			// scrollTop 800, scrollHeight 1000, clientHeight 300
			// 800 + 300 = 1100 >= 1000 - 200 = 800
			expect(shouldLoadMore(800, 1000, 300, 200)).toBe(true);
		});

		it('returns false when far from bottom', () => {
			// scrollTop 0, scrollHeight 1000, clientHeight 300
			// 0 + 300 = 300 < 1000 - 200 = 800
			expect(shouldLoadMore(0, 1000, 300, 200)).toBe(false);
		});

		it('uses default threshold of 200', () => {
			// scrollTop + clientHeight >= scrollHeight - threshold
			// 400 + 300 = 700 < 1000 - 200 = 800 → false
			expect(shouldLoadMore(400, 1000, 300)).toBe(false);
			// 500 + 300 = 800 >= 1000 - 200 = 800 → true
			expect(shouldLoadMore(500, 1000, 300)).toBe(true);
		});
	});
});
