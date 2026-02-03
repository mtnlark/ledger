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
	deleteContribution,
	getAverageMonthlyContribution,
	projectGoalCompletion,
	getGoalStatus
} from './savingsContributions';
import { addSavingsAccount, getSavingsAccount, updateSavingsAccount } from './savingsAccounts';

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

	// ============================================================================
	// Goal Tracking Tests
	// ============================================================================

	describe('getAverageMonthlyContribution', () => {
		it('returns 0 for account with no contributions', async () => {
			const avg = await getAverageMonthlyContribution(savingsAccountId);
			expect(avg).toBe(0);
		});

		it('calculates average over all contributions', async () => {
			// Add contributions across 3 months
			await addContribution({
				date: new Date(2024, 0, 15), // Jan
				accountId: savingsAccountId,
				amount: 300,
				source: 'bank_transfer'
			});
			await addContribution({
				date: new Date(2024, 1, 15), // Feb
				accountId: savingsAccountId,
				amount: 600,
				source: 'bank_transfer'
			});
			await addContribution({
				date: new Date(2024, 2, 15), // Mar
				accountId: savingsAccountId,
				amount: 900,
				source: 'bank_transfer'
			});

			// Total: 1800 over 3 months = 600/month
			const avg = await getAverageMonthlyContribution(savingsAccountId);
			expect(avg).toBe(600);
		});

		it('calculates average over specified number of months', async () => {
			const now = new Date();
			const currentMonth = now.getMonth();
			const currentYear = now.getFullYear();

			// Add a contribution 1 month ago
			const oneMonthAgo = new Date(currentYear, currentMonth - 1, 15);
			await addContribution({
				date: oneMonthAgo,
				accountId: savingsAccountId,
				amount: 500,
				source: 'bank_transfer'
			});

			// Add a contribution 7 months ago (outside 6-month window)
			const sevenMonthsAgo = new Date(currentYear, currentMonth - 7, 15);
			await addContribution({
				date: sevenMonthsAgo,
				accountId: savingsAccountId,
				amount: 1000,
				source: 'bank_transfer'
			});

			// 6-month window should only include the 500 contribution
			const avg = await getAverageMonthlyContribution(savingsAccountId, 6);
			// 500 over 6 months = 83.33
			expect(avg).toBeCloseTo(83.33, 2);
		});

		it('handles multiple contributions in same month', async () => {
			await addContribution({
				date: new Date(2024, 0, 5), // Jan 5
				accountId: savingsAccountId,
				amount: 200,
				source: 'bank_transfer'
			});
			await addContribution({
				date: new Date(2024, 0, 15), // Jan 15
				accountId: savingsAccountId,
				amount: 300,
				source: 'bank_transfer'
			});
			await addContribution({
				date: new Date(2024, 1, 15), // Feb 15
				accountId: savingsAccountId,
				amount: 500,
				source: 'bank_transfer'
			});

			// Total: 1000 over 2 months = 500/month
			const avg = await getAverageMonthlyContribution(savingsAccountId);
			expect(avg).toBe(500);
		});
	});

	describe('projectGoalCompletion', () => {
		it('returns current date if goal already achieved', () => {
			const now = new Date();
			const result = projectGoalCompletion(10000, 10000, 500);

			expect(result).toBeInstanceOf(Date);
			// Should be approximately now (within a few seconds)
			expect(result!.getTime()).toBeCloseTo(now.getTime(), -3);
		});

		it('returns current date if already past goal', () => {
			const now = new Date();
			const result = projectGoalCompletion(12000, 10000, 500);

			expect(result).toBeInstanceOf(Date);
			expect(result!.getTime()).toBeCloseTo(now.getTime(), -3);
		});

		it('returns null for zero contribution rate', () => {
			const result = projectGoalCompletion(5000, 10000, 0);
			expect(result).toBeNull();
		});

		it('returns null for negative contribution rate', () => {
			const result = projectGoalCompletion(5000, 10000, -100);
			expect(result).toBeNull();
		});

		it('projects completion date correctly', () => {
			const now = new Date();
			// $5000 remaining, $500/month = 10 months
			const result = projectGoalCompletion(5000, 10000, 500);

			expect(result).toBeInstanceOf(Date);
			const expectedMonth = new Date(now);
			expectedMonth.setMonth(expectedMonth.getMonth() + 10);
			expect(result!.getMonth()).toBe(expectedMonth.getMonth());
		});

		it('rounds up months needed', () => {
			const now = new Date();
			// $5001 remaining, $500/month = 10.002 months, rounds to 11
			const result = projectGoalCompletion(4999, 10000, 500);

			const expectedMonth = new Date(now);
			expectedMonth.setMonth(expectedMonth.getMonth() + 11);
			expect(result!.getMonth()).toBe(expectedMonth.getMonth());
		});
	});

	describe('getGoalStatus', () => {
		it('returns null for account without goal', async () => {
			const status = await getGoalStatus(savingsAccountId);
			expect(status).toBeNull();
		});

		it('returns on track for goal already achieved', async () => {
			// Set up account with goal that's already met
			await updateSavingsAccount(savingsAccountId, {
				currentBalance: 10000,
				targetAmount: 10000,
				targetDate: new Date(2025, 11, 31) // Dec 31, 2025
			});

			const status = await getGoalStatus(savingsAccountId);
			expect(status).not.toBeNull();
			expect(status!.isOnTrack).toBe(true);
			expect(status!.shortfall).toBe(0);
			expect(status!.recommendedMonthly).toBe(0);
		});

		it('returns on track when current pace exceeds required pace', async () => {
			const now = new Date();
			const targetDate = new Date(now);
			targetDate.setMonth(targetDate.getMonth() + 12); // 12 months from now

			// Set up account: $5000 balance, $10000 target, need $5000 more
			// Required: $5000 / 12 months ≈ $416.67/month
			await updateSavingsAccount(savingsAccountId, {
				currentBalance: 5000,
				targetAmount: 10000,
				targetDate
			});

			// Add contribution history showing $500/month average
			for (let i = 1; i <= 6; i++) {
				const date = new Date(now);
				date.setMonth(date.getMonth() - i);
				await addContribution({
					date,
					accountId: savingsAccountId,
					amount: 500,
					source: 'bank_transfer'
				});
			}

			const status = await getGoalStatus(savingsAccountId);
			expect(status).not.toBeNull();
			expect(status!.isOnTrack).toBe(true);
			expect(status!.shortfall).toBe(0);
		});

		it('returns off track when current pace is below required pace', async () => {
			const now = new Date();
			const targetDate = new Date(now);
			targetDate.setMonth(targetDate.getMonth() + 6); // 6 months from now

			// Set up account: $2000 balance, $10000 target, need $8000 more
			// Required: $8000 / 6 months ≈ $1333.33/month
			await updateSavingsAccount(savingsAccountId, {
				currentBalance: 2000,
				targetAmount: 10000,
				targetDate
			});

			// Add contribution history showing only $300/month average
			for (let i = 1; i <= 6; i++) {
				const date = new Date(now);
				date.setMonth(date.getMonth() - i);
				await addContribution({
					date,
					accountId: savingsAccountId,
					amount: 300,
					source: 'bank_transfer'
				});
			}

			const status = await getGoalStatus(savingsAccountId);
			expect(status).not.toBeNull();
			expect(status!.isOnTrack).toBe(false);
			expect(status!.shortfall).toBeGreaterThan(0);
			expect(status!.recommendedMonthly).toBeGreaterThan(300);
		});

		it('handles target date in the past', async () => {
			const pastDate = new Date();
			pastDate.setMonth(pastDate.getMonth() - 1);

			await updateSavingsAccount(savingsAccountId, {
				currentBalance: 5000,
				targetAmount: 10000,
				targetDate: pastDate
			});

			const status = await getGoalStatus(savingsAccountId);
			expect(status).not.toBeNull();
			expect(status!.isOnTrack).toBe(false);
			expect(status!.monthsRemaining).toBe(0);
			expect(status!.shortfall).toBe(5000); // Full remaining amount
		});

		it('handles goal without target date (no deadline)', async () => {
			await updateSavingsAccount(savingsAccountId, {
				currentBalance: 3000,
				targetAmount: 10000
				// No targetDate
			});

			// Add some contributions
			const now = new Date();
			for (let i = 1; i <= 3; i++) {
				const date = new Date(now);
				date.setMonth(date.getMonth() - i);
				await addContribution({
					date,
					accountId: savingsAccountId,
					amount: 500,
					source: 'bank_transfer'
				});
			}

			const status = await getGoalStatus(savingsAccountId);
			expect(status).not.toBeNull();
			expect(status!.isOnTrack).toBe(true); // No deadline = always on track
			expect(status!.monthsRemaining).toBeNull();
			expect(status!.projectedCompletion).toBeInstanceOf(Date);
		});

		it('handles zero contribution history', async () => {
			const targetDate = new Date();
			targetDate.setMonth(targetDate.getMonth() + 12);

			await updateSavingsAccount(savingsAccountId, {
				currentBalance: 1000,
				targetAmount: 10000,
				targetDate
			});

			// No contributions added

			const status = await getGoalStatus(savingsAccountId);
			expect(status).not.toBeNull();
			expect(status!.isOnTrack).toBe(false);
			expect(status!.projectedCompletion).toBeNull(); // Can't project with no history
		});
	});
});
