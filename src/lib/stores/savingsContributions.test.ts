import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, initializeDatabase, type SavingsContribution } from '$lib/db';
import {
	addContribution,
	getContributionsForMonth,
	getAllContributionsForMonth,
	getContributionsAffectingAvailable,
	getTotalSavedForMonth,
	getYTDContributions,
	updateContribution,
	deleteContribution
} from './savingsContributions';
import { addSavingsAccount, getSavingsAccount } from './savingsAccounts';

describe('SavingsContribution Operations', () => {
	let savingsAccountId: number;
	let retirementAccountId: number;
	let investmentAccountId: number;

	beforeEach(async () => {
		await db.delete();
		await db.open();
		await initializeDatabase();
		// Clear seeded savings accounts and contributions to start fresh for testing
		await db.savingsAccounts.clear();
		await db.savingsContributions.clear();

		// Create test accounts
		savingsAccountId = await addSavingsAccount({
			name: 'Emergency Fund',
			accountType: 'savings',
			sortOrder: 1
		});

		retirementAccountId = await addSavingsAccount({
			name: '401(k)',
			accountType: 'retirement',
			sortOrder: 2
		});

		investmentAccountId = await addSavingsAccount({
			name: 'Brokerage',
			accountType: 'investment',
			sortOrder: 3
		});
	});

	afterEach(async () => {
		await db.delete();
	});

	describe('addContribution', () => {
		it('creates contribution with timestamps', async () => {
			const beforeCreate = new Date();

			const id = await addContribution({
				date: new Date(2024, 5, 15), // June 15
				accountId: savingsAccountId,
				amount: 500,
				source: 'bank_transfer'
			});

			const afterCreate = new Date();

			const contribution = await db.savingsContributions.get(id);
			expect(contribution?.createdAt).toBeInstanceOf(Date);
			expect(contribution?.updatedAt).toBeInstanceOf(Date);
			expect(contribution!.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
			expect(contribution!.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
		});

		it('stores all fields correctly', async () => {
			const id = await addContribution({
				date: new Date(2024, 5, 15), // June 15
				accountId: savingsAccountId,
				amount: 500,
				source: 'bank_transfer',
				notes: 'Monthly deposit'
			});

			const contribution = await db.savingsContributions.get(id);
			expect(contribution?.accountId).toBe(savingsAccountId);
			expect(contribution?.amount).toBe(500);
			expect(contribution?.source).toBe('bank_transfer');
			expect(contribution?.notes).toBe('Monthly deposit');
		});

		it('updates account balance for savings type accounts', async () => {
			const initialAccount = await getSavingsAccount(savingsAccountId);
			expect(initialAccount?.currentBalance).toBe(0);

			await addContribution({
				date: new Date(2024, 5, 15), // June 15
				accountId: savingsAccountId,
				amount: 500,
				source: 'bank_transfer'
			});

			const updatedAccount = await getSavingsAccount(savingsAccountId);
			expect(updatedAccount?.currentBalance).toBe(500);
		});

		it('accumulates balance on multiple contributions', async () => {
			await addContribution({
				date: new Date(2024, 5, 15), // June 15
				accountId: savingsAccountId,
				amount: 500,
				source: 'bank_transfer'
			});

			await addContribution({
				date: new Date(2024, 5, 20), // June 20
				accountId: savingsAccountId,
				amount: 300,
				source: 'other'
			});

			const account = await getSavingsAccount(savingsAccountId);
			expect(account?.currentBalance).toBe(800);
		});

		it('does not update balance for retirement accounts', async () => {
			await addContribution({
				date: new Date(2024, 5, 15), // June 15
				accountId: retirementAccountId,
				amount: 1000,
				source: 'payroll_deduction'
			});

			const account = await getSavingsAccount(retirementAccountId);
			expect(account?.currentBalance).toBeUndefined();
		});

		it('does not update balance for investment accounts', async () => {
			await addContribution({
				date: new Date(2024, 5, 15), // June 15
				accountId: investmentAccountId,
				amount: 1000,
				source: 'bank_transfer'
			});

			const account = await getSavingsAccount(investmentAccountId);
			expect(account?.currentBalance).toBeUndefined();
		});
	});

	describe('getContributionsForMonth', () => {
		it('returns contributions within date range', async () => {
			// Use local date constructors to avoid UTC timezone issues
			await addContribution({
				date: new Date(2024, 5, 1), // June 1 (months are 0-indexed)
				accountId: savingsAccountId,
				amount: 100,
				source: 'bank_transfer'
			});
			await addContribution({
				date: new Date(2024, 5, 30), // June 30
				accountId: savingsAccountId,
				amount: 200,
				source: 'bank_transfer'
			});
			await addContribution({
				date: new Date(2024, 6, 1), // July 1
				accountId: savingsAccountId,
				amount: 300,
				source: 'bank_transfer'
			});

			const june = await getContributionsForMonth('2024-06', savingsAccountId);
			expect(june).toHaveLength(2);
			expect(june.reduce((sum, c) => sum + c.amount, 0)).toBe(300);
		});

		it('filters by account if accountId provided', async () => {
			await addContribution({
				date: new Date(2024, 5, 15), // June 15
				accountId: savingsAccountId,
				amount: 100,
				source: 'bank_transfer'
			});
			await addContribution({
				date: new Date(2024, 5, 15), // June 15
				accountId: retirementAccountId,
				amount: 500,
				source: 'payroll_deduction'
			});

			const savingsContribs = await getContributionsForMonth('2024-06', savingsAccountId);
			expect(savingsContribs).toHaveLength(1);
			expect(savingsContribs[0].amount).toBe(100);
		});

		it('returns empty array for months with no contributions', async () => {
			const contributions = await getContributionsForMonth('2024-06', savingsAccountId);
			expect(contributions).toEqual([]);
		});
	});

	describe('getAllContributionsForMonth', () => {
		it('returns all contributions for all accounts in a month', async () => {
			await addContribution({
				date: new Date(2024, 5, 15), // June 15
				accountId: savingsAccountId,
				amount: 100,
				source: 'bank_transfer'
			});
			await addContribution({
				date: new Date(2024, 5, 15), // June 15
				accountId: retirementAccountId,
				amount: 500,
				source: 'payroll_deduction'
			});

			const allContribs = await getAllContributionsForMonth('2024-06');
			expect(allContribs).toHaveLength(2);
		});
	});

	describe('getContributionsAffectingAvailable', () => {
		it('includes bank_transfer contributions', async () => {
			await addContribution({
				date: new Date(2024, 5, 15), // June 15
				accountId: savingsAccountId,
				amount: 500,
				source: 'bank_transfer'
			});

			const contributions = await getContributionsAffectingAvailable('2024-06');
			expect(contributions).toHaveLength(1);
			expect(contributions[0].source).toBe('bank_transfer');
		});

		it('includes other contributions', async () => {
			await addContribution({
				date: new Date(2024, 5, 15), // June 15
				accountId: savingsAccountId,
				amount: 200,
				source: 'other'
			});

			const contributions = await getContributionsAffectingAvailable('2024-06');
			expect(contributions).toHaveLength(1);
		});

		it('excludes payroll_deduction contributions', async () => {
			await addContribution({
				date: new Date(2024, 5, 15), // June 15
				accountId: retirementAccountId,
				amount: 1000,
				source: 'payroll_deduction'
			});

			const contributions = await getContributionsAffectingAvailable('2024-06');
			expect(contributions).toHaveLength(0);
		});

		it('excludes interest contributions', async () => {
			await addContribution({
				date: new Date(2024, 5, 15), // June 15
				accountId: savingsAccountId,
				amount: 50,
				source: 'interest'
			});

			const contributions = await getContributionsAffectingAvailable('2024-06');
			expect(contributions).toHaveLength(0);
		});

		it('excludes employer_match contributions', async () => {
			await addContribution({
				date: new Date(2024, 5, 15), // June 15
				accountId: retirementAccountId,
				amount: 500,
				source: 'employer_match'
			});

			const contributions = await getContributionsAffectingAvailable('2024-06');
			expect(contributions).toHaveLength(0);
		});

		it('correctly filters mixed sources', async () => {
			await addContribution({
				date: new Date(2024, 5, 1), // June 1
				accountId: savingsAccountId,
				amount: 500,
				source: 'bank_transfer' // INCLUDED
			});
			await addContribution({
				date: new Date(2024, 5, 5), // June 5
				accountId: retirementAccountId,
				amount: 1000,
				source: 'payroll_deduction' // EXCLUDED
			});
			await addContribution({
				date: new Date(2024, 5, 10), // June 10
				accountId: savingsAccountId,
				amount: 10,
				source: 'interest' // EXCLUDED
			});
			await addContribution({
				date: new Date(2024, 5, 15), // June 15
				accountId: retirementAccountId,
				amount: 500,
				source: 'employer_match' // EXCLUDED
			});
			await addContribution({
				date: new Date(2024, 5, 20), // June 20
				accountId: investmentAccountId,
				amount: 200,
				source: 'other' // INCLUDED
			});

			const contributions = await getContributionsAffectingAvailable('2024-06');
			expect(contributions).toHaveLength(2);

			const total = contributions.reduce((sum, c) => sum + c.amount, 0);
			expect(total).toBe(700); // 500 + 200
		});
	});

	describe('getTotalSavedForMonth', () => {
		it('sums all contributions for the month', async () => {
			await addContribution({
				date: new Date(2024, 5, 1), // June 1
				accountId: savingsAccountId,
				amount: 500,
				source: 'bank_transfer'
			});
			await addContribution({
				date: new Date(2024, 5, 15), // June 15
				accountId: retirementAccountId,
				amount: 1000,
				source: 'payroll_deduction'
			});
			await addContribution({
				date: new Date(2024, 5, 30), // June 30
				accountId: savingsAccountId,
				amount: 25,
				source: 'interest'
			});

			const total = await getTotalSavedForMonth('2024-06');
			expect(total).toBe(1525);
		});

		it('returns 0 for months with no contributions', async () => {
			const total = await getTotalSavedForMonth('2024-06');
			expect(total).toBe(0);
		});
	});

	describe('getYTDContributions', () => {
		it('returns contributions for the current year', async () => {
			const currentYear = new Date().getFullYear();

			// Use local date constructor (months are 0-indexed)
			await addContribution({
				date: new Date(currentYear, 0, 15), // Jan 15
				accountId: savingsAccountId,
				amount: 500,
				source: 'bank_transfer'
			});
			await addContribution({
				date: new Date(currentYear, 0, 20), // Jan 20 (use same month to ensure within YTD)
				accountId: savingsAccountId,
				amount: 500,
				source: 'bank_transfer'
			});
			// Previous year - should not be included
			await addContribution({
				date: new Date(currentYear - 1, 11, 15), // Dec 15 of previous year
				accountId: savingsAccountId,
				amount: 1000,
				source: 'bank_transfer'
			});

			const ytd = await getYTDContributions(savingsAccountId);
			expect(ytd).toHaveLength(2);
		});

		it('filters by account', async () => {
			const currentYear = new Date().getFullYear();

			await addContribution({
				date: new Date(currentYear, 0, 15), // Jan 15
				accountId: savingsAccountId,
				amount: 500,
				source: 'bank_transfer'
			});
			await addContribution({
				date: new Date(currentYear, 0, 15), // Jan 15
				accountId: retirementAccountId,
				amount: 1000,
				source: 'payroll_deduction'
			});

			const ytd = await getYTDContributions(savingsAccountId);
			expect(ytd).toHaveLength(1);
			expect(ytd[0].accountId).toBe(savingsAccountId);
		});
	});

	describe('updateContribution', () => {
		it('updates specified fields', async () => {
			const id = await addContribution({
				date: new Date(2024, 5, 15), // June 15
				accountId: savingsAccountId,
				amount: 500,
				source: 'bank_transfer',
				notes: 'Original'
			});

			await updateContribution(id, { amount: 600, notes: 'Updated' });

			const contribution = await db.savingsContributions.get(id);
			expect(contribution?.amount).toBe(600);
			expect(contribution?.notes).toBe('Updated');
		});

		it('updates updatedAt timestamp', async () => {
			const id = await addContribution({
				date: new Date(2024, 5, 15), // June 15
				accountId: savingsAccountId,
				amount: 500,
				source: 'bank_transfer'
			});

			const original = await db.savingsContributions.get(id);
			const originalUpdatedAt = original!.updatedAt;

			await new Promise((resolve) => setTimeout(resolve, 10));

			await updateContribution(id, { amount: 600 });

			const updated = await db.savingsContributions.get(id);
			expect(updated!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
		});

		it('adjusts account balance delta for savings accounts', async () => {
			const id = await addContribution({
				date: new Date(2024, 5, 15), // June 15
				accountId: savingsAccountId,
				amount: 500,
				source: 'bank_transfer'
			});

			let account = await getSavingsAccount(savingsAccountId);
			expect(account?.currentBalance).toBe(500);

			// Update from 500 to 800 (delta = +300)
			await updateContribution(id, { amount: 800 });

			account = await getSavingsAccount(savingsAccountId);
			expect(account?.currentBalance).toBe(800);
		});

		it('handles balance decrease on contribution update', async () => {
			const id = await addContribution({
				date: new Date(2024, 5, 15), // June 15
				accountId: savingsAccountId,
				amount: 500,
				source: 'bank_transfer'
			});

			// Update from 500 to 300 (delta = -200)
			await updateContribution(id, { amount: 300 });

			const account = await getSavingsAccount(savingsAccountId);
			expect(account?.currentBalance).toBe(300);
		});

		it('does not adjust balance for retirement accounts', async () => {
			const id = await addContribution({
				date: new Date(2024, 5, 15), // June 15
				accountId: retirementAccountId,
				amount: 500,
				source: 'payroll_deduction'
			});

			await updateContribution(id, { amount: 1000 });

			const account = await getSavingsAccount(retirementAccountId);
			expect(account?.currentBalance).toBeUndefined();
		});
	});

	describe('deleteContribution', () => {
		it('removes contribution', async () => {
			const id = await addContribution({
				date: new Date(2024, 5, 15), // June 15
				accountId: savingsAccountId,
				amount: 500,
				source: 'bank_transfer'
			});

			await deleteContribution(id);

			const contribution = await db.savingsContributions.get(id);
			expect(contribution).toBeUndefined();
		});

		it('subtracts from account balance for savings accounts', async () => {
			const id = await addContribution({
				date: new Date(2024, 5, 15), // June 15
				accountId: savingsAccountId,
				amount: 500,
				source: 'bank_transfer'
			});

			let account = await getSavingsAccount(savingsAccountId);
			expect(account?.currentBalance).toBe(500);

			await deleteContribution(id);

			account = await getSavingsAccount(savingsAccountId);
			expect(account?.currentBalance).toBe(0);
		});

		it('does not affect balance for retirement accounts', async () => {
			const id = await addContribution({
				date: new Date(2024, 5, 15), // June 15
				accountId: retirementAccountId,
				amount: 1000,
				source: 'payroll_deduction'
			});

			await deleteContribution(id);

			const account = await getSavingsAccount(retirementAccountId);
			expect(account?.currentBalance).toBeUndefined();
		});

		it('handles non-existent ID gracefully', async () => {
			await expect(deleteContribution(99999)).resolves.toBeUndefined();
		});
	});
});
