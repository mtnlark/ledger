import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, initializeDatabase } from '$lib/db';
import {
	addTransaction,
	updateTransaction,
	deleteTransaction,
	getTransactionsByMonth,
	getTransactionsByDateRange,
	getAllTransactions,
	markAsSettled,
	getUnsettledTransactions,
	calculateOutstandingBalance
} from './transactions';

describe('Transaction Operations', () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
		await initializeDatabase();
	});

	afterEach(async () => {
		await db.delete();
	});

	describe('addTransaction', () => {
		it('adds a basic non-shared transaction', async () => {
			const id = await addTransaction({
				date: new Date('2025-12-15'),
				merchant: 'Amazon',
				amount: 50.00,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false
			});

			expect(id).toBeGreaterThan(0);

			const transaction = await db.transactions.get(id);
			expect(transaction).toBeDefined();
			expect(transaction?.merchant).toBe('Amazon');
			expect(transaction?.amount).toBe(50);
			expect(transaction?.partnerShare).toBe(0); // Not shared, so 0
		});

		it('calculates partner share for percentage split', async () => {
			const id = await addTransaction({
				date: new Date('2025-12-15'),
				merchant: 'Shell',
				amount: 60.00,
				categoryId: 1,
				isShared: true,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false
			});

			const transaction = await db.transactions.get(id);
			expect(transaction?.partnerShare).toBe(30); // 50% of $60
		});

		it('uses fixed amount for fixed split', async () => {
			const id = await addTransaction({
				date: new Date('2025-12-15'),
				merchant: "MOM's Organic",
				amount: 120.00,
				categoryId: 1,
				isShared: true,
				splitType: 'fixed',
				splitValue: 45.50,
				isSettled: false
			});

			const transaction = await db.transactions.get(id);
			expect(transaction?.partnerShare).toBe(45.50);
		});

		it('sets createdAt and updatedAt timestamps', async () => {
			const before = new Date();

			const id = await addTransaction({
				date: new Date('2025-12-15'),
				merchant: 'Test',
				amount: 10,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false
			});

			const after = new Date();
			const transaction = await db.transactions.get(id);

			expect(transaction?.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
			expect(transaction?.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
			expect(transaction?.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
		});

		it('stores optional notes', async () => {
			const id = await addTransaction({
				date: new Date('2025-12-15'),
				merchant: 'Restaurant',
				amount: 80,
				categoryId: 1,
				isShared: true,
				splitType: 'fixed',
				splitValue: 35,
				isSettled: false,
				notes: "Partner's meal was $35"
			});

			const transaction = await db.transactions.get(id);
			expect(transaction?.notes).toBe("Partner's meal was $35");
		});
	});

	describe('updateTransaction', () => {
		it('updates merchant name', async () => {
			const id = await addTransaction({
				date: new Date('2025-12-15'),
				merchant: 'Shell',
				amount: 50,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false
			});

			await updateTransaction(id, { merchant: 'Exxon' });

			const transaction = await db.transactions.get(id);
			expect(transaction?.merchant).toBe('Exxon');
		});

		it('recalculates partner share when amount changes', async () => {
			const id = await addTransaction({
				date: new Date('2025-12-15'),
				merchant: 'Gas Station',
				amount: 60,
				categoryId: 1,
				isShared: true,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false
			});

			// Initially $30 partner share
			let transaction = await db.transactions.get(id);
			expect(transaction?.partnerShare).toBe(30);

			// Update amount to $100
			await updateTransaction(id, { amount: 100 });

			transaction = await db.transactions.get(id);
			expect(transaction?.partnerShare).toBe(50); // 50% of $100
		});

		it('recalculates when split type changes', async () => {
			const id = await addTransaction({
				date: new Date('2025-12-15'),
				merchant: 'Store',
				amount: 100,
				categoryId: 1,
				isShared: true,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false
			});

			// Change to fixed $25
			await updateTransaction(id, { splitType: 'fixed', splitValue: 25 });

			const transaction = await db.transactions.get(id);
			expect(transaction?.partnerShare).toBe(25);
		});

		it('sets partner share to 0 when unsharing', async () => {
			const id = await addTransaction({
				date: new Date('2025-12-15'),
				merchant: 'Store',
				amount: 100,
				categoryId: 1,
				isShared: true,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false
			});

			await updateTransaction(id, { isShared: false });

			const transaction = await db.transactions.get(id);
			expect(transaction?.partnerShare).toBe(0);
		});

		it('updates updatedAt timestamp', async () => {
			const id = await addTransaction({
				date: new Date('2025-12-15'),
				merchant: 'Test',
				amount: 10,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false
			});

			const original = await db.transactions.get(id);
			const originalUpdatedAt = original?.updatedAt;

			// Small delay to ensure timestamp difference
			await new Promise((r) => setTimeout(r, 10));

			await updateTransaction(id, { merchant: 'Updated' });

			const updated = await db.transactions.get(id);
			expect(updated?.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt!.getTime());
		});
	});

	describe('deleteTransaction', () => {
		it('removes transaction from database', async () => {
			const id = await addTransaction({
				date: new Date('2025-12-15'),
				merchant: 'Test',
				amount: 10,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false
			});

			expect(await db.transactions.get(id)).toBeDefined();

			await deleteTransaction(id);

			expect(await db.transactions.get(id)).toBeUndefined();
		});
	});

	describe('getTransactionsByMonth', () => {
		beforeEach(async () => {
			// Add transactions in different months
			// Use explicit local dates to avoid timezone issues
			await addTransaction({
				date: new Date(2025, 10, 15), // November 15
				merchant: 'November Transaction',
				amount: 100,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false
			});

			await addTransaction({
				date: new Date(2025, 11, 1), // December 1
				merchant: 'December Start',
				amount: 50,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false
			});

			await addTransaction({
				date: new Date(2025, 11, 15), // December 15
				merchant: 'December Middle',
				amount: 75,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false
			});

			await addTransaction({
				date: new Date(2025, 11, 31), // December 31
				merchant: 'December End',
				amount: 25,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false
			});

			await addTransaction({
				date: new Date(2026, 0, 5), // January 5
				merchant: 'January Transaction',
				amount: 200,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false
			});
		});

		it('returns only transactions for specified month', async () => {
			const december = await getTransactionsByMonth('2025-12');
			expect(december).toHaveLength(3);

			const merchants = december.map((t) => t.merchant);
			expect(merchants).toContain('December Start');
			expect(merchants).toContain('December Middle');
			expect(merchants).toContain('December End');
		});

		it('excludes transactions from other months', async () => {
			const december = await getTransactionsByMonth('2025-12');
			const merchants = december.map((t) => t.merchant);

			expect(merchants).not.toContain('November Transaction');
			expect(merchants).not.toContain('January Transaction');
		});

		it('returns empty array for month with no transactions', async () => {
			const october = await getTransactionsByMonth('2025-10');
			expect(october).toHaveLength(0);
		});
	});

	describe('getTransactionsByDateRange', () => {
		beforeEach(async () => {
			// Add transactions across multiple months
			await addTransaction({
				date: new Date(2025, 9, 15), // October 15
				merchant: 'October Transaction',
				amount: 50,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false
			});

			await addTransaction({
				date: new Date(2025, 10, 15), // November 15
				merchant: 'November Transaction',
				amount: 100,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false
			});

			await addTransaction({
				date: new Date(2025, 11, 15), // December 15
				merchant: 'December Transaction',
				amount: 75,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false
			});

			await addTransaction({
				date: new Date(2026, 0, 15), // January 15
				merchant: 'January Transaction',
				amount: 200,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false
			});
		});

		it('returns transactions within date range', async () => {
			const fromDate = new Date(2025, 10, 1); // Nov 1
			const toDate = new Date(2025, 11, 31); // Dec 31

			const transactions = await getTransactionsByDateRange(fromDate, toDate);

			expect(transactions).toHaveLength(2);
			const merchants = transactions.map((t) => t.merchant);
			expect(merchants).toContain('November Transaction');
			expect(merchants).toContain('December Transaction');
		});

		it('excludes transactions outside date range', async () => {
			const fromDate = new Date(2025, 10, 1); // Nov 1
			const toDate = new Date(2025, 11, 31); // Dec 31

			const transactions = await getTransactionsByDateRange(fromDate, toDate);
			const merchants = transactions.map((t) => t.merchant);

			expect(merchants).not.toContain('October Transaction');
			expect(merchants).not.toContain('January Transaction');
		});

		it('includes transactions on boundary dates', async () => {
			const fromDate = new Date(2025, 10, 15); // Nov 15 (exact date of transaction)
			const toDate = new Date(2025, 11, 15); // Dec 15 (exact date of transaction)

			const transactions = await getTransactionsByDateRange(fromDate, toDate);

			expect(transactions).toHaveLength(2);
			const merchants = transactions.map((t) => t.merchant);
			expect(merchants).toContain('November Transaction');
			expect(merchants).toContain('December Transaction');
		});

		it('returns all transactions when range spans all data', async () => {
			const fromDate = new Date(2025, 0, 1); // Jan 1 2025
			const toDate = new Date(2026, 11, 31); // Dec 31 2026

			const transactions = await getTransactionsByDateRange(fromDate, toDate);

			expect(transactions).toHaveLength(4);
		});

		it('returns empty array when no transactions in range', async () => {
			const fromDate = new Date(2024, 0, 1); // Jan 1 2024
			const toDate = new Date(2024, 11, 31); // Dec 31 2024

			const transactions = await getTransactionsByDateRange(fromDate, toDate);

			expect(transactions).toHaveLength(0);
		});

		it('returns transactions sorted by date descending', async () => {
			const fromDate = new Date(2025, 9, 1); // Oct 1
			const toDate = new Date(2026, 1, 1); // Feb 1

			const transactions = await getTransactionsByDateRange(fromDate, toDate);

			expect(transactions[0].merchant).toBe('January Transaction');
			expect(transactions[1].merchant).toBe('December Transaction');
			expect(transactions[2].merchant).toBe('November Transaction');
			expect(transactions[3].merchant).toBe('October Transaction');
		});

		it('works with only fromDate specified (to present)', async () => {
			const fromDate = new Date(2025, 11, 1); // Dec 1

			const transactions = await getTransactionsByDateRange(fromDate);

			expect(transactions.length).toBeGreaterThanOrEqual(2);
			const merchants = transactions.map((t) => t.merchant);
			expect(merchants).toContain('December Transaction');
			expect(merchants).toContain('January Transaction');
			expect(merchants).not.toContain('November Transaction');
		});

		it('works with only toDate specified (from beginning)', async () => {
			const toDate = new Date(2025, 10, 30); // Nov 30

			const transactions = await getTransactionsByDateRange(undefined, toDate);

			expect(transactions).toHaveLength(2);
			const merchants = transactions.map((t) => t.merchant);
			expect(merchants).toContain('October Transaction');
			expect(merchants).toContain('November Transaction');
			expect(merchants).not.toContain('December Transaction');
		});
	});

	describe('Settlement Operations', () => {
		let sharedId1: number;
		let sharedId2: number;
		let nonSharedId: number;

		beforeEach(async () => {
			sharedId1 = await addTransaction({
				date: new Date('2025-12-15'),
				merchant: 'Shared 1',
				amount: 100,
				categoryId: 1,
				isShared: true,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false
			});

			sharedId2 = await addTransaction({
				date: new Date('2025-12-16'),
				merchant: 'Shared 2',
				amount: 80,
				categoryId: 1,
				isShared: true,
				splitType: 'fixed',
				splitValue: 30,
				isSettled: false
			});

			nonSharedId = await addTransaction({
				date: new Date('2025-12-17'),
				merchant: 'Non-shared',
				amount: 50,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false
			});
		});

		describe('getUnsettledTransactions', () => {
			it('returns only shared unsettled transactions', async () => {
				const unsettled = await getUnsettledTransactions();

				expect(unsettled).toHaveLength(2);
				expect(unsettled.map((t) => t.id)).toContain(sharedId1);
				expect(unsettled.map((t) => t.id)).toContain(sharedId2);
				expect(unsettled.map((t) => t.id)).not.toContain(nonSharedId);
			});

			it('excludes settled transactions', async () => {
				await markAsSettled([sharedId1]);

				const unsettled = await getUnsettledTransactions();
				expect(unsettled).toHaveLength(1);
				expect(unsettled[0].id).toBe(sharedId2);
			});
		});

		describe('calculateOutstandingBalance', () => {
			it('sums partner shares of unsettled transactions', async () => {
				// sharedId1: $50 (50% of $100)
				// sharedId2: $30 (fixed)
				// Total: $80
				const balance = await calculateOutstandingBalance();
				expect(balance).toBe(80);
			});

			it('updates after marking as settled', async () => {
				await markAsSettled([sharedId1]);

				// Only sharedId2 remains: $30
				const balance = await calculateOutstandingBalance();
				expect(balance).toBe(30);
			});

			it('returns 0 when all settled', async () => {
				await markAsSettled([sharedId1, sharedId2]);

				const balance = await calculateOutstandingBalance();
				expect(balance).toBe(0);
			});
		});

		describe('markAsSettled', () => {
			it('sets isSettled to true', async () => {
				await markAsSettled([sharedId1]);

				const transaction = await db.transactions.get(sharedId1);
				expect(transaction?.isSettled).toBe(true);
			});

			it('sets settledDate', async () => {
				const before = new Date();
				await markAsSettled([sharedId1]);
				const after = new Date();

				const transaction = await db.transactions.get(sharedId1);
				expect(transaction?.settledDate).toBeDefined();
				expect(transaction?.settledDate!.getTime()).toBeGreaterThanOrEqual(before.getTime());
				expect(transaction?.settledDate!.getTime()).toBeLessThanOrEqual(after.getTime());
			});

			it('can settle multiple transactions at once', async () => {
				await markAsSettled([sharedId1, sharedId2]);

				const t1 = await db.transactions.get(sharedId1);
				const t2 = await db.transactions.get(sharedId2);

				expect(t1?.isSettled).toBe(true);
				expect(t2?.isSettled).toBe(true);
			});
		});
	});
});
