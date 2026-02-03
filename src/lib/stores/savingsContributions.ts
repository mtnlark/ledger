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

// ============================================================================
// Goal Tracking Functions
// ============================================================================

export interface GoalStatus {
	isOnTrack: boolean;
	shortfall: number; // How much short of target at current pace (0 if on track)
	recommendedMonthly: number; // Monthly contribution needed to hit goal
	projectedCompletion: Date | null; // When goal will be reached at current pace
	monthsRemaining: number | null; // Months until target date (null if no date set)
}

/**
 * Calculate average monthly contribution for an account over a period.
 * @param accountId - The savings account ID
 * @param months - Number of months to average over (default: all contributions)
 * @returns Average monthly contribution amount
 */
export async function getAverageMonthlyContribution(
	accountId: number,
	months?: number
): Promise<number> {
	let contributions: SavingsContribution[];

	if (months) {
		// Get contributions from the last N months
		const endDate = new Date();
		const startDate = new Date();
		startDate.setMonth(startDate.getMonth() - months);

		contributions = await db.savingsContributions
			.where('date')
			.between(startDate, endDate, true, true)
			.filter((c) => c.accountId === accountId)
			.toArray();

		// If no contributions in the period, return 0
		if (contributions.length === 0) return 0;

		// Sum contributions and divide by number of months
		const total = sumCurrency(contributions.map((c) => c.amount));
		return sumCurrency([total / months]);
	} else {
		// Get all contributions for this account
		contributions = await db.savingsContributions
			.where('accountId')
			.equals(accountId)
			.toArray();

		if (contributions.length === 0) return 0;

		// Find the date range
		const dates = contributions.map((c) => c.date.getTime());
		const earliest = new Date(Math.min(...dates));
		const latest = new Date(Math.max(...dates));

		// Calculate number of months between first and last contribution
		const monthsDiff =
			(latest.getFullYear() - earliest.getFullYear()) * 12 +
			(latest.getMonth() - earliest.getMonth()) +
			1; // +1 to include both months

		const total = sumCurrency(contributions.map((c) => c.amount));
		return sumCurrency([total / monthsDiff]);
	}
}

/**
 * Project when a goal will be reached at the current pace.
 * @param currentBalance - Current account balance
 * @param targetAmount - Goal target amount
 * @param averageMonthlyContribution - Average monthly contribution
 * @returns Projected completion date, or null if can't project (zero/negative rate)
 */
export function projectGoalCompletion(
	currentBalance: number,
	targetAmount: number,
	averageMonthlyContribution: number
): Date | null {
	// Already at or past goal
	if (currentBalance >= targetAmount) {
		return new Date(); // Goal already achieved
	}

	// Can't project with zero or negative contribution rate
	if (averageMonthlyContribution <= 0) {
		return null;
	}

	const remaining = targetAmount - currentBalance;
	const monthsNeeded = Math.ceil(remaining / averageMonthlyContribution);

	const projected = new Date();
	projected.setMonth(projected.getMonth() + monthsNeeded);
	return projected;
}

/**
 * Check if an account is on track to hit its goal by the target date.
 * @param accountId - The savings account ID
 * @returns GoalStatus with tracking info, or null if account has no goal
 */
export async function getGoalStatus(accountId: number): Promise<GoalStatus | null> {
	const account = await getSavingsAccount(accountId);
	if (!account || account.targetAmount === undefined) {
		return null;
	}

	const currentBalance = account.currentBalance ?? 0;
	const targetAmount = account.targetAmount;
	const targetDate = account.targetDate;

	// Get average monthly contribution (last 6 months for more recent accuracy)
	const avgMonthly = await getAverageMonthlyContribution(accountId, 6);

	// Project completion at current pace
	const projectedCompletion = projectGoalCompletion(currentBalance, targetAmount, avgMonthly);

	// If no target date, just return projection info
	if (!targetDate) {
		return {
			isOnTrack: true, // No deadline = always on track
			shortfall: 0,
			recommendedMonthly: avgMonthly > 0 ? avgMonthly : 0,
			projectedCompletion,
			monthsRemaining: null
		};
	}

	// Calculate months remaining until target date
	const now = new Date();
	const monthsRemaining = Math.max(
		0,
		(targetDate.getFullYear() - now.getFullYear()) * 12 +
			(targetDate.getMonth() - now.getMonth())
	);

	// Already at or past goal
	if (currentBalance >= targetAmount) {
		return {
			isOnTrack: true,
			shortfall: 0,
			recommendedMonthly: 0,
			projectedCompletion: new Date(),
			monthsRemaining
		};
	}

	// Target date is in the past
	if (monthsRemaining <= 0) {
		const shortfall = targetAmount - currentBalance;
		return {
			isOnTrack: false,
			shortfall,
			recommendedMonthly: shortfall, // Would need entire shortfall in one month
			projectedCompletion,
			monthsRemaining: 0
		};
	}

	// Calculate required monthly to hit goal
	const remaining = targetAmount - currentBalance;
	const recommendedMonthly = sumCurrency([remaining / monthsRemaining]);

	// On track if current pace meets or exceeds required pace
	const isOnTrack = avgMonthly >= recommendedMonthly;
	const shortfall = isOnTrack ? 0 : sumCurrency([(recommendedMonthly - avgMonthly) * monthsRemaining]);

	return {
		isOnTrack,
		shortfall,
		recommendedMonthly,
		projectedCompletion,
		monthsRemaining
	};
}
