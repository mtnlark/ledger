import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/storage', () => ({
	persistData: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/stores/recurringCache', () => ({
	getCachedRecurring: vi.fn().mockReturnValue(null),
	setCachedRecurring: vi.fn(),
	invalidateRecurringCache: vi.fn(),
	getRecurringCacheVersion: vi.fn().mockReturnValue(0)
}));

import { db, DEFAULT_SETTINGS, type Transaction } from '$lib/db';
import { isExpectedThisMonth, getUserSubscriptions } from '$lib/stores/recurringSuggestions';

function makeTransaction(overrides: Partial<Transaction>): Transaction {
	return {
		date: new Date('2026-01-15'),
		merchant: 'Netflix',
		amount: 15.99,
		categoryId: 1,
		isShared: false,
		isSettled: false,
		splitType: 'percentage',
		splitValue: 0.5,
		partnerShare: 0,
		isEssential: false,
		isSubscription: false,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides
	};
}

describe('isExpectedThisMonth', () => {
	it('always returns true for monthly frequency', () => {
		expect(isExpectedThisMonth('monthly', 15, null, '2026-03')).toBe(true);
	});

	it('returns false for semi-annual/annual without last occurrence', () => {
		expect(isExpectedThisMonth('semi-annual', 15, null, '2026-06')).toBe(false);
		expect(isExpectedThisMonth('annual', 15, null, '2026-06')).toBe(false);
	});

	describe('semi-annual', () => {
		it('suggests at exactly 6 months', () => {
			const lastOccurrence = new Date('2025-06-15');
			expect(isExpectedThisMonth('semi-annual', 15, lastOccurrence, '2025-12')).toBe(true);
		});

		it('suggests at 12 months (two cycles)', () => {
			const lastOccurrence = new Date('2025-01-15');
			expect(isExpectedThisMonth('semi-annual', 15, lastOccurrence, '2026-01')).toBe(true);
		});

		it('does not suggest at 3 months', () => {
			const lastOccurrence = new Date('2025-06-15');
			expect(isExpectedThisMonth('semi-annual', 15, lastOccurrence, '2025-09')).toBe(false);
		});

		it('does not suggest for same month (monthsDiff=0)', () => {
			const lastOccurrence = new Date('2025-06-15');
			expect(isExpectedThisMonth('semi-annual', 15, lastOccurrence, '2025-06')).toBe(false);
		});

		it('handles cross-year boundary correctly', () => {
			const lastOccurrence = new Date('2025-07-15');
			// 6 months later = January 2026
			expect(isExpectedThisMonth('semi-annual', 15, lastOccurrence, '2026-01')).toBe(true);
			// 5 months later = December 2025 — should not match
			expect(isExpectedThisMonth('semi-annual', 15, lastOccurrence, '2025-12')).toBe(false);
		});
	});

	describe('annual', () => {
		it('suggests at exactly 12 months', () => {
			const lastOccurrence = new Date('2025-01-15');
			expect(isExpectedThisMonth('annual', 15, lastOccurrence, '2026-01')).toBe(true);
		});

		it('does not suggest at 6 months', () => {
			const lastOccurrence = new Date('2025-01-15');
			expect(isExpectedThisMonth('annual', 15, lastOccurrence, '2025-07')).toBe(false);
		});

		it('does not suggest for same month (monthsDiff=0)', () => {
			const lastOccurrence = new Date('2025-01-15');
			expect(isExpectedThisMonth('annual', 15, lastOccurrence, '2025-01')).toBe(false);
		});

		it('suggests at 24 months (two cycles)', () => {
			const lastOccurrence = new Date('2024-03-15');
			expect(isExpectedThisMonth('annual', 15, lastOccurrence, '2026-03')).toBe(true);
		});
	});
});

