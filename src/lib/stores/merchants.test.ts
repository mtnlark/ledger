import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, initializeDatabase } from '$lib/db';
import { addTransaction } from './transactions';
import {
	getMerchantSuggestions,
	getMostCommonCategory,
	buildMerchantIndex,
	type MerchantEntry
} from './merchants';

describe('Merchant Suggestions', () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
		await initializeDatabase();
	});

	afterEach(async () => {
		await db.delete();
	});

	describe('buildMerchantIndex', () => {
		it('returns empty map when no transactions exist', async () => {
			const index = await buildMerchantIndex();
			expect(index.size).toBe(0);
		});

		it('builds index of unique merchants with category counts', async () => {
			// Add transactions with same merchant but different categories
			await addTransaction({
				date: new Date(2025, 11, 1),
				merchant: 'Whole Foods',
				amount: 50,
				categoryId: 11, // Groceries
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false,
				isSubscription: false
			});

			await addTransaction({
				date: new Date(2025, 11, 2),
				merchant: 'Whole Foods',
				amount: 30,
				categoryId: 11, // Groceries again
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false,
				isSubscription: false
			});

			await addTransaction({
				date: new Date(2025, 11, 3),
				merchant: 'Whole Foods',
				amount: 15,
				categoryId: 4, // Coffee & snacks
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false,
				isSubscription: false
			});

			const index = await buildMerchantIndex();

			expect(index.has('Whole Foods')).toBe(true);
			const entry = index.get('Whole Foods')!;
			expect(entry.count).toBe(3);
			expect(entry.categoryCounts.get(11)).toBe(2); // Groceries used twice
			expect(entry.categoryCounts.get(4)).toBe(1); // Coffee used once
		});

		it('tracks multiple different merchants', async () => {
			await addTransaction({
				date: new Date(2025, 11, 1),
				merchant: 'Shell',
				amount: 45,
				categoryId: 9, // Gas
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false,
				isSubscription: false
			});

			await addTransaction({
				date: new Date(2025, 11, 2),
				merchant: 'Chipotle',
				amount: 15,
				categoryId: 20, // Restaurants
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false,
				isSubscription: false
			});

			const index = await buildMerchantIndex();

			expect(index.size).toBe(2);
			expect(index.has('Shell')).toBe(true);
			expect(index.has('Chipotle')).toBe(true);
		});
	});

	describe('getMerchantSuggestions', () => {
		beforeEach(async () => {
			// Set up test data with various merchants
			const merchants = [
				{ name: 'Whole Foods', categoryId: 11 },
				{ name: 'Walmart', categoryId: 11 },
				{ name: 'Walgreens', categoryId: 13 },
				{ name: 'Shell', categoryId: 9 },
				{ name: 'Starbucks', categoryId: 4 },
				{ name: 'Chipotle', categoryId: 20 }
			];

			for (const m of merchants) {
				await addTransaction({
					date: new Date(2025, 11, 1),
					merchant: m.name,
					amount: 25,
					categoryId: m.categoryId,
					isShared: false,
					splitType: 'percentage',
					splitValue: 0.5,
					isSettled: false,
					isEssential: false,
					isSubscription: false
				});
			}
		});

		it('returns merchants matching prefix (case-insensitive)', async () => {
			const suggestions = await getMerchantSuggestions('wa');

			expect(suggestions.length).toBe(2);
			expect(suggestions.map((s) => s.merchant)).toContain('Walmart');
			expect(suggestions.map((s) => s.merchant)).toContain('Walgreens');
		});

		it('returns empty array when no matches', async () => {
			const suggestions = await getMerchantSuggestions('xyz');
			expect(suggestions).toHaveLength(0);
		});

		it('returns empty array for empty query', async () => {
			const suggestions = await getMerchantSuggestions('');
			expect(suggestions).toHaveLength(0);
		});

		it('limits results to specified count', async () => {
			// Add more "W" merchants
			await addTransaction({
				date: new Date(2025, 11, 1),
				merchant: 'Wendy\'s',
				amount: 10,
				categoryId: 20,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false,
				isSubscription: false
			});

			const suggestions = await getMerchantSuggestions('w', 2);
			expect(suggestions.length).toBeLessThanOrEqual(2);
		});

		it('sorts by frequency (most used first)', async () => {
			// Add more Walmart transactions to make it most frequent
			for (let i = 0; i < 3; i++) {
				await addTransaction({
					date: new Date(2025, 11, i + 2),
					merchant: 'Walmart',
					amount: 30,
					categoryId: 11,
					isShared: false,
					splitType: 'percentage',
					splitValue: 0.5,
					isSettled: false,
					isEssential: false,
					isSubscription: false
				});
			}

			const suggestions = await getMerchantSuggestions('wa');

			expect(suggestions[0].merchant).toBe('Walmart'); // 4 total transactions
			expect(suggestions[1].merchant).toBe('Walgreens'); // 1 transaction
		});

		it('includes most common category in suggestion', async () => {
			const suggestions = await getMerchantSuggestions('shell');

			expect(suggestions.length).toBe(1);
			expect(suggestions[0].merchant).toBe('Shell');
			expect(suggestions[0].mostCommonCategoryId).toBe(9); // Gas
		});
	});

	describe('getMostCommonCategory', () => {
		it('returns most frequently used category for a merchant', async () => {
			// Add 3 Groceries, 1 Coffee for Whole Foods
			await addTransaction({
				date: new Date(2025, 11, 1),
				merchant: 'Whole Foods',
				amount: 50,
				categoryId: 11,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false,
				isSubscription: false
			});
			await addTransaction({
				date: new Date(2025, 11, 2),
				merchant: 'Whole Foods',
				amount: 40,
				categoryId: 11,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false,
				isSubscription: false
			});
			await addTransaction({
				date: new Date(2025, 11, 3),
				merchant: 'Whole Foods',
				amount: 30,
				categoryId: 11,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false,
				isSubscription: false
			});
			await addTransaction({
				date: new Date(2025, 11, 4),
				merchant: 'Whole Foods',
				amount: 8,
				categoryId: 4, // Coffee
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false,
				isSubscription: false
			});

			const categoryId = await getMostCommonCategory('Whole Foods');
			expect(categoryId).toBe(11); // Groceries (3 vs 1)
		});

		it('returns null for unknown merchant', async () => {
			const categoryId = await getMostCommonCategory('Unknown Store');
			expect(categoryId).toBeNull();
		});

		it('is case-insensitive for merchant name', async () => {
			await addTransaction({
				date: new Date(2025, 11, 1),
				merchant: 'Starbucks',
				amount: 6,
				categoryId: 4,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false,
				isSubscription: false
			});

			const categoryId = await getMostCommonCategory('STARBUCKS');
			expect(categoryId).toBe(4);
		});
	});
});
