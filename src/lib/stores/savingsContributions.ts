import { db, type SavingsContribution, type ContributionSource } from '$lib/db';
import { persistData } from '$lib/storage';
import { getSavingsAccount, updateAccountBalance } from './savingsAccounts';
import { getMonthDateRange } from '$lib/utils/date-helpers';
import { sumCurrency } from '$lib/utils/currency';

// Sources that affect "available to spend" (reduce it when contributed)
// Payroll deductions, interest, and employer matches are "free money" or pre-tax
const SOURCES_AFFECTING_AVAILABLE: ContributionSource[] = ['bank_transfer', 'other'];

// Add a new contribution
export async function addContribution(
	contribution: Omit<SavingsContribution, 'id' | 'createdAt' | 'updatedAt'>
): Promise<number> {
	const now = new Date();

	const newContribution: Omit<SavingsContribution, 'id'> = {
		...contribution,
		createdAt: now,
		updatedAt: now
	};

	const id = (await db.savingsContributions.add(newContribution)) as number;

	// Update account balance for savings type accounts
	const account = await getSavingsAccount(contribution.accountId);
	if (account?.accountType === 'savings') {
		await updateAccountBalance(contribution.accountId, contribution.amount);
	}

	await persistData();
	return id;
}

// Get contributions for a specific month, optionally filtered by account
export async function getContributionsForMonth(
	month: string,
	accountId: number
): Promise<SavingsContribution[]> {
	const { start, end } = getMonthDateRange(month);

	return db.savingsContributions
		.where('date')
		.between(start, end, true, true)
		.filter((c) => c.accountId === accountId)
		.toArray();
}

// Get all contributions for a month (all accounts)
export async function getAllContributionsForMonth(month: string): Promise<SavingsContribution[]> {
	const { start, end } = getMonthDateRange(month);

	return db.savingsContributions.where('date').between(start, end, true, true).toArray();
}

// Get all contributions (for insights/trends)
export async function getAllContributions(): Promise<SavingsContribution[]> {
	return db.savingsContributions.toArray();
}

// Get contributions that affect "available to spend"
// Excludes payroll deductions (pre-tax), interest, and employer matches
export async function getContributionsAffectingAvailable(
	month: string
): Promise<SavingsContribution[]> {
	const { start, end } = getMonthDateRange(month);

	return db.savingsContributions
		.where('date')
		.between(start, end, true, true)
		.filter((c) => SOURCES_AFFECTING_AVAILABLE.includes(c.source))
		.toArray();
}

// Get total saved for a month (all contributions, all sources)
export async function getTotalSavedForMonth(month: string): Promise<number> {
	const contributions = await getAllContributionsForMonth(month);
	return sumCurrency(contributions.map((c) => c.amount));
}

// Get year-to-date contributions for a specific account
export async function getYTDContributions(accountId: number): Promise<SavingsContribution[]> {
	const currentYear = new Date().getFullYear();
	const startOfYear = new Date(currentYear, 0, 1);
	const now = new Date();

	return db.savingsContributions
		.where('date')
		.between(startOfYear, now, true, true)
		.filter((c) => c.accountId === accountId)
		.toArray();
}

// Update a contribution
export async function updateContribution(
	id: number,
	updates: Partial<Omit<SavingsContribution, 'id' | 'createdAt'>>
): Promise<void> {
	const existing = await db.savingsContributions.get(id);
	if (!existing) return;

	// If amount changed, adjust the account balance for savings accounts
	if (updates.amount !== undefined && updates.amount !== existing.amount) {
		const account = await getSavingsAccount(existing.accountId);
		if (account?.accountType === 'savings') {
			const delta = updates.amount - existing.amount;
			await updateAccountBalance(existing.accountId, delta);
		}
	}

	await db.savingsContributions.update(id, {
		...updates,
		updatedAt: new Date()
	});
	await persistData();
}

// Delete a contribution
export async function deleteContribution(id: number): Promise<void> {
	const contribution = await db.savingsContributions.get(id);
	if (!contribution) return;

	// Subtract from account balance for savings accounts
	const account = await getSavingsAccount(contribution.accountId);
	if (account?.accountType === 'savings') {
		await updateAccountBalance(contribution.accountId, -contribution.amount);
	}

	await db.savingsContributions.delete(id);
	await persistData();
}
