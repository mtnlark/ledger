import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, initializeDatabase } from '$lib/db';
import { addTransaction } from './transactions';
import {
	getRecurringSuggestions,
	shouldShowRecurringBanner
} from './recurringSuggestions';

describe('Recurring Suggestions', () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
		await initializeDatabase();
	});

	afterEach(async () => {
		await db.delete();
	});

	describe('shouldShowRecurringBanner', () => {
		it('returns true when lastSuggestedMonth is undefined', () => {
			expect(shouldShowRecurringBanner('2025-01', undefined)).toBe(true);
		});

		it('returns true when current month differs from last suggested', () => {
			expect(shouldShowRecurringBanner('2025-02', '2025-01')).toBe(true);
		});

		it('returns false when current month equals last suggested', () => {
			expect(shouldShowRecurringBanner('2025-01', '2025-01')).toBe(false);
		});
	});

	describe('getRecurringSuggestions', () => {
		it('returns empty array when no transactions exist', async () => {
			const suggestions = await getRecurringSuggestions('2025-01');
			expect(suggestions).toEqual([]);
		});

		it('returns empty array when no recurring patterns detected', async () => {
			// Single transaction - not recurring
			await addTransaction({
				date: new Date(2025, 0, 15),
				merchant: 'Netflix',
				amount: 15.99,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});

			const suggestions = await getRecurringSuggestions('2025-02');
			expect(suggestions).toEqual([]);
		});

		it('includes detected recurring expenses as suggestions', async () => {
			// Add two Netflix transactions ~30 days apart
			await addTransaction({
				date: new Date(2024, 10, 15), // November
				merchant: 'Netflix',
				amount: 15.99,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});
			await addTransaction({
				date: new Date(2024, 11, 15), // December
				merchant: 'Netflix',
				amount: 15.99,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});

			const suggestions = await getRecurringSuggestions('2025-01');
			expect(suggestions).toHaveLength(1);
			expect(suggestions[0].merchant).toBe('Netflix');
			expect(suggestions[0].expectedAmount).toBe(15.99);
			expect(suggestions[0].expectedDate).toBe(15);
			expect(suggestions[0].frequency).toBe('monthly');
		});

		it('excludes suggestions that are already added this month', async () => {
			// Build recurring history
			await addTransaction({
				date: new Date(2024, 10, 15),
				merchant: 'Netflix',
				amount: 15.99,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});
			await addTransaction({
				date: new Date(2024, 11, 15),
				merchant: 'Netflix',
				amount: 15.99,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});
			// Already added for January
			await addTransaction({
				date: new Date(2025, 0, 15),
				merchant: 'Netflix',
				amount: 15.99,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});

			const suggestions = await getRecurringSuggestions('2025-01');
			expect(suggestions).toHaveLength(0);
		});

		it('includes user-tagged subscriptions', async () => {
			// Add a subscription-tagged transaction
			await addTransaction({
				date: new Date(2024, 11, 10),
				merchant: 'Spotify',
				amount: 10.99,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: true,
				subscriptionFrequency: 'monthly'
			});

			const suggestions = await getRecurringSuggestions('2025-01');
			expect(suggestions).toHaveLength(1);
			expect(suggestions[0].merchant).toBe('Spotify');
			expect(suggestions[0].isSubscription).toBe(true);
		});

		it('subscription overrides detected recurring for same merchant', async () => {
			// Detected recurring (not tagged as subscription)
			await addTransaction({
				date: new Date(2024, 9, 15),
				merchant: 'Netflix',
				amount: 15.99,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});
			await addTransaction({
				date: new Date(2024, 10, 15),
				merchant: 'Netflix',
				amount: 15.99,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});
			// User-tagged subscription (takes priority)
			await addTransaction({
				date: new Date(2024, 11, 15),
				merchant: 'Netflix',
				amount: 17.99, // Different amount (most recent, so this is used)
				categoryId: 2, // Different category
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: true,
				isSubscription: true,
				subscriptionFrequency: 'monthly'
			});

			const suggestions = await getRecurringSuggestions('2025-01');
			expect(suggestions).toHaveLength(1);
			expect(suggestions[0].isSubscription).toBe(true);
			// Should use subscription's category and most recent amount
			expect(suggestions[0].categoryId).toBe(2);
			expect(suggestions[0].expectedAmount).toBe(17.99);
		});

		it('filters by merchant name regardless of amount', async () => {
			// Build recurring history
			await addTransaction({
				date: new Date(2024, 10, 20),
				merchant: 'Electric Company',
				amount: 100,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});
			await addTransaction({
				date: new Date(2024, 11, 20),
				merchant: 'Electric Company',
				amount: 105,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});
			// Added with very different amount - should still be filtered out by merchant name
			await addTransaction({
				date: new Date(2025, 0, 20),
				merchant: 'Electric Company',
				amount: 200, // Very different amount
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});

			const suggestions = await getRecurringSuggestions('2025-01');
			// Should be filtered out because Electric Company exists this month
			expect(suggestions).toHaveLength(0);
		});

		it('sorts suggestions by expected date then amount', async () => {
			// Rent on the 1st
			await addTransaction({
				date: new Date(2024, 10, 1),
				merchant: 'Rent',
				amount: 2000,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: true,
				subscriptionFrequency: 'monthly'
			});

			// Netflix on the 15th
			await addTransaction({
				date: new Date(2024, 10, 15),
				merchant: 'Netflix',
				amount: 15.99,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: true,
				subscriptionFrequency: 'monthly'
			});

			// Spotify on the 10th
			await addTransaction({
				date: new Date(2024, 10, 10),
				merchant: 'Spotify',
				amount: 10.99,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: true,
				subscriptionFrequency: 'monthly'
			});

			const suggestions = await getRecurringSuggestions('2025-01');
			expect(suggestions).toHaveLength(3);
			expect(suggestions[0].merchant).toBe('Rent'); // Day 1
			expect(suggestions[1].merchant).toBe('Spotify'); // Day 10
			expect(suggestions[2].merchant).toBe('Netflix'); // Day 15
		});

		it('preserves shared expense settings', async () => {
			await addTransaction({
				date: new Date(2024, 10, 1),
				merchant: 'Rent',
				amount: 2000,
				categoryId: 1,
				isShared: true,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.6,
				isEssential: true,
				isSubscription: true,
				subscriptionFrequency: 'monthly'
			});

			const suggestions = await getRecurringSuggestions('2025-01');
			expect(suggestions).toHaveLength(1);
			expect(suggestions[0].isShared).toBe(true);
			expect(suggestions[0].splitType).toBe('percentage');
			expect(suggestions[0].splitValue).toBe(0.6);
		});
	});
});
