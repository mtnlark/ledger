/**
 * Tests for Week in Review utility functions.
 *
 * Covers:
 * - getWeekRange: correct Monday–Sunday boundaries
 * - filterTransactionsInRange: inclusive edges, excludes deleted/split-parent
 * - calculateWeekInReview: null for empty weeks, correct stats, week-over-week change
 * - Dismiss/show logic with localStorage
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { format } from 'date-fns';
import {
	getWeekRange,
	filterTransactionsInRange,
	calculateWeekInReview,
	isDismissedThisWeek,
	dismissWeekReview
} from '$lib/utils/week-in-review';
import type { Transaction, Category } from '$lib/db';

/** Format a date as YYYY-MM-DD in local time (avoids UTC shift from toISOString). */
function localDate(d: Date): string {
	return format(d, 'yyyy-MM-dd');
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
	return {
		id: 1,
		date: new Date('2026-02-04'), // Wednesday
		merchant: 'Test Store',
		amount: 50,
		categoryId: 1,
		isShared: false,
		splitType: 'percentage' as const,
		splitValue: 0.5,
		partnerShare: 0,
		isSettled: false,
		isEssential: false,
		isSubscription: false,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides
	};
}

const categories: Category[] = [
	{ id: 1, name: 'Groceries', icon: '🛒', color: '#5B8C5A', isActive: true, sortOrder: 0, isEssential: true },
	{ id: 2, name: 'Restaurants', icon: '🍽️', color: '#C45D3A', isActive: true, sortOrder: 1, isEssential: false },
	{ id: 3, name: 'Coffee', icon: '☕', color: '#D4915D', isActive: true, sortOrder: 2, isEssential: false }
];

// ─────────────────────────────────────────────────────────────────────
// getWeekRange
// ─────────────────────────────────────────────────────────────────────

describe('getWeekRange', () => {
	it('returns Monday–Sunday for last week (weeksAgo=1)', () => {
		// Reference: Wednesday Feb 11, 2026
		const ref = new Date('2026-02-11T12:00:00');
		const { start, end } = getWeekRange(1, ref);

		expect(start.getDay()).toBe(1); // Monday
		expect(localDate(start)).toBe('2026-02-02');

		expect(end.getDay()).toBe(0); // Sunday
		expect(localDate(end)).toBe('2026-02-08');
	});

	it('returns Monday–Sunday for 2 weeks ago', () => {
		const ref = new Date('2026-02-11T12:00:00');
		const { start, end } = getWeekRange(2, ref);

		expect(localDate(start)).toBe('2026-01-26');
		expect(localDate(end)).toBe('2026-02-01');
	});

	it('handles reference date that is a Monday', () => {
		const ref = new Date('2026-02-09T12:00:00'); // Monday
		const { start, end } = getWeekRange(1, ref);

		expect(localDate(start)).toBe('2026-02-02');
		expect(localDate(end)).toBe('2026-02-08');
	});

	it('handles reference date that is a Sunday', () => {
		const ref = new Date('2026-02-08T12:00:00'); // Sunday
		const { start, end } = getWeekRange(1, ref);

		// Sunday Feb 8 is part of the Mon Feb 2–Sun Feb 8 week
		// So "last week" from Sunday's perspective should be Jan 26–Feb 1
		expect(localDate(start)).toBe('2026-01-26');
		expect(localDate(end)).toBe('2026-02-01');
	});
});

// ─────────────────────────────────────────────────────────────────────
// filterTransactionsInRange
// ─────────────────────────────────────────────────────────────────────

describe('filterTransactionsInRange', () => {
	it('includes transactions on the start date (Monday)', () => {
		const tx = makeTx({ date: new Date('2026-02-02') }); // Monday
		const result = filterTransactionsInRange(
			[tx],
			new Date('2026-02-02'),
			new Date('2026-02-08')
		);
		expect(result).toHaveLength(1);
	});

	it('includes transactions on the end date (Sunday)', () => {
		const tx = makeTx({ date: new Date('2026-02-08') }); // Sunday
		const result = filterTransactionsInRange(
			[tx],
			new Date('2026-02-02'),
			new Date('2026-02-08')
		);
		expect(result).toHaveLength(1);
	});

	it('excludes transactions before the range', () => {
		const tx = makeTx({ date: new Date('2026-02-01') }); // Day before Monday
		const result = filterTransactionsInRange(
			[tx],
			new Date('2026-02-02'),
			new Date('2026-02-08')
		);
		expect(result).toHaveLength(0);
	});

	it('excludes transactions after the range', () => {
		const tx = makeTx({ date: new Date('2026-02-09') }); // Day after Sunday
		const result = filterTransactionsInRange(
			[tx],
			new Date('2026-02-02'),
			new Date('2026-02-08')
		);
		expect(result).toHaveLength(0);
	});

	it('excludes soft-deleted transactions', () => {
		const tx = makeTx({ date: new Date('2026-02-04'), isDeleted: true });
		const result = filterTransactionsInRange(
			[tx],
			new Date('2026-02-02'),
			new Date('2026-02-08')
		);
		expect(result).toHaveLength(0);
	});

	it('excludes split-parent transactions', () => {
		const tx = makeTx({ date: new Date('2026-02-04'), isSplitParent: true });
		const result = filterTransactionsInRange(
			[tx],
			new Date('2026-02-02'),
			new Date('2026-02-08')
		);
		expect(result).toHaveLength(0);
	});
});

