import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, initializeDatabase } from '$lib/db';
import { addTransaction } from './transactions';
import { detectRecurringExpenses, type DetectedRecurring } from './recurring';

describe('Recurring Expense Detection', () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
		await initializeDatabase();
	});

	afterEach(async () => {
		await db.delete();
	});

	describe('detectRecurringExpenses', () => {
		it('returns empty array when no transactions', async () => {
			const recurring = await detectRecurringExpenses();
			expect(recurring).toEqual([]);
		});

		it('returns empty array with only one transaction per merchant', async () => {
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

			const recurring = await detectRecurringExpenses();
			expect(recurring).toEqual([]);
		});

		it('detects monthly recurring with 2 transactions', async () => {
			// Add two Netflix transactions ~30 days apart
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
			await addTransaction({
				date: new Date(2025, 1, 15),
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

			const recurring = await detectRecurringExpenses();
			expect(recurring).toHaveLength(1);
			expect(recurring[0].merchant).toBe('Netflix');
			expect(recurring[0].averageAmount).toBe(15.99);
			expect(recurring[0].dayOfMonth).toBe(15);
			expect(recurring[0].occurrenceCount).toBe(2);
		});

		it('detects monthly recurring with 3+ transactions', async () => {
			// Add three JCC transactions on the 1st of each month
			await addTransaction({
				date: new Date(2025, 0, 1),
				merchant: 'Jewish Community Center',
				amount: 77,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});
			await addTransaction({
				date: new Date(2025, 1, 1),
				merchant: 'Jewish Community Center',
				amount: 77,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});
			await addTransaction({
				date: new Date(2025, 2, 1),
				merchant: 'Jewish Community Center',
				amount: 77,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});

			const recurring = await detectRecurringExpenses();
			expect(recurring).toHaveLength(1);
			expect(recurring[0].merchant).toBe('Jewish Community Center');
			expect(recurring[0].averageAmount).toBe(77);
			expect(recurring[0].dayOfMonth).toBe(1);
			expect(recurring[0].occurrenceCount).toBe(3);
		});

		it('handles case-insensitive merchant matching', async () => {
			await addTransaction({
				date: new Date(2025, 0, 10),
				merchant: 'SPOTIFY',
				amount: 10.99,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});
			await addTransaction({
				date: new Date(2025, 1, 10),
				merchant: 'Spotify',
				amount: 10.99,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});

			const recurring = await detectRecurringExpenses();
			expect(recurring).toHaveLength(1);
			expect(recurring[0].occurrenceCount).toBe(2);
		});

		it('allows small amount variance (within 15%)', async () => {
			// Utility bill that varies slightly
			await addTransaction({
				date: new Date(2025, 0, 20),
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
				date: new Date(2025, 1, 20),
				merchant: 'Electric Company',
				amount: 110, // 10% higher
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});

			const recurring = await detectRecurringExpenses();
			expect(recurring).toHaveLength(1);
			expect(recurring[0].averageAmount).toBe(105); // Average
		});

		it('rejects transactions with too much amount variance (>15%)', async () => {
			// Same merchant but very different amounts - not recurring
			await addTransaction({
				date: new Date(2025, 0, 15),
				merchant: 'Amazon',
				amount: 50,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});
			await addTransaction({
				date: new Date(2025, 1, 15),
				merchant: 'Amazon',
				amount: 150, // 3x different - not recurring
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});

			const recurring = await detectRecurringExpenses();
			expect(recurring).toEqual([]);
		});

		it('rejects non-monthly intervals', async () => {
			// Two transactions only 10 days apart - not monthly
			await addTransaction({
				date: new Date(2025, 0, 5),
				merchant: 'Random Store',
				amount: 25,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});
			await addTransaction({
				date: new Date(2025, 0, 15),
				merchant: 'Random Store',
				amount: 25,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});

			const recurring = await detectRecurringExpenses();
			expect(recurring).toEqual([]);
		});

		it('detects multiple different recurring expenses', async () => {
			// Netflix
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
			await addTransaction({
				date: new Date(2025, 1, 15),
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

			// Spotify
			await addTransaction({
				date: new Date(2025, 0, 10),
				merchant: 'Spotify',
				amount: 10.99,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});
			await addTransaction({
				date: new Date(2025, 1, 10),
				merchant: 'Spotify',
				amount: 10.99,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});

			const recurring = await detectRecurringExpenses();
			expect(recurring).toHaveLength(2);
		});

		it('marks subscriptions category correctly', async () => {
			// Get the Subscriptions category ID
			const categories = await db.categories.toArray();
			const subscriptionsCat = categories.find(c => c.name === 'Subscriptions');

			await addTransaction({
				date: new Date(2025, 0, 15),
				merchant: 'Netflix',
				amount: 15.99,
				categoryId: subscriptionsCat?.id ?? 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});
			await addTransaction({
				date: new Date(2025, 1, 15),
				merchant: 'Netflix',
				amount: 15.99,
				categoryId: subscriptionsCat?.id ?? 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});

			const recurring = await detectRecurringExpenses();
			expect(recurring).toHaveLength(1);
			expect(recurring[0].isSubscription).toBe(true);
		});

		it('uses most common category when transactions have different categories', async () => {
			await addTransaction({
				date: new Date(2025, 0, 15),
				merchant: 'Test Merchant',
				amount: 50,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});
			await addTransaction({
				date: new Date(2025, 1, 15),
				merchant: 'Test Merchant',
				amount: 50,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});
			await addTransaction({
				date: new Date(2025, 2, 15),
				merchant: 'Test Merchant',
				amount: 50,
				categoryId: 2, // Different category once
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});

			const recurring = await detectRecurringExpenses();
			expect(recurring).toHaveLength(1);
			expect(recurring[0].categoryId).toBe(1); // Most common
		});

		it('sorts by average amount descending', async () => {
			// Expensive recurring
			await addTransaction({
				date: new Date(2025, 0, 1),
				merchant: 'Rent',
				amount: 2000,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});
			await addTransaction({
				date: new Date(2025, 1, 1),
				merchant: 'Rent',
				amount: 2000,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});

			// Cheap recurring
			await addTransaction({
				date: new Date(2025, 0, 15),
				merchant: 'Spotify',
				amount: 10.99,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});
			await addTransaction({
				date: new Date(2025, 1, 15),
				merchant: 'Spotify',
				amount: 10.99,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			});

			const recurring = await detectRecurringExpenses();
			expect(recurring).toHaveLength(2);
			expect(recurring[0].merchant).toBe('Rent'); // Higher amount first
			expect(recurring[1].merchant).toBe('Spotify');
		});
	});
});
