import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, DEFAULT_SETTINGS, type CancelledSubscription } from '$lib/db';
import {
	cancelSubscription,
	reactivateSubscription,
	confirmSubscriptionActive,
	getCancelledSubscriptions,
	getConfirmedActiveSubscriptions,
	isSubscriptionCancelled,
	isSubscriptionConfirmedActive
} from './subscriptionSettings';

// Mock persistData
vi.mock('$lib/storage', () => ({
	persistData: vi.fn()
}));

describe('subscriptionSettings', () => {
	beforeEach(async () => {
		// Reset database to default settings
		await db.settings.clear();
		await db.settings.put({ ...DEFAULT_SETTINGS, id: 1 });
	});

	describe('cancelSubscription', () => {
		it('cancels a subscription with normalized merchant name', async () => {
			await cancelSubscription('Netflix');

			const cancelled = await getCancelledSubscriptions();
			expect(cancelled.length).toBe(1);
			expect(cancelled[0].merchant).toBe('netflix');
			expect(cancelled[0].cancelledDate).toBeDefined();
		});

		it('does not duplicate already cancelled subscriptions', async () => {
			await cancelSubscription('Netflix');
			await cancelSubscription('NETFLIX');
			await cancelSubscription('netflix');

			const cancelled = await getCancelledSubscriptions();
			expect(cancelled.length).toBe(1);
		});

		it('removes subscription from confirmed active when cancelling', async () => {
			await confirmSubscriptionActive('Netflix');
			expect(await isSubscriptionConfirmedActive('Netflix')).toBe(true);

			await cancelSubscription('Netflix');

			expect(await isSubscriptionConfirmedActive('Netflix')).toBe(false);
			expect(await isSubscriptionCancelled('Netflix')).toBe(true);
		});

		it('normalizes merchant names consistently', async () => {
			await cancelSubscription('  SPOTIFY  ');

			expect(await isSubscriptionCancelled('spotify')).toBe(true);
			expect(await isSubscriptionCancelled('Spotify')).toBe(true);
			expect(await isSubscriptionCancelled('SPOTIFY')).toBe(true);
		});
	});

	describe('reactivateSubscription', () => {
		it('reactivates a cancelled subscription', async () => {
			await cancelSubscription('Netflix');
			expect(await isSubscriptionCancelled('Netflix')).toBe(true);

			await reactivateSubscription('Netflix');

			expect(await isSubscriptionCancelled('Netflix')).toBe(false);
		});

		it('handles reactivating non-cancelled subscription gracefully', async () => {
			await reactivateSubscription('Netflix');

			const cancelled = await getCancelledSubscriptions();
			expect(cancelled.length).toBe(0);
		});

		it('preserves other cancelled subscriptions when reactivating one', async () => {
			await cancelSubscription('Netflix');
			await cancelSubscription('Spotify');
			await cancelSubscription('Hulu');

			await reactivateSubscription('Spotify');

			const cancelled = await getCancelledSubscriptions();
			expect(cancelled.length).toBe(2);
			expect(cancelled.some((c) => c.merchant === 'netflix')).toBe(true);
			expect(cancelled.some((c) => c.merchant === 'hulu')).toBe(true);
			expect(cancelled.some((c) => c.merchant === 'spotify')).toBe(false);
		});
	});

	describe('confirmSubscriptionActive', () => {
		it('confirms a subscription as active', async () => {
			await confirmSubscriptionActive('Netflix');

			expect(await isSubscriptionConfirmedActive('Netflix')).toBe(true);
		});

		it('does not duplicate confirmed subscriptions', async () => {
			await confirmSubscriptionActive('Netflix');
			await confirmSubscriptionActive('NETFLIX');
			await confirmSubscriptionActive('netflix');

			const confirmed = await getConfirmedActiveSubscriptions();
			expect(confirmed.length).toBe(1);
		});

		it('normalizes merchant names', async () => {
			await confirmSubscriptionActive('  DISNEY+  ');

			expect(await isSubscriptionConfirmedActive('disney+')).toBe(true);
			expect(await isSubscriptionConfirmedActive('Disney+')).toBe(true);
		});
	});

	describe('getCancelledSubscriptions', () => {
		it('returns empty array when no subscriptions cancelled', async () => {
			const cancelled = await getCancelledSubscriptions();
			expect(cancelled).toEqual([]);
		});

		it('returns all cancelled subscriptions with dates', async () => {
			await cancelSubscription('Netflix');
			await cancelSubscription('Spotify');

			const cancelled = await getCancelledSubscriptions();
			expect(cancelled.length).toBe(2);
			expect(cancelled.every((c) => c.cancelledDate)).toBe(true);
		});
	});

	describe('getConfirmedActiveSubscriptions', () => {
		it('returns empty array when no subscriptions confirmed', async () => {
			const confirmed = await getConfirmedActiveSubscriptions();
			expect(confirmed).toEqual([]);
		});

		it('returns all confirmed active subscriptions', async () => {
			await confirmSubscriptionActive('Netflix');
			await confirmSubscriptionActive('Spotify');

			const confirmed = await getConfirmedActiveSubscriptions();
			expect(confirmed.length).toBe(2);
			expect(confirmed).toContain('netflix');
			expect(confirmed).toContain('spotify');
		});
	});

	describe('isSubscriptionCancelled', () => {
		it('returns false for non-cancelled subscription', async () => {
			expect(await isSubscriptionCancelled('Netflix')).toBe(false);
		});

		it('returns true for cancelled subscription', async () => {
			await cancelSubscription('Netflix');
			expect(await isSubscriptionCancelled('Netflix')).toBe(true);
		});

		it('is case-insensitive', async () => {
			await cancelSubscription('Netflix');

			expect(await isSubscriptionCancelled('NETFLIX')).toBe(true);
			expect(await isSubscriptionCancelled('netflix')).toBe(true);
			expect(await isSubscriptionCancelled('NeTfLiX')).toBe(true);
		});
	});

	describe('isSubscriptionConfirmedActive', () => {
		it('returns false for non-confirmed subscription', async () => {
			expect(await isSubscriptionConfirmedActive('Netflix')).toBe(false);
		});

		it('returns true for confirmed subscription', async () => {
			await confirmSubscriptionActive('Netflix');
			expect(await isSubscriptionConfirmedActive('Netflix')).toBe(true);
		});

		it('is case-insensitive', async () => {
			await confirmSubscriptionActive('Netflix');

			expect(await isSubscriptionConfirmedActive('NETFLIX')).toBe(true);
			expect(await isSubscriptionConfirmedActive('netflix')).toBe(true);
		});
	});
});