// ─────────────────────────────────────────────────────────────────────
// calculateWeekInReview
// ─────────────────────────────────────────────────────────────────────

describe('calculateWeekInReview', () => {
	// Use a fixed "now" so getWeekRange(1) and getWeekRange(2) are predictable
	// Reference: Wed Feb 11, 2026 → last week = Feb 2–8, prior = Jan 26–Feb 1
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-02-11T12:00:00'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns null when no transactions last week', () => {
		const result = calculateWeekInReview([], categories);
		expect(result).toBeNull();
	});

	it('returns null when transactions exist only in prior week', () => {
		const txns = [
			makeTx({ date: new Date('2026-01-28'), amount: 20 }) // Prior week
		];
		const result = calculateWeekInReview(txns, categories);
		expect(result).toBeNull();
	});

	it('computes total spent and tx count', () => {
		const txns = [
			makeTx({ id: 1, date: new Date('2026-02-03'), amount: 30, categoryId: 1 }),
			makeTx({ id: 2, date: new Date('2026-02-05'), amount: 20, categoryId: 2 })
		];
		const result = calculateWeekInReview(txns, categories)!;
		expect(result.totalSpent).toBe(50);
		expect(result.txCount).toBe(2);
	});

	it('uses user amount for shared transactions', () => {
		const txns = [
			makeTx({
				id: 1,
				date: new Date('2026-02-04'),
				amount: 100,
				isShared: true,
				partnerShare: 40,
				categoryId: 1
			})
		];
		const result = calculateWeekInReview(txns, categories)!;
		expect(result.totalSpent).toBe(60); // 100 - 40
	});

	it('identifies top category by total spend', () => {
		const txns = [
			makeTx({ id: 1, date: new Date('2026-02-03'), amount: 10, categoryId: 1 }),
			makeTx({ id: 2, date: new Date('2026-02-04'), amount: 50, categoryId: 2 }),
			makeTx({ id: 3, date: new Date('2026-02-05'), amount: 20, categoryId: 1 })
		];
		const result = calculateWeekInReview(txns, categories)!;
		expect(result.topCategory).not.toBeNull();
		expect(result.topCategory!.name).toBe('Restaurants'); // 50 > 30
		expect(result.topCategory!.amount).toBe(50);
	});

	it('identifies top merchant by frequency', () => {
		const txns = [
			makeTx({ id: 1, date: new Date('2026-02-03'), merchant: 'Starbucks', amount: 5, categoryId: 3 }),
			makeTx({ id: 2, date: new Date('2026-02-04'), merchant: 'Starbucks', amount: 5, categoryId: 3 }),
			makeTx({ id: 3, date: new Date('2026-02-05'), merchant: 'Target', amount: 500, categoryId: 1 })
		];
		const result = calculateWeekInReview(txns, categories)!;
		expect(result.topMerchant).not.toBeNull();
		expect(result.topMerchant!.name).toBe('Starbucks');
		expect(result.topMerchant!.count).toBe(2);
		expect(result.topMerchant!.basis).toBe('visits');
	});

	it('falls back to the highest-spend merchant when no merchant repeats', () => {
		const txns = [
			makeTx({ id: 1, date: new Date('2026-02-03'), merchant: 'Coffee Shop', amount: 8, categoryId: 3 }),
			makeTx({ id: 2, date: new Date('2026-02-04'), merchant: 'Target', amount: 80, categoryId: 1 }),
			makeTx({ id: 3, date: new Date('2026-02-05'), merchant: 'Bookshop', amount: 25, categoryId: 2 })
		];

		const result = calculateWeekInReview(txns, categories)!;

		expect(result.topMerchant).toEqual({
			name: 'Target',
			count: 1,
			amount: 80,
			basis: 'spend'
		});
	});

	it('uses the combined user share of a split purchase for the spend fallback', () => {
		const txns = [
			makeTx({
				id: 1,
				date: new Date('2026-02-03'),
				merchant: 'Hardware Store',
				amount: 70,
				isShared: true,
				partnerShare: 20,
				categoryId: 1,
				parentTransactionId: 100
			}),
			makeTx({
				id: 2,
				date: new Date('2026-02-03'),
				merchant: 'Hardware Store',
				amount: 50,
				isShared: true,
				partnerShare: 10,
				categoryId: 2,
				parentTransactionId: 100
			}),
			makeTx({ id: 3, date: new Date('2026-02-05'), merchant: 'Target', amount: 85, categoryId: 1 })
		];

		const result = calculateWeekInReview(txns, categories)!;

		expect(result.topMerchant).toEqual({
			name: 'Hardware Store',
			count: 1,
			amount: 90,
			basis: 'spend'
		});
	});

	it('counts children from the same split transaction as one merchant visit', () => {
		const txns = [
			makeTx({
				id: 1,
				date: new Date('2026-02-03'),
				merchant: 'JetPens',
				categoryId: 1,
				parentTransactionId: 100
			}),
			makeTx({
				id: 2,
				date: new Date('2026-02-03'),
				merchant: 'JetPens',
				categoryId: 2,
				parentTransactionId: 100
			}),
			makeTx({
				id: 3,
				date: new Date('2026-02-03'),
				merchant: 'JetPens',
				categoryId: 3,
				parentTransactionId: 100
			}),
			makeTx({ id: 4, date: new Date('2026-02-04'), merchant: 'Costco', categoryId: 1 }),
			makeTx({ id: 5, date: new Date('2026-02-06'), merchant: 'Costco', categoryId: 1 })
		];

		const result = calculateWeekInReview(txns, categories)!;

		expect(result.topMerchant).toEqual({
			name: 'Costco',
			count: 2,
			amount: 100,
			basis: 'visits'
		});
		expect(result.txCount).toBe(3);
	});

	it('computes positive week-over-week change (spent more)', () => {
		const txns = [
			// Prior week: $30
			makeTx({ id: 1, date: new Date('2026-01-27'), amount: 30, categoryId: 1 }),
			// Last week: $80
			makeTx({ id: 2, date: new Date('2026-02-03'), amount: 80, categoryId: 1 })
		];
		const result = calculateWeekInReview(txns, categories)!;
		expect(result.totalSpent).toBe(80);
		expect(result.priorWeekTotal).toBe(30);
		expect(result.change).toBe(50);
	});

	it('computes negative week-over-week change (spent less)', () => {
		const txns = [
			// Prior week: $100
			makeTx({ id: 1, date: new Date('2026-01-28'), amount: 100, categoryId: 1 }),
			// Last week: $40
			makeTx({ id: 2, date: new Date('2026-02-04'), amount: 40, categoryId: 2 })
		];
		const result = calculateWeekInReview(txns, categories)!;
		expect(result.totalSpent).toBe(40);
		expect(result.priorWeekTotal).toBe(100);
		expect(result.change).toBe(-60);
	});

	it('handles zero prior week (all new spending)', () => {
		const txns = [
			makeTx({ id: 1, date: new Date('2026-02-04'), amount: 50, categoryId: 1 })
		];
		const result = calculateWeekInReview(txns, categories)!;
		expect(result.priorWeekTotal).toBe(0);
		expect(result.change).toBe(50);
	});
});

// ─────────────────────────────────────────────────────────────────────
// Dismiss logic
// ─────────────────────────────────────────────────────────────────────

describe('dismiss logic', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-02-11T12:00:00')); // Wednesday
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('is not dismissed by default', () => {
		expect(isDismissedThisWeek()).toBe(false);
	});

	it('is dismissed after calling dismissWeekReview', () => {
		dismissWeekReview();
		expect(isDismissedThisWeek()).toBe(true);
	});

	it('stores this week Monday date in localStorage', () => {
		dismissWeekReview();
		// Feb 11 (Wed) → this week's Monday = Feb 9
		expect(localStorage.getItem('ledger-week-review-dismissed')).toBe('2026-02-09');
	});

	it('resets when a new week starts', () => {
		dismissWeekReview();
		expect(isDismissedThisWeek()).toBe(true);

		// Advance to next Monday
		vi.setSystemTime(new Date('2026-02-16T12:00:00'));
		expect(isDismissedThisWeek()).toBe(false);
	});

	it('handles stale localStorage value from previous week', () => {
		localStorage.setItem('ledger-week-review-dismissed', '2026-01-26');
		expect(isDismissedThisWeek()).toBe(false);
	});
});
