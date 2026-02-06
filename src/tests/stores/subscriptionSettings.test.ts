import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/storage', () => ({
	persistData: vi.fn().mockResolvedValue(undefined)
}));

import { db, DEFAULT_SETTINGS } from '$lib/db';
import {
	cancelSubscription,
	reactivateSubscription,
	confirmSubscriptionActive,
	isSubscriptionCancelled,
	isSubscriptionConfirmedActive
} from '$lib/stores/subscriptionSettings';
import { persistData } from '$lib/storage';

describe('subscriptionSettings', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		// Reset DB
		await db.settings.clear();
		await db.settings.add({ ...DEFAULT_SETTINGS });
	});

	describe('cancelSubscription', () => {
		it('adds merchant to cancelled list', async () => {
			await cancelSubscription('Netflix');
			expect(await isSubscriptionCancelled('Netflix')).toBe(true);
			expect(persistData).toHaveBeenCalled();
		});

		it('normalizes merchant name', async () => {
			await cancelSubscription('  Netflix  ');
			expect(await isSubscriptionCancelled('netflix')).toBe(true);
		});

		it('removes merchant from confirmed active list', async () => {
			// First confirm active, then cancel
			await confirmSubscriptionActive('Netflix');
			expect(await isSubscriptionConfirmedActive('Netflix')).toBe(true);

			await cancelSubscription('Netflix');
			expect(await isSubscriptionCancelled('Netflix')).toBe(true);
			expect(await isSubscriptionConfirmedActive('Netflix')).toBe(false);
		});

		it('skips if already cancelled', async () => {
			await cancelSubscription('Netflix');
			vi.mocked(persistData).mockClear();

			await cancelSubscription('Netflix');
			expect(persistData).not.toHaveBeenCalled();
		});
	});

	describe('cancelSubscription with amount (targeted)', () => {
		it('cancels a specific subscription amount', async () => {
			await cancelSubscription('Apple', 2.99);
			expect(await isSubscriptionCancelled('Apple', 2.99)).toBe(true);
			// Different amount should not be cancelled
			expect(await isSubscriptionCancelled('Apple', 2.16)).toBe(false);
		});

		it('merchant-wide query matches targeted cancellation', async () => {
			await cancelSubscription('Apple', 2.99);
			// Query without amount matches any cancelled record for that merchant
			expect(await isSubscriptionCancelled('Apple')).toBe(true);
		});

		it('allows cancelling multiple amounts for same merchant', async () => {
			await cancelSubscription('Apple', 2.99);
			await cancelSubscription('Apple', 2.16);
			expect(await isSubscriptionCancelled('Apple', 2.99)).toBe(true);
			expect(await isSubscriptionCancelled('Apple', 2.16)).toBe(true);
		});

		it('skips if same amount already cancelled', async () => {
			await cancelSubscription('Apple', 2.99);
			vi.mocked(persistData).mockClear();

			await cancelSubscription('Apple', 2.99);
			expect(persistData).not.toHaveBeenCalled();
		});

		it('does not skip if different amount is cancelled', async () => {
			await cancelSubscription('Apple', 2.99);
			vi.mocked(persistData).mockClear();

			await cancelSubscription('Apple', 2.16);
			expect(persistData).toHaveBeenCalled();
		});

		it('rounds amount in stored record', async () => {
			await cancelSubscription('Apple', 2.994);
			// Should match 2.99 due to rounding
			expect(await isSubscriptionCancelled('Apple', 2.99)).toBe(true);
		});
	});

	describe('legacy merchant-wide cancellation', () => {
		it('cancels all subscriptions from merchant (no amount)', async () => {
			await cancelSubscription('Netflix');
			expect(await isSubscriptionCancelled('Netflix', 15.99)).toBe(true);
			expect(await isSubscriptionCancelled('Netflix', 22.99)).toBe(true);
		});
	});

	describe('reactivateSubscription', () => {
		it('reactivates a merchant-wide cancellation', async () => {
			await cancelSubscription('Netflix');
			await reactivateSubscription('Netflix');
			expect(await isSubscriptionCancelled('Netflix')).toBe(false);
		});

		it('reactivates a targeted cancellation', async () => {
			await cancelSubscription('Apple', 2.99);
			await reactivateSubscription('Apple', 2.99);
			expect(await isSubscriptionCancelled('Apple', 2.99)).toBe(false);
		});

		it('reactivating one amount does not affect other amounts', async () => {
			await cancelSubscription('Apple', 2.99);
			await cancelSubscription('Apple', 2.16);
			await reactivateSubscription('Apple', 2.99);
			expect(await isSubscriptionCancelled('Apple', 2.99)).toBe(false);
			expect(await isSubscriptionCancelled('Apple', 2.16)).toBe(true);
		});
	});

	describe('confirmSubscriptionActive', () => {
		it('adds merchant to confirmed active list', async () => {
			await confirmSubscriptionActive('Netflix');
			expect(await isSubscriptionConfirmedActive('Netflix')).toBe(true);
			expect(persistData).toHaveBeenCalled();
		});

		it('removes merchant from cancelled list when confirming as active', async () => {
			// Cancel first
			await cancelSubscription('Netflix');
			expect(await isSubscriptionCancelled('Netflix')).toBe(true);

			// Confirm active — should clear cancellation
			await confirmSubscriptionActive('Netflix');
			expect(await isSubscriptionConfirmedActive('Netflix')).toBe(true);
			expect(await isSubscriptionCancelled('Netflix')).toBe(false);
		});

		it('clears targeted cancellations too when confirming active', async () => {
			await cancelSubscription('Apple', 2.99);
			await cancelSubscription('Apple', 2.16);

			await confirmSubscriptionActive('Apple');
			// Both targeted cancellations should be cleared
			expect(await isSubscriptionCancelled('Apple', 2.99)).toBe(false);
			expect(await isSubscriptionCancelled('Apple', 2.16)).toBe(false);
		});

		it('no-ops when merchant is already confirmed active', async () => {
			await confirmSubscriptionActive('Netflix');
			vi.mocked(persistData).mockClear();

			await confirmSubscriptionActive('Netflix');
			expect(persistData).not.toHaveBeenCalled();
		});
	});
});
