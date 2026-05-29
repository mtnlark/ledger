/**
 * Pagination Utilities
 *
 * Cursor-based pagination for efficient data loading
 */

import type { Transaction } from '$lib/db';

interface PaginationResult<T> {
	items: T[];
	nextCursor: Date | null;
	hasMore: boolean;
}

interface PaginationOptions {
	limit: number;
	cursor?: Date | null;
}

/**
 * Default pagination limit
 */
export const DEFAULT_PAGE_SIZE = 50;

/**
 * Get a page of transactions using cursor-based pagination
 * Transactions are sorted by date descending
 */
export function paginateTransactions(
	transactions: Transaction[],
	options: PaginationOptions
): PaginationResult<Transaction> {
	const { limit, cursor } = options;

	// Sort by date descending (newest first)
	const sorted = [...transactions].sort((a, b) => {
		const dateA = a.date instanceof Date ? a.date.getTime() : new Date(a.date).getTime();
		const dateB = b.date instanceof Date ? b.date.getTime() : new Date(b.date).getTime();
		return dateB - dateA;
	});

	// Find starting point if cursor exists
	let startIndex = 0;
	if (cursor) {
		const cursorTime = cursor.getTime();
		startIndex = sorted.findIndex((tx) => {
			const txTime = tx.date instanceof Date ? tx.date.getTime() : new Date(tx.date).getTime();
			return txTime < cursorTime;
		});
		if (startIndex === -1) {
			startIndex = sorted.length;
		}
	}

	// Get page of items
	const items = sorted.slice(startIndex, startIndex + limit);
	const hasMore = startIndex + limit < sorted.length;

	// Calculate next cursor
	let nextCursor: Date | null = null;
	if (hasMore && items.length > 0) {
		const lastItem = items[items.length - 1];
		nextCursor = lastItem.date instanceof Date ? lastItem.date : new Date(lastItem.date);
	}

	return { items, nextCursor, hasMore };
}

/**
 * Merge paginated results (for caching)
 */
export function mergePages<T extends { id?: number }>(
	existingItems: T[],
	newItems: T[]
): T[] {
	const existingIds = new Set(existingItems.map((item) => item.id));
	const uniqueNewItems = newItems.filter((item) => !existingIds.has(item.id));
	return [...existingItems, ...uniqueNewItems];
}

/**
 * Calculate page info for display
 */
interface PageInfo {
	currentPage: number;
	totalPages: number;
	startItem: number;
	endItem: number;
	totalItems: number;
}

export function calculatePageInfo(
	totalItems: number,
	pageSize: number,
	currentPage: number
): PageInfo {
	const totalPages = Math.ceil(totalItems / pageSize);
	const startItem = Math.min((currentPage - 1) * pageSize + 1, totalItems);
	const endItem = Math.min(currentPage * pageSize, totalItems);

	return {
		currentPage,
		totalPages,
		startItem,
		endItem,
		totalItems
	};
}

/**
 * Get offset-based page of items (for traditional pagination)
 */
export function getPage<T>(items: T[], page: number, pageSize: number): T[] {
	const start = (page - 1) * pageSize;
	return items.slice(start, start + pageSize);
}

/**
 * Check if we should load more items (for infinite scroll)
 */
export function shouldLoadMore(
	scrollTop: number,
	scrollHeight: number,
	clientHeight: number,
	threshold: number = 200
): boolean {
	return scrollTop + clientHeight >= scrollHeight - threshold;
}
