import { db, type CategoryBudget, navigateMonth } from '$lib/db';
import { getUserAmount } from '$lib/utils/currency';
import { persistData } from '$lib/storage';
import { getMonthDateRange } from '$lib/utils/date-helpers';
import {
	generateDecayWeights,
	computeWeightedMean,
	computeWeightedStdDev
} from '$lib/insights/calculations/stats';
import { config } from '$lib/config';
import {
	computeEffectiveBudgets,
	previousMonthKey,
	type RolloverOptions,
	type RolloverResult
} from '$lib/utils/budget-rollover';

/**
 * Get all category budgets for a specific month
 * @param month - Month in "YYYY-MM" format
 * @returns Array of CategoryBudget entries for that month
 */
export async function getCategoryBudgetsForMonth(month: string): Promise<CategoryBudget[]> {
	return db.categoryBudgets.where('month').equals(month).toArray();
}

/**
 * Get budget for a specific category and month
 * @param categoryId - The category ID
 * @param month - Month in "YYYY-MM" format
 * @returns The CategoryBudget or null if none exists
 */
export async function getCategoryBudget(
	categoryId: number,
	month: string
): Promise<CategoryBudget | null> {
	const budget = await db.categoryBudgets
		.where('[month+categoryId]')
		.equals([month, categoryId])
		.first();
	return budget ?? null;
}

/**
 * Save or update a category budget (upsert pattern)
 * @param categoryId - The category ID
 * @param month - Month in "YYYY-MM" format
 * @param budgetAmount - The budget amount to set
 */
export async function saveCategoryBudget(
	categoryId: number,
	month: string,
	budgetAmount: number
): Promise<void> {
	if (budgetAmount < 0) {
		throw new Error('Budget amount cannot be negative');
	}

	const existing = await getCategoryBudget(categoryId, month);
	const now = new Date();

	if (existing) {
		await db.categoryBudgets.update(existing.id!, {
			budgetAmount,
			updatedAt: now
		});
	} else {
		await db.categoryBudgets.add({
			month,
			categoryId,
			budgetAmount,
			createdAt: now,
			updatedAt: now
		});
	}

	await persistData();
}

/**
 * Delete a category budget (set to unbudgeted)
 * @param categoryId - The category ID
 * @param month - Month in "YYYY-MM" format
 */
export async function deleteCategoryBudget(categoryId: number, month: string): Promise<void> {
	const existing = await getCategoryBudget(categoryId, month);
	if (existing) {
		await db.categoryBudgets.delete(existing.id!);
		await persistData();
	}
}

/**
 * Set whether a category's budget rolls unused amounts into next month.
 * Separate from saveCategoryBudget so amount edits never touch the flag.
 */
export async function setCategoryBudgetRollover(
	categoryId: number,
	month: string,
	rollsOver: boolean
): Promise<void> {
	const existing = await getCategoryBudget(categoryId, month);
	if (!existing) return;
	await db.categoryBudgets.update(existing.id!, { rollsOver, updatedAt: new Date() });
	await persistData();
}

/**
 * Effective budgets for a month: base amounts plus rollover surpluses chained
 * from prior months, and the pool-level deficit carried from last month.
 * See utils/budget-rollover.ts for the semantics.
 */
export async function getEffectiveBudgetsForMonth(
	month: string,
	options: RolloverOptions = {}
): Promise<RolloverResult> {
	const maxChainMonths = options.maxChainMonths ?? 24;
	const allRows = await db.categoryBudgets.where('month').belowOrEqual(month).toArray();

	// Spending is only needed for window months that actually have budget rows
	const rowMonths = new Set(allRows.map((r) => r.month));
	const fetchMonths: string[] = [];
	let cursor = month;
	for (let i = 0; i < maxChainMonths; i++) {
		cursor = previousMonthKey(cursor);
		if (rowMonths.has(cursor)) fetchMonths.push(cursor);
	}

	const spendingEntries = await Promise.all(
		fetchMonths.map(async (m) => [m, await getAllCategorySpending(m)] as const)
	);

	return computeEffectiveBudgets(allRows, new Map(spendingEntries), month, options);
}

