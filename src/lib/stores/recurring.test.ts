import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, initializeDatabase } from '$lib/db';
import { addTransaction, splitTransaction } from './transactions';
import { detectRecurringExpenses } from './recurring';

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

		it('treats two monthly split purchases as two full-price occurrences', async () => {
			for (const date of [new Date(2025, 0, 15), new Date(2025, 1, 15)]) {
				const parentId = await addTransaction({
					date,
					merchant: 'Gym and Spa',
					amount: 100,
					categoryId: 1,
					isShared: false,
					isSettled: false,
					splitType: 'percentage',
					splitValue: 0.5,
					isEssential: false,
					isSubscription: false
				});
				await splitTransaction(parentId, [
					{ categoryId: 1, amount: 70 },
					{ categoryId: 2, amount: 30 }
				]);
			}

			const recurring = await detectRecurringExpenses();

			expect(recurring).toHaveLength(1);
			expect(recurring[0]).toMatchObject({
				merchant: 'Gym and Spa',
				averageAmount: 100,
				occurrenceCount: 2,
				categoryId: 1,
				allocationTemplate: [
					{ categoryId: 1, amount: 70 },
					{ categoryId: 2, amount: 30 }
				]
			});
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

		it('rejects transactions with too much amount variance', async () => {
			// Same merchant but very different amounts - not recurring.
			// With only 2 occurrences, adaptive threshold is maxVariance * 1.5 = 0.75 CV.
			// Need amounts with CV > 0.75 to be rejected.
			// $20 and $200: mean=110, stdDev=90, CV=0.82 > 0.75
			await addTransaction({
				date: new Date(2025, 0, 15),
				merchant: 'Amazon',
				amount: 20,
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
				amount: 200, // 10x different - definitely not recurring
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
