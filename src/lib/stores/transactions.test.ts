import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, initializeDatabase } from '$lib/db';
import {
	addTransaction,
	updateTransaction,
	deleteTransaction,
	bulkDeleteTransactions,
	bulkUpdateCategory,
	splitTransaction,
	getSplitChildren,
	isSplitParent,
	getTransactionsByMonth,
	getTransactionsByDateRange,
	getAllTransactions,
	markAsSettled,
	getUnsettledTransactions,
	calculateOutstandingBalance,
	getEarliestTransactionMonth,
	getMonthlySpendingTrends,
	getCategoryTrends,
	getDailySpending,
	getAvailableMonths
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
				isSettled: false,
				isEssential: false
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
				isSettled: false,
				isEssential: false
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
				isSettled: false,
				isEssential: false
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
				isSettled: false,
				isEssential: false
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
				isEssential: false,
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
				isSettled: false,
				isEssential: false
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
				isSettled: false,
				isEssential: false
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
				isSettled: false,
				isEssential: false
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
				isSettled: false,
				isEssential: false
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
				isSettled: false,
				isEssential: false
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
				isSettled: false,
				isEssential: false
			});

			expect(await db.transactions.get(id)).toBeDefined();

			await deleteTransaction(id);

			expect(await db.transactions.get(id)).toBeUndefined();
		});
	});

	describe('bulkDeleteTransactions', () => {
		it('deletes multiple transactions at once', async () => {
			const id1 = await addTransaction({
				date: new Date('2025-12-15'),
				merchant: 'Transaction 1',
				amount: 50,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			const id2 = await addTransaction({
				date: new Date('2025-12-16'),
				merchant: 'Transaction 2',
				amount: 75,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			const id3 = await addTransaction({
				date: new Date('2025-12-17'),
				merchant: 'Transaction 3',
				amount: 100,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			// Delete first two
			await bulkDeleteTransactions([id1, id2]);

			expect(await db.transactions.get(id1)).toBeUndefined();
			expect(await db.transactions.get(id2)).toBeUndefined();
			expect(await db.transactions.get(id3)).toBeDefined();
		});

		it('handles empty array gracefully', async () => {
			const id = await addTransaction({
				date: new Date('2025-12-15'),
				merchant: 'Test',
				amount: 50,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			await bulkDeleteTransactions([]);

			// Should not throw and original transaction should still exist
			expect(await db.transactions.get(id)).toBeDefined();
		});

		it('deletes single transaction when array has one element', async () => {
			const id = await addTransaction({
				date: new Date('2025-12-15'),
				merchant: 'Single',
				amount: 50,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			await bulkDeleteTransactions([id]);

			expect(await db.transactions.get(id)).toBeUndefined();
		});
	});

	describe('bulkUpdateCategory', () => {
		it('updates category for multiple transactions', async () => {
			const id1 = await addTransaction({
				date: new Date('2025-12-15'),
				merchant: 'Transaction 1',
				amount: 50,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			const id2 = await addTransaction({
				date: new Date('2025-12-16'),
				merchant: 'Transaction 2',
				amount: 75,
				categoryId: 2,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			const id3 = await addTransaction({
				date: new Date('2025-12-17'),
				merchant: 'Transaction 3',
				amount: 100,
				categoryId: 3,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			// Change first two to category 5
			await bulkUpdateCategory([id1, id2], 5);

			const t1 = await db.transactions.get(id1);
			const t2 = await db.transactions.get(id2);
			const t3 = await db.transactions.get(id3);

			expect(t1?.categoryId).toBe(5);
			expect(t2?.categoryId).toBe(5);
			expect(t3?.categoryId).toBe(3); // Unchanged
		});

		it('updates updatedAt timestamp', async () => {
			const id = await addTransaction({
				date: new Date('2025-12-15'),
				merchant: 'Test',
				amount: 50,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			const original = await db.transactions.get(id);
			const originalUpdatedAt = original?.updatedAt;

			// Small delay
			await new Promise((r) => setTimeout(r, 10));

			await bulkUpdateCategory([id], 5);

			const updated = await db.transactions.get(id);
			expect(updated?.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt!.getTime());
		});

		it('handles empty array gracefully', async () => {
			const id = await addTransaction({
				date: new Date('2025-12-15'),
				merchant: 'Test',
				amount: 50,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			await bulkUpdateCategory([], 5);

			// Should not throw and original transaction should be unchanged
			const transaction = await db.transactions.get(id);
			expect(transaction?.categoryId).toBe(1);
		});

		it('preserves other transaction fields', async () => {
			const id = await addTransaction({
				date: new Date('2025-12-15'),
				merchant: 'Important Store',
				amount: 100,
				categoryId: 1,
				isShared: true,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false,
				notes: 'Test notes'
			});

			await bulkUpdateCategory([id], 5);

			const transaction = await db.transactions.get(id);
			expect(transaction?.merchant).toBe('Important Store');
			expect(transaction?.amount).toBe(100);
			expect(transaction?.isShared).toBe(true);
			expect(transaction?.partnerShare).toBe(50);
			expect(transaction?.notes).toBe('Test notes');
			expect(transaction?.categoryId).toBe(5);
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
				isSettled: false,
				isEssential: false
			});

			await addTransaction({
				date: new Date(2025, 11, 1), // December 1
				merchant: 'December Start',
				amount: 50,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			await addTransaction({
				date: new Date(2025, 11, 15), // December 15
				merchant: 'December Middle',
				amount: 75,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			await addTransaction({
				date: new Date(2025, 11, 31), // December 31
				merchant: 'December End',
				amount: 25,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			await addTransaction({
				date: new Date(2026, 0, 5), // January 5
				merchant: 'January Transaction',
				amount: 200,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
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
				isSettled: false,
				isEssential: false
			});

			await addTransaction({
				date: new Date(2025, 10, 15), // November 15
				merchant: 'November Transaction',
				amount: 100,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			await addTransaction({
				date: new Date(2025, 11, 15), // December 15
				merchant: 'December Transaction',
				amount: 75,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			await addTransaction({
				date: new Date(2026, 0, 15), // January 15
				merchant: 'January Transaction',
				amount: 200,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
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
				isSettled: false,
				isEssential: false
			});

			sharedId2 = await addTransaction({
				date: new Date('2025-12-16'),
				merchant: 'Shared 2',
				amount: 80,
				categoryId: 1,
				isShared: true,
				splitType: 'fixed',
				splitValue: 30,
				isSettled: false,
				isEssential: false
			});

			nonSharedId = await addTransaction({
				date: new Date('2025-12-17'),
				merchant: 'Non-shared',
				amount: 50,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
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

	describe('getEarliestTransactionMonth', () => {
		it('returns null when no transactions exist', async () => {
			const earliest = await getEarliestTransactionMonth();
			expect(earliest).toBeNull();
		});

		it('returns month of earliest transaction', async () => {
			await addTransaction({
				date: new Date(2025, 11, 15), // December
				merchant: 'Later',
				amount: 50,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			await addTransaction({
				date: new Date(2025, 9, 10), // October - earliest
				merchant: 'First',
				amount: 25,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			await addTransaction({
				date: new Date(2025, 10, 20), // November
				merchant: 'Middle',
				amount: 75,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			const earliest = await getEarliestTransactionMonth();
			expect(earliest).toBe('2025-10');
		});
	});

	describe('getMonthlySpendingTrends', () => {
		beforeEach(async () => {
			// Add transactions across multiple months
			await addTransaction({
				date: new Date(2025, 9, 15), // October
				merchant: 'Store A',
				amount: 100,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			await addTransaction({
				date: new Date(2025, 10, 15), // November
				merchant: 'Store B',
				amount: 200,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			await addTransaction({
				date: new Date(2025, 10, 20), // November
				merchant: 'Store C',
				amount: 50,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			// Shared transaction - only your share counts
			await addTransaction({
				date: new Date(2025, 11, 15), // December
				merchant: 'Shared Store',
				amount: 100,
				categoryId: 1,
				isShared: true,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});
		});

		it('returns spending totals by month', async () => {
			const trends = await getMonthlySpendingTrends(['2025-10', '2025-11', '2025-12']);

			expect(trends.get('2025-10')).toBe(100);
			expect(trends.get('2025-11')).toBe(250); // 200 + 50
			expect(trends.get('2025-12')).toBe(50); // 100 - 50 partner share
		});

		it('returns 0 for months with no transactions', async () => {
			const trends = await getMonthlySpendingTrends(['2025-08', '2025-09']);

			expect(trends.get('2025-08')).toBe(0);
			expect(trends.get('2025-09')).toBe(0);
		});

		it('returns empty map for empty months array', async () => {
			const trends = await getMonthlySpendingTrends([]);
			expect(trends.size).toBe(0);
		});

		it('only loads transactions in requested month range', async () => {
			const trends = await getMonthlySpendingTrends(['2025-11']);

			expect(trends.has('2025-11')).toBe(true);
			expect(trends.get('2025-11')).toBe(250);
			expect(trends.has('2025-10')).toBe(false);
			expect(trends.has('2025-12')).toBe(false);
		});
	});

	describe('getCategoryTrends', () => {
		beforeEach(async () => {
			// Add transactions with different categories
			await addTransaction({
				date: new Date(2025, 10, 15),
				merchant: 'Grocery Store',
				amount: 100,
				categoryId: 11, // Groceries
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			await addTransaction({
				date: new Date(2025, 10, 20),
				merchant: 'Another Grocery',
				amount: 75,
				categoryId: 11, // Groceries
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			await addTransaction({
				date: new Date(2025, 11, 15),
				merchant: 'Grocery December',
				amount: 150,
				categoryId: 11, // Groceries
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			await addTransaction({
				date: new Date(2025, 10, 15),
				merchant: 'Gas Station',
				amount: 50,
				categoryId: 9, // Gas
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});
		});

		it('returns spending for specific category by month', async () => {
			const trends = await getCategoryTrends(11, ['2025-10', '2025-11', '2025-12']);

			expect(trends.get('2025-10')).toBe(0); // No groceries in October
			expect(trends.get('2025-11')).toBe(175); // 100 + 75
			expect(trends.get('2025-12')).toBe(150);
		});

		it('returns 0 for months with no matching category', async () => {
			const trends = await getCategoryTrends(9, ['2025-11', '2025-12']);

			expect(trends.get('2025-11')).toBe(50);
			expect(trends.get('2025-12')).toBe(0);
		});

		it('returns empty map for empty months array', async () => {
			const trends = await getCategoryTrends(11, []);
			expect(trends.size).toBe(0);
		});
	});

	describe('getDailySpending', () => {
		beforeEach(async () => {
			// Add transactions on different days in December 2025
			await addTransaction({
				date: new Date(2025, 11, 1),
				merchant: 'Day 1 Store',
				amount: 50,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			await addTransaction({
				date: new Date(2025, 11, 1),
				merchant: 'Day 1 Another',
				amount: 25,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			await addTransaction({
				date: new Date(2025, 11, 15),
				merchant: 'Day 15 Store',
				amount: 100,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			// Shared transaction
			await addTransaction({
				date: new Date(2025, 11, 31),
				merchant: 'Shared',
				amount: 80,
				categoryId: 1,
				isShared: true,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});
		});

		it('returns daily spending amounts', async () => {
			const daily = await getDailySpending('2025-12');

			expect(daily.find((d) => d.day === 1)?.amount).toBe(75); // 50 + 25
			expect(daily.find((d) => d.day === 15)?.amount).toBe(100);
			expect(daily.find((d) => d.day === 31)?.amount).toBe(40); // 80 - 40 partner share
		});

		it('returns 0 for days with no transactions', async () => {
			const daily = await getDailySpending('2025-12');

			expect(daily.find((d) => d.day === 2)?.amount).toBe(0);
			expect(daily.find((d) => d.day === 10)?.amount).toBe(0);
		});

		it('calculates cumulative totals correctly', async () => {
			const daily = await getDailySpending('2025-12');

			expect(daily.find((d) => d.day === 1)?.cumulative).toBe(75);
			expect(daily.find((d) => d.day === 2)?.cumulative).toBe(75); // No new spending
			expect(daily.find((d) => d.day === 15)?.cumulative).toBe(175); // 75 + 100
			expect(daily.find((d) => d.day === 31)?.cumulative).toBe(215); // 175 + 40
		});

		it('returns all days of the month', async () => {
			const daily = await getDailySpending('2025-12');
			expect(daily).toHaveLength(31); // December has 31 days
		});

		it('handles February correctly', async () => {
			const daily = await getDailySpending('2025-02');
			expect(daily).toHaveLength(28); // 2025 is not a leap year
		});

		it('handles leap year February', async () => {
			const daily = await getDailySpending('2024-02');
			expect(daily).toHaveLength(29);
		});
	});

	describe('getAvailableMonths', () => {
		it('returns current month when no transactions', async () => {
			const months = await getAvailableMonths();

			expect(months).toHaveLength(1);
			// Should be current month
			const now = new Date();
			const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
			expect(months[0]).toBe(currentMonth);
		});

		it('returns all months from earliest transaction to current', async () => {
			// Add a transaction 3 months ago
			const now = new Date();
			const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 15);

			await addTransaction({
				date: threeMonthsAgo,
				merchant: 'Old Transaction',
				amount: 50,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			const months = await getAvailableMonths();

			// Should have 4 months: 3 months ago, 2 months ago, last month, current month
			expect(months.length).toBeGreaterThanOrEqual(4);

			// Verify sorted order
			for (let i = 1; i < months.length; i++) {
				expect(months[i] > months[i - 1]).toBe(true);
			}
		});
	});

	describe('isEssential field', () => {
		it('stores isEssential when adding transaction', async () => {
			const id = await addTransaction({
				date: new Date(2025, 11, 15),
				merchant: 'Essential Store',
				amount: 100,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: true
			});

			const transaction = await db.transactions.get(id);
			expect(transaction?.isEssential).toBe(true);
		});

		it('defaults isEssential to false when not provided', async () => {
			const id = await addTransaction({
				date: new Date(2025, 11, 15),
				merchant: 'Non-Essential Store',
				amount: 50,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			const transaction = await db.transactions.get(id);
			// Should be false or undefined (falsy)
			expect(transaction?.isEssential).toBeFalsy();
		});

		it('can update isEssential field', async () => {
			const id = await addTransaction({
				date: new Date(2025, 11, 15),
				merchant: 'Store',
				amount: 75,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			await updateTransaction(id, { isEssential: true });

			const transaction = await db.transactions.get(id);
			expect(transaction?.isEssential).toBe(true);
		});
	});

	describe('splitTransaction', () => {
		it('creates child transactions with correct amounts', async () => {
			const parentId = await addTransaction({
				date: new Date(2025, 11, 15),
				merchant: 'Target',
				amount: 100,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			const childIds = await splitTransaction(parentId, [
				{ categoryId: 11, amount: 60 }, // Groceries
				{ categoryId: 15, amount: 40 } // Household supplies
			]);

			expect(childIds).toHaveLength(2);

			const child1 = await db.transactions.get(childIds[0]);
			const child2 = await db.transactions.get(childIds[1]);

			expect(child1?.amount).toBe(60);
			expect(child1?.categoryId).toBe(11);
			expect(child1?.parentTransactionId).toBe(parentId);

			expect(child2?.amount).toBe(40);
			expect(child2?.categoryId).toBe(15);
			expect(child2?.parentTransactionId).toBe(parentId);
		});

		it('marks parent as split', async () => {
			const parentId = await addTransaction({
				date: new Date(2025, 11, 15),
				merchant: 'Target',
				amount: 100,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			await splitTransaction(parentId, [
				{ categoryId: 11, amount: 60 },
				{ categoryId: 15, amount: 40 }
			]);

			const parent = await db.transactions.get(parentId);
			expect(parent?.isSplitParent).toBe(true);
		});

		it('inherits parent properties on children', async () => {
			const parentId = await addTransaction({
				date: new Date(2025, 11, 15),
				merchant: 'Costco',
				amount: 200,
				categoryId: 1,
				isShared: true,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: true
			});

			const childIds = await splitTransaction(parentId, [
				{ categoryId: 11, amount: 150 },
				{ categoryId: 15, amount: 50 }
			]);

			const child = await db.transactions.get(childIds[0]);
			expect(child?.merchant).toBe('Costco');
			expect(child?.isShared).toBe(true);
			expect(child?.splitType).toBe('percentage');
			expect(child?.splitValue).toBe(0.5);
			expect(child?.isEssential).toBe(true);
			// Partner share recalculated for child amount
			expect(child?.partnerShare).toBe(75); // 50% of 150
		});

		it('throws error if splits do not equal parent amount', async () => {
			const parentId = await addTransaction({
				date: new Date(2025, 11, 15),
				merchant: 'Target',
				amount: 100,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			await expect(
				splitTransaction(parentId, [
					{ categoryId: 11, amount: 60 },
					{ categoryId: 15, amount: 30 } // Only 90, not 100
				])
			).rejects.toThrow('Split amounts must equal original transaction amount');
		});

		it('throws error if less than 2 splits provided', async () => {
			const parentId = await addTransaction({
				date: new Date(2025, 11, 15),
				merchant: 'Target',
				amount: 100,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			await expect(
				splitTransaction(parentId, [{ categoryId: 11, amount: 100 }])
			).rejects.toThrow('Must have at least 2 split lines');
		});

		it('throws error when trying to split a child transaction', async () => {
			const parentId = await addTransaction({
				date: new Date(2025, 11, 15),
				merchant: 'Target',
				amount: 100,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			const childIds = await splitTransaction(parentId, [
				{ categoryId: 11, amount: 60 },
				{ categoryId: 15, amount: 40 }
			]);

			// Try to split a child
			await expect(
				splitTransaction(childIds[0], [
					{ categoryId: 11, amount: 30 },
					{ categoryId: 15, amount: 30 }
				])
			).rejects.toThrow('Cannot split a transaction that is already part of a split');
		});
	});

	describe('getSplitChildren', () => {
		it('returns child transactions for a parent', async () => {
			const parentId = await addTransaction({
				date: new Date(2025, 11, 15),
				merchant: 'Target',
				amount: 100,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			await splitTransaction(parentId, [
				{ categoryId: 11, amount: 60 },
				{ categoryId: 15, amount: 40 }
			]);

			const children = await getSplitChildren(parentId);
			expect(children).toHaveLength(2);
			expect(children.every((c) => c.parentTransactionId === parentId)).toBe(true);
		});

		it('returns empty array for non-parent transaction', async () => {
			const id = await addTransaction({
				date: new Date(2025, 11, 15),
				merchant: 'Target',
				amount: 100,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			const children = await getSplitChildren(id);
			expect(children).toHaveLength(0);
		});
	});

	describe('isSplitParent', () => {
		it('returns true for parent with children', async () => {
			const parentId = await addTransaction({
				date: new Date(2025, 11, 15),
				merchant: 'Target',
				amount: 100,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			await splitTransaction(parentId, [
				{ categoryId: 11, amount: 60 },
				{ categoryId: 15, amount: 40 }
			]);

			expect(await isSplitParent(parentId)).toBe(true);
		});

		it('returns false for regular transaction', async () => {
			const id = await addTransaction({
				date: new Date(2025, 11, 15),
				merchant: 'Target',
				amount: 100,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			expect(await isSplitParent(id)).toBe(false);
		});
	});

	describe('split transactions filtered from queries', () => {
		it('hides split parent from getTransactionsByMonth', async () => {
			const parentId = await addTransaction({
				date: new Date(2025, 11, 15),
				merchant: 'Target',
				amount: 100,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			await splitTransaction(parentId, [
				{ categoryId: 11, amount: 60 },
				{ categoryId: 15, amount: 40 }
			]);

			const transactions = await getTransactionsByMonth('2025-12');

			// Should see children but not parent
			expect(transactions.some((t) => t.id === parentId)).toBe(false);
			expect(transactions.filter((t) => t.parentTransactionId === parentId)).toHaveLength(2);
		});

		it('hides split parent from getAllTransactions', async () => {
			const parentId = await addTransaction({
				date: new Date(2025, 11, 15),
				merchant: 'Target',
				amount: 100,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isSettled: false,
				isEssential: false
			});

			await splitTransaction(parentId, [
				{ categoryId: 11, amount: 60 },
				{ categoryId: 15, amount: 40 }
			]);

			const transactions = await getAllTransactions();

			// Should see children but not parent
			expect(transactions.some((t) => t.id === parentId)).toBe(false);
			expect(transactions.filter((t) => t.parentTransactionId === parentId)).toHaveLength(2);
		});
	});
});