/**
 * Get the date range spanning multiple months for batch queries
 */
function getMultiMonthDateRange(months: string[]): { start: Date; end: Date } {
	if (months.length === 0) {
		const now = new Date();
		return { start: now, end: now };
	}

	// Sort months to find earliest and latest
	const sorted = [...months].sort();
	const { start } = getMonthDateRange(sorted[0]);
	const { end } = getMonthDateRange(sorted[sorted.length - 1]);
	return { start, end };
}

/**
 * Get month key from a date
 */
function getMonthKeyFromDate(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Calculate suggested budget for a category based on historical spending.
 * Uses weighted average of last N months (configurable, default 6) with exponential
 * decay so recent months have more influence. Adds adaptive headroom based on
 * sample size - more buffer when data is sparse.
 *
 * @param categoryId - The category ID
 * @param targetMonth - The month to calculate suggestion for
 * @returns Suggested budget amount (0 if no history)
 */
export async function calculateSuggestedBudget(
	categoryId: number,
	targetMonth: string
): Promise<number> {
	const { suggestionMonths, suggestionDecay, suggestionHeadroom } = config.budget;

	// Get previous N months (oldest first for proper weighting)
	const months: string[] = [];
	let currentMonth = targetMonth;
	for (let i = 0; i < suggestionMonths; i++) {
		currentMonth = navigateMonth(currentMonth, -1);
		months.unshift(currentMonth); // prepend to keep chronological order
	}

	// Load all transactions for the date range in one query
	const { start, end } = getMultiMonthDateRange(months);
	const transactions = await db.transactions
		.where('date')
		.between(start, end, true, true)
		.filter((t) => t.categoryId === categoryId && !t.isSplitParent && !t.isDeleted)
		.toArray();

	// Group by month and calculate spending
	const monthlySpending = new Map<string, number>();
	for (const t of transactions) {
		const monthKey = getMonthKeyFromDate(t.date);
		if (!months.includes(monthKey)) continue;

		const userAmount = getUserAmount(t);
		monthlySpending.set(monthKey, (monthlySpending.get(monthKey) || 0) + userAmount);
	}

	// Build spending array in chronological order (for proper weighting)
	// Include zeros for months with no spending to maintain time relationship
	const spending: number[] = [];
	for (const month of months) {
		const amount = monthlySpending.get(month) || 0;
		if (amount > 0) {
			spending.push(amount);
		}
	}

	// No spending history
	if (spending.length === 0) {
		return 0;
	}

	// Generate decay weights (oldest first, most recent = 1.0)
	const weights = generateDecayWeights(spending.length, suggestionDecay);

	// Calculate weighted mean and stdDev
	const mean = computeWeightedMean(spending, weights);
	const sd = computeWeightedStdDev(spending, weights);

	// Adaptive headroom: more buffer when sample size is small
	// With 1 month: headroom × 2.0, with 3 months: headroom × 1.33, with 6+: approaches base
	const adaptiveMultiplier = 1 + 1 / spending.length;
	const headroom = suggestionHeadroom * adaptiveMultiplier;

	const suggestion = mean + headroom * sd;

	// Round to nearest $5
	return Math.round(suggestion / 5) * 5;
}

/**
 * Generate suggestions for all active categories.
 * Uses a single batch query instead of N+1 queries.
 * Applies weighted averages with adaptive headroom (same logic as calculateSuggestedBudget).
 *
 * @param month - The target month
 * @returns Map of categoryId to suggested amount
 */
export async function generateAllSuggestions(month: string): Promise<Map<number, number>> {
	const { suggestionMonths, suggestionDecay, suggestionHeadroom } = config.budget;
	const categories = await db.categories.filter((c) => c.isActive).toArray();

	// Get previous N months (oldest first for proper weighting)
	const months: string[] = [];
	let currentMonth = month;
	for (let i = 0; i < suggestionMonths; i++) {
		currentMonth = navigateMonth(currentMonth, -1);
		months.unshift(currentMonth); // prepend to keep chronological order
	}

	// Load ALL transactions for the N-month range in ONE query
	const { start, end } = getMultiMonthDateRange(months);
	const transactions = await db.transactions
		.where('date')
		.between(start, end, true, true)
		.filter((t) => !t.isSplitParent && !t.isDeleted)
		.toArray();

	// Build spending map: Map<categoryId, Map<monthKey, spending>>
	const categoryMonthSpending = new Map<number, Map<string, number>>();

	for (const t of transactions) {
		const monthKey = getMonthKeyFromDate(t.date);
		if (!months.includes(monthKey)) continue;

		if (!categoryMonthSpending.has(t.categoryId)) {
			categoryMonthSpending.set(t.categoryId, new Map());
		}

		const userAmount = getUserAmount(t);
		const monthSpending = categoryMonthSpending.get(t.categoryId)!;
		monthSpending.set(monthKey, (monthSpending.get(monthKey) || 0) + userAmount);
	}

	// Calculate suggestions for each category
	const suggestions = new Map<number, number>();

	for (const category of categories) {
		const monthSpending = categoryMonthSpending.get(category.id!) || new Map();

		// Build spending array in chronological order (non-zero months only)
		const spending: number[] = [];
		for (const m of months) {
			const amount = monthSpending.get(m) || 0;
			if (amount > 0) {
				spending.push(amount);
			}
		}

		if (spending.length === 0) {
			suggestions.set(category.id!, 0);
		} else {
			// Generate decay weights and calculate weighted stats
			const weights = generateDecayWeights(spending.length, suggestionDecay);
			const mean = computeWeightedMean(spending, weights);
			const sd = computeWeightedStdDev(spending, weights);

			// Adaptive headroom based on sample size
			const adaptiveMultiplier = 1 + 1 / spending.length;
			const headroom = suggestionHeadroom * adaptiveMultiplier;

			const suggestion = mean + headroom * sd;
			suggestions.set(category.id!, Math.round(suggestion / 5) * 5);
		}
	}

	return suggestions;
}

/**
 * Copy budgets from one month to another
 * Only copies budgets that don't already exist in target month
 * @param sourceMonth - Month to copy from
 * @param targetMonth - Month to copy to
 */
export async function copyBudgetsFromMonth(
	sourceMonth: string,
	targetMonth: string
): Promise<void> {
	const sourceBudgets = await getCategoryBudgetsForMonth(sourceMonth);
	const now = new Date();

	for (const budget of sourceBudgets) {
		const existing = await getCategoryBudget(budget.categoryId, targetMonth);
		if (!existing) {
			await db.categoryBudgets.add({
				month: targetMonth,
				categoryId: budget.categoryId,
				budgetAmount: budget.budgetAmount,
				rollsOver: budget.rollsOver,
				createdAt: now,
				updatedAt: now
			});
		}
	}

	await persistData();
}

/**
 * Get spending for all categories in a month
 * Uses indexed date range query for O(log n) lookup instead of loading all transactions
 * @param month - Month in "YYYY-MM" format
 * @returns Map of categoryId to spending amount
 */
export async function getAllCategorySpending(month: string): Promise<Map<number, number>> {
	const { start, end } = getMonthDateRange(month);

	// Use indexed date range query - much more efficient than loading all transactions
	const transactions = await db.transactions
		.where('date')
		.between(start, end, true, true)
		.filter((t) => !t.isSplitParent && !t.isDeleted)
		.toArray();

	const spending = new Map<number, number>();

	for (const t of transactions) {
		// Calculate user's portion
		const userAmount = getUserAmount(t);
		const current = spending.get(t.categoryId) || 0;
		spending.set(t.categoryId, current + userAmount);
	}

	return spending;
}
