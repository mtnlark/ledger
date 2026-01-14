import { describe, it, expect } from 'vitest';
import {
	calculateVisibleRange,
	getVisibleItems,
	calculateTotalHeight,
	getScrollTopForIndex,
	getIndexAtScrollTop,
	isItemVisible,
	calculateGroupedVisibleRange,
	type GroupedItem
} from './virtual-list';

describe('virtual-list', () => {
	describe('calculateVisibleRange', () => {
		it('calculates range at top of list', () => {
			const range = calculateVisibleRange(0, 500, 50, 100, 3);

			expect(range.startIndex).toBe(0);
			expect(range.endIndex).toBe(16); // 500/50 + 2*3 = 16
		});

		it('calculates range in middle of list', () => {
			const range = calculateVisibleRange(1000, 500, 50, 100, 3);

			// scrollTop 1000 / itemHeight 50 = index 20, minus overscan 3 = 17
			expect(range.startIndex).toBe(17);
			// visible count: 500/50 + 2*3 = 16, so end = 17 + 16 = 33
			expect(range.endIndex).toBe(33);
		});

		it('clamps to list bounds at end', () => {
			const range = calculateVisibleRange(4500, 500, 50, 100, 3);

			expect(range.startIndex).toBe(87); // 4500/50 - 3 = 87
			expect(range.endIndex).toBe(100); // Clamped to total items
		});

		it('handles empty list', () => {
			const range = calculateVisibleRange(0, 500, 50, 0, 3);

			expect(range.startIndex).toBe(0);
			expect(range.endIndex).toBe(0);
		});

		it('handles small list', () => {
			const range = calculateVisibleRange(0, 500, 50, 5, 3);

			expect(range.startIndex).toBe(0);
			expect(range.endIndex).toBe(5);
		});

		it('respects overscan parameter', () => {
			const rangeSmall = calculateVisibleRange(500, 500, 50, 100, 1);
			const rangeLarge = calculateVisibleRange(500, 500, 50, 100, 5);

			expect(rangeLarge.endIndex - rangeLarge.startIndex).toBeGreaterThan(
				rangeSmall.endIndex - rangeSmall.startIndex
			);
		});
	});

	describe('getVisibleItems', () => {
		it('returns items within range with positions', () => {
			const items = ['a', 'b', 'c', 'd', 'e'];
			const range = { startIndex: 1, endIndex: 4 };

			const visible = getVisibleItems(items, range, 50);

			expect(visible).toHaveLength(3);
			expect(visible[0]).toEqual({ item: 'b', index: 1, offsetTop: 50 });
			expect(visible[1]).toEqual({ item: 'c', index: 2, offsetTop: 100 });
			expect(visible[2]).toEqual({ item: 'd', index: 3, offsetTop: 150 });
		});

		it('handles empty range', () => {
			const items = ['a', 'b', 'c'];
			const range = { startIndex: 0, endIndex: 0 };

			const visible = getVisibleItems(items, range, 50);

			expect(visible).toHaveLength(0);
		});

		it('handles full list', () => {
			const items = ['a', 'b', 'c'];
			const range = { startIndex: 0, endIndex: 3 };

			const visible = getVisibleItems(items, range, 100);

			expect(visible).toHaveLength(3);
			expect(visible[2].offsetTop).toBe(200);
		});
	});

	describe('calculateTotalHeight', () => {
		it('calculates total height', () => {
			expect(calculateTotalHeight(100, 50)).toBe(5000);
			expect(calculateTotalHeight(0, 50)).toBe(0);
			expect(calculateTotalHeight(1, 100)).toBe(100);
		});
	});

	describe('getScrollTopForIndex', () => {
		it('calculates scroll position for index', () => {
			expect(getScrollTopForIndex(0, 50)).toBe(0);
			expect(getScrollTopForIndex(10, 50)).toBe(500);
			expect(getScrollTopForIndex(5, 100)).toBe(500);
		});
	});

	describe('getIndexAtScrollTop', () => {
		it('finds index at scroll position', () => {
			expect(getIndexAtScrollTop(0, 50)).toBe(0);
			expect(getIndexAtScrollTop(100, 50)).toBe(2);
			expect(getIndexAtScrollTop(125, 50)).toBe(2); // Floors to 2
			expect(getIndexAtScrollTop(150, 50)).toBe(3);
		});
	});

	describe('isItemVisible', () => {
		it('detects fully visible items', () => {
			// Item 5 at 250-300, viewport 200-700
			expect(isItemVisible(5, 200, 500, 50)).toBe(true);
		});

		it('detects partially visible items at top', () => {
			// Item 4 at 200-250, viewport 225-725
			expect(isItemVisible(4, 225, 500, 50)).toBe(true);
		});

		it('detects partially visible items at bottom', () => {
			// Item 13 at 650-700, viewport 200-700 (partially visible at bottom)
			expect(isItemVisible(13, 200, 500, 50)).toBe(true);
		});

		it('detects items above viewport', () => {
			// Item 0 at 0-50, viewport 200-700
			expect(isItemVisible(0, 200, 500, 50)).toBe(false);
		});

		it('detects items below viewport', () => {
			// Item 20 at 1000-1050, viewport 200-700
			expect(isItemVisible(20, 200, 500, 50)).toBe(false);
		});

		it('handles edge case at viewport boundary', () => {
			// Item at exactly viewport top
			expect(isItemVisible(4, 200, 500, 50)).toBe(true);
			// Item ending exactly at viewport top
			expect(isItemVisible(3, 200, 500, 50)).toBe(false);
		});
	});

	describe('calculateGroupedVisibleRange', () => {
		it('calculates range for grouped items with variable heights', () => {
			const items: GroupedItem<string>[] = [
				{ type: 'header', data: 'Jan 15', height: 30 },
				{ type: 'item', data: 'tx1', height: 80 },
				{ type: 'item', data: 'tx2', height: 80 },
				{ type: 'header', data: 'Jan 14', height: 30 },
				{ type: 'item', data: 'tx3', height: 80 },
				{ type: 'item', data: 'tx4', height: 80 },
				{ type: 'header', data: 'Jan 13', height: 30 },
				{ type: 'item', data: 'tx5', height: 80 }
			];

			const result = calculateGroupedVisibleRange(items, 0, 300, 1);

			expect(result.startIndex).toBe(0);
			expect(result.offsetTop).toBe(0);
			// Should include items that fit in 300px viewport plus overscan
			expect(result.endIndex).toBeGreaterThan(0);
		});

		it('handles scroll to middle of list', () => {
			const items: GroupedItem<string>[] = Array.from({ length: 20 }, (_, i) => ({
				type: 'item' as const,
				data: `item${i}`,
				height: 50
			}));

			const result = calculateGroupedVisibleRange(items, 300, 200, 2);

			// At scrollTop 300 with height 50, we're at index 6
			expect(result.startIndex).toBeLessThanOrEqual(6);
			expect(result.endIndex).toBeGreaterThan(result.startIndex);
		});

		it('handles empty list', () => {
			const items: GroupedItem<string>[] = [];

			const result = calculateGroupedVisibleRange(items, 0, 500, 3);

			expect(result.startIndex).toBe(0);
			expect(result.endIndex).toBe(0);
		});
	});
});
