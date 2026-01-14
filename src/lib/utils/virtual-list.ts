/**
 * Virtual List Utilities
 *
 * Helper functions for virtual scrolling calculations
 */

export interface VisibleRange {
	startIndex: number;
	endIndex: number;
}

export interface VirtualItem<T> {
	item: T;
	index: number;
	offsetTop: number;
}

/**
 * Calculate the visible range of items based on scroll position
 */
export function calculateVisibleRange(
	scrollTop: number,
	containerHeight: number,
	itemHeight: number,
	totalItems: number,
	overscan: number = 3
): VisibleRange {
	const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
	const visibleCount = Math.ceil(containerHeight / itemHeight) + 2 * overscan;
	const endIndex = Math.min(totalItems, startIndex + visibleCount);

	return { startIndex, endIndex };
}

/**
 * Get visible items with their absolute positions
 */
export function getVisibleItems<T>(
	items: T[],
	range: VisibleRange,
	itemHeight: number
): VirtualItem<T>[] {
	return items.slice(range.startIndex, range.endIndex).map((item, i) => ({
		item,
		index: range.startIndex + i,
		offsetTop: (range.startIndex + i) * itemHeight
	}));
}

/**
 * Calculate total scroll height
 */
export function calculateTotalHeight(itemCount: number, itemHeight: number): number {
	return itemCount * itemHeight;
}

/**
 * Scroll to a specific item index
 */
export function getScrollTopForIndex(index: number, itemHeight: number): number {
	return index * itemHeight;
}

/**
 * Find the item index at a given scroll position
 */
export function getIndexAtScrollTop(scrollTop: number, itemHeight: number): number {
	return Math.floor(scrollTop / itemHeight);
}

/**
 * Check if an item is currently visible
 */
export function isItemVisible(
	index: number,
	scrollTop: number,
	containerHeight: number,
	itemHeight: number
): boolean {
	const itemTop = index * itemHeight;
	const itemBottom = itemTop + itemHeight;
	const viewportTop = scrollTop;
	const viewportBottom = scrollTop + containerHeight;

	return itemBottom > viewportTop && itemTop < viewportBottom;
}

/**
 * Calculate dynamic heights for grouped items (like date groups)
 */
export interface GroupedItem<T> {
	type: 'header' | 'item';
	data: T;
	height: number;
}

export function calculateGroupedVisibleRange<T>(
	items: GroupedItem<T>[],
	scrollTop: number,
	containerHeight: number,
	overscan: number = 3
): { startIndex: number; endIndex: number; offsetTop: number } {
	let currentTop = 0;
	let startIndex = -1;
	let startOffset = 0;

	// Find start index
	for (let i = 0; i < items.length; i++) {
		if (currentTop + items[i].height > scrollTop) {
			startIndex = Math.max(0, i - overscan);
			// Calculate offset for the start index
			startOffset = 0;
			for (let j = 0; j < startIndex; j++) {
				startOffset += items[j].height;
			}
			break;
		}
		currentTop += items[i].height;
	}

	if (startIndex === -1) {
		startIndex = Math.max(0, items.length - 1);
		startOffset = currentTop;
	}

	// Find end index
	currentTop = startOffset;
	let endIndex = startIndex;
	const viewportBottom = scrollTop + containerHeight;

	for (let i = startIndex; i < items.length; i++) {
		endIndex = i + 1;
		currentTop += items[i].height;
		if (currentTop > viewportBottom + overscan * 50) {
			// Add buffer for overscan
			break;
		}
	}

	return {
		startIndex,
		endIndex: Math.min(items.length, endIndex + overscan),
		offsetTop: startOffset
	};
}