describe('getUserSubscriptions', () => {
	beforeEach(async () => {
		await db.transactions.clear();
		await db.settings.clear();
		await db.settings.add({ ...DEFAULT_SETTINGS });
	});

	it('returns subscription transactions grouped by merchant+amount', async () => {
		await db.transactions.bulkAdd([
			makeTransaction({ merchant: 'Netflix', amount: 15.99, isSubscription: true, date: new Date('2026-01-15') }),
			makeTransaction({ merchant: 'Netflix', amount: 15.99, isSubscription: true, date: new Date('2025-12-15') }),
			makeTransaction({ merchant: 'Spotify', amount: 9.99, isSubscription: true, date: new Date('2026-01-10') })
		]);

		const subs = await getUserSubscriptions();
		expect(subs.size).toBe(2);
		// Netflix should use the most recent amount
		expect(subs.get('netflix|15.99')?.expectedAmount).toBe(15.99);
		expect(subs.get('spotify|9.99')?.expectedAmount).toBe(9.99);
	});

	it('groups same merchant with different amounts as separate subscriptions', async () => {
		await db.transactions.bulkAdd([
			makeTransaction({ merchant: 'Apple', amount: 2.99, isSubscription: true, date: new Date('2026-01-15') }),
			makeTransaction({ merchant: 'Apple', amount: 2.16, isSubscription: true, date: new Date('2026-01-15') })
		]);

		const subs = await getUserSubscriptions();
		expect(subs.size).toBe(2);
		expect(subs.get('apple|2.99')?.expectedAmount).toBe(2.99);
		expect(subs.get('apple|2.16')?.expectedAmount).toBe(2.16);
	});

	it('excludes soft-deleted subscription transactions', async () => {
		await db.transactions.bulkAdd([
			makeTransaction({ merchant: 'Netflix', amount: 15.99, isSubscription: true, isDeleted: true, deletedAt: new Date() }),
			makeTransaction({ merchant: 'Spotify', amount: 9.99, isSubscription: true })
		]);

		const subs = await getUserSubscriptions();
		expect(subs.size).toBe(1);
		expect(subs.has('netflix|15.99')).toBe(false);
		expect(subs.has('spotify|9.99')).toBe(true);
	});

	it('excludes split parent subscription transactions', async () => {
		await db.transactions.bulkAdd([
			makeTransaction({ merchant: 'Netflix', amount: 15.99, isSubscription: true, isSplitParent: true }),
			makeTransaction({ merchant: 'Netflix', amount: 10.00, isSubscription: true, parentTransactionId: 1 }),
			makeTransaction({ merchant: 'Netflix', amount: 5.99, isSubscription: true, parentTransactionId: 1 })
		]);

		const subs = await getUserSubscriptions();
		// Split parent excluded, children grouped by their amounts
		expect(subs.has('netflix|15.99')).toBe(false);
		expect(subs.size).toBe(2);
	});

	it('does not return non-subscription transactions', async () => {
		await db.transactions.bulkAdd([
			makeTransaction({ merchant: 'Grocery Store', amount: 50, isSubscription: false })
		]);

		const subs = await getUserSubscriptions();
		expect(subs.size).toBe(0);
	});

	it('normalizes merchant names for grouping', async () => {
		await db.transactions.bulkAdd([
			makeTransaction({ merchant: 'Netflix', amount: 15.99, isSubscription: true, date: new Date('2026-01-15') }),
			makeTransaction({ merchant: 'netflix', amount: 15.99, isSubscription: true, date: new Date('2025-12-15') })
		]);

		const subs = await getUserSubscriptions();
		// Should be grouped as one subscription (same merchant + same amount)
		expect(subs.size).toBe(1);
		// Should use the most recent (Netflix with 15.99)
		expect(subs.get('netflix|15.99')?.expectedAmount).toBe(15.99);
	});

	it('filters superseded price when amounts are sequential (price change)', async () => {
		// Netflix raised price from 14.99 to 15.99 — old price superseded
		await db.transactions.bulkAdd([
			makeTransaction({ merchant: 'Netflix', amount: 14.99, isSubscription: true, date: new Date('2025-11-15') }),
			makeTransaction({ merchant: 'Netflix', amount: 15.99, isSubscription: true, date: new Date('2026-01-15') })
		]);

		const subs = await getUserSubscriptions();
		expect(subs.size).toBe(1);
		expect(subs.has('netflix|14.99')).toBe(false); // Superseded
		expect(subs.has('netflix|15.99')).toBe(true);  // Current
	});

	it('keeps both amounts when charges overlap (concurrent subscriptions)', async () => {
		// Apple iCloud $2.99 and Apple Music $2.16 — both charged concurrently
		await db.transactions.bulkAdd([
			makeTransaction({ merchant: 'Apple', amount: 2.99, isSubscription: true, date: new Date('2025-12-15') }),
			makeTransaction({ merchant: 'Apple', amount: 2.16, isSubscription: true, date: new Date('2025-12-10') }),
			makeTransaction({ merchant: 'Apple', amount: 2.99, isSubscription: true, date: new Date('2026-01-15') }),
			makeTransaction({ merchant: 'Apple', amount: 2.16, isSubscription: true, date: new Date('2026-01-10') })
		]);

		const subs = await getUserSubscriptions();
		expect(subs.size).toBe(2);
		expect(subs.has('apple|2.99')).toBe(true);
		expect(subs.has('apple|2.16')).toBe(true);
	});
});
