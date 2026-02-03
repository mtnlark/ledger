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

export type GoalSeverity =
	| 'completed' // >= 100% progress
	| 'on_track' // Current pace meets required pace
	| 'behind' // Behind pace, but required rate is < 2x current rate
	| 'significantly_behind' // Way behind - would need to 2x+ savings rate
	| 'deadline_passed'; // Target date is in the past (checked first)

export interface GoalStatus {
	isOnTrack: boolean;
	shortfall: number; // How much short of target at current pace (0 if on track)
	recommendedMonthly: number; // Monthly contribution needed to hit goal
	projectedCompletion: Date | null; // When goal will be reached at current pace
	monthsRemaining: number | null; // Months until target date (null if no date set)
	severity: GoalSeverity; // Severity level for messaging
	projectedDateAtCurrentPace: Date | null; // When goal will actually be reached at current pace
	currentAverageMonthly: number; // Current average monthly contribution (for messaging)
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
 * Determine the severity level of goal progress.
 * Priority order: deadline_passed → completed → on_track → significantly_behind → behind
 */
function computeGoalSeverity(
	currentBalance: number,
	targetAmount: number,
	targetDate: Date | undefined,
	avgMonthly: number,
	recommendedMonthly: number
): GoalSeverity {
	const now = new Date();

	// Check if target date has passed (if set)
	if (targetDate) {
		const deadlineDate = new Date(targetDate);
		// Compare just the dates, not times
		deadlineDate.setHours(0, 0, 0, 0);
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		if (deadlineDate < today) {
			return 'deadline_passed';
		}
	}

	// Check if goal is completed
	if (currentBalance >= targetAmount) {
		return 'completed';
	}

	// If no target date, we can still be "on track" based on having contributions
	if (!targetDate) {
		return avgMonthly > 0 ? 'on_track' : 'behind';
	}

	// Check if on track (current pace >= required pace)
	if (avgMonthly >= recommendedMonthly) {
		return 'on_track';
	}

	// Check if significantly behind (would need to 2x+ savings rate)
	// If avgMonthly is 0 or very low, this is definitely significantly behind
	if (avgMonthly <= 0 || recommendedMonthly >= avgMonthly * 2) {
		return 'significantly_behind';
	}

	// Otherwise just behind (achievable with moderate increase)
	return 'behind';
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
		const severity = computeGoalSeverity(currentBalance, targetAmount, undefined, avgMonthly, 0);
		return {
			isOnTrack: severity === 'on_track' || severity === 'completed',
			shortfall: 0,
			recommendedMonthly: avgMonthly > 0 ? avgMonthly : 0,
			projectedCompletion,
			monthsRemaining: null,
			severity,
			projectedDateAtCurrentPace: projectedCompletion,
			currentAverageMonthly: avgMonthly
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
			monthsRemaining,
			severity: 'completed',
			projectedDateAtCurrentPace: new Date(),
			currentAverageMonthly: avgMonthly
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
			monthsRemaining: 0,
			severity: 'deadline_passed',
			projectedDateAtCurrentPace: projectedCompletion,
			currentAverageMonthly: avgMonthly
		};
	}

	// Calculate required monthly to hit goal
	const remaining = targetAmount - currentBalance;
	const recommendedMonthly = sumCurrency([remaining / monthsRemaining]);

	// On track if current pace meets or exceeds required pace
	const isOnTrack = avgMonthly >= recommendedMonthly;
	const shortfall = isOnTrack ? 0 : sumCurrency([(recommendedMonthly - avgMonthly) * monthsRemaining]);

	// Compute severity
	const severity = computeGoalSeverity(currentBalance, targetAmount, targetDate, avgMonthly, recommendedMonthly);

	return {
		isOnTrack,
		shortfall,
		recommendedMonthly,
		projectedCompletion,
		monthsRemaining,
		severity,
		projectedDateAtCurrentPace: projectedCompletion,
		currentAverageMonthly: avgMonthly
	};
}
