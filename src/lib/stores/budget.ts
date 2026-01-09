import { db, type MonthlyBudget } from '$lib/db';
import { persistData } from '$lib/storage';

export interface CashFlowResult {
	income: number;
	saved: number;
	available: number;
	spent: number;
	surplus: number;
	percentSpent: number;
	isOverBudget: boolean;
}

/**
 * Get the budget for a specific month
 * @param month - Month in "YYYY-MM" format (e.g., "2025-12")
 * @returns The MonthlyBudget or null if none exists
 */
export async function getBudgetForMonth(month: string): Promise<MonthlyBudget | null> {
	const budget = await db.monthlyBudgets.where('month').equals(month).first();
	return budget ?? null;
}

/**
 * Save or update budget for a specific month
 * Uses upsert pattern - creates if doesn't exist, updates if it does
 * @param month - Month in "YYYY-MM" format
 * @param data - Budget data (income, savedAmount, optional notes)
 */
export async function saveBudget(
	month: string,
	data: { income: number; savedAmount: number; notes?: string }
): Promise<void> {
	const existing = await getBudgetForMonth(month);

	if (existing) {
		// Update existing budget
		await db.monthlyBudgets.update(existing.id!, {
			income: data.income,
			savedAmount: data.savedAmount,
			notes: data.notes
		});
	} else {
		// Create new budget
		await db.monthlyBudgets.add({
			month,
			income: data.income,
			savedAmount: data.savedAmount,
			notes: data.notes
		});
	}

	await persistData();
}

/**
 * Calculate cash flow metrics from budget and spending data
 * This is a pure function (no database access) for easy testing
 *
 * @param income - Total monthly income
 * @param saved - Amount set aside for savings
 * @param spent - Total amount spent (user's portion only)
 * @returns CashFlowResult with all computed metrics
 */
export function calculateCashFlow(income: number, saved: number, spent: number): CashFlowResult {
	const available = income - saved;
	const surplus = available - spent;

	// Calculate percentage spent, handling edge cases
	let percentSpent: number;
	if (available <= 0) {
		// If no budget available, cap at 100%
		percentSpent = 100;
	} else {
		percentSpent = (spent / available) * 100;
	}

	return {
		income,
		saved,
		available,
		spent,
		surplus,
		percentSpent,
		isOverBudget: surplus < 0
	};
}

/**
 * Get all budgets (for savings rate tracking over time)
 * @returns Array of all MonthlyBudget entries sorted by month
 */
export async function getAllBudgets(): Promise<MonthlyBudget[]> {
	const budgets = await db.monthlyBudgets.toArray();
	return budgets.sort((a, b) => a.month.localeCompare(b.month));
}
