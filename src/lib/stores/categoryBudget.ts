import { db, type CategoryBudget, navigateMonth } from '$lib/db';
import { persistData } from '$lib/storage';

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
 * Calculate spending for a category in a specific month
 * Returns user's portion (amount - partnerShare for shared transactions)
 */
async function getCategorySpendingForMonth(categoryId: number, month: string): Promise<number> {
	const transactions = await db.transactions
		.where('categoryId')
		.equals(categoryId)
		.toArray();

	// Filter to target month and exclude split parents
	const monthTransactions = transactions.filter((t) => {
		const txMonth = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, '0')}`;
		return txMonth === month && !t.isSplitParent;
	});

	// Sum user's portion
	return monthTransactions.reduce((sum, t) => {
		const userAmount = t.isShared ? t.amount - t.partnerShare : t.amount;
		return sum + userAmount;
	}, 0);
}

/**
 * Calculate suggested budget for a category based on historical spending
 * Uses average of last 3 months (non-zero months only), rounded to nearest $5
 * @param categoryId - The category ID
 * @param targetMonth - The month to calculate suggestion for
 * @returns Suggested budget amount (0 if no history)
 */
export async function calculateSuggestedBudget(
	categoryId: number,
	targetMonth: string
): Promise<number> {
	// Get previous 3 months
	const months: string[] = [];
	let currentMonth = targetMonth;
	for (let i = 0; i < 3; i++) {
		currentMonth = navigateMonth(currentMonth, -1);
		months.push(currentMonth);
	}

	// Calculate spending for each month
	const spending: number[] = [];
	for (const month of months) {
		const amount = await getCategorySpendingForMonth(categoryId, month);
		if (amount > 0) {
			spending.push(amount);
		}
	}

	// No spending history
	if (spending.length === 0) {
		return 0;
	}

	// Calculate average
	const average = spending.reduce((sum, s) => sum + s, 0) / spending.length;

	// Round to nearest $5
	return Math.round(average / 5) * 5;
}

/**
 * Generate suggestions for all active categories
 * @param month - The target month
 * @returns Map of categoryId to suggested amount
 */
export async function generateAllSuggestions(month: string): Promise<Map<number, number>> {
	const categories = await db.categories.filter((c) => c.isActive).toArray();
	const suggestions = new Map<number, number>();

	for (const category of categories) {
		const suggested = await calculateSuggestedBudget(category.id!, month);
		suggestions.set(category.id!, suggested);
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
				createdAt: now,
				updatedAt: now
			});
		}
	}

	await persistData();
}

/**
 * Calculate total spending for a category in a month (for display)
 * This is exported for use in the Budget page
 */
export async function getCategorySpending(categoryId: number, month: string): Promise<number> {
	return getCategorySpendingForMonth(categoryId, month);
}

/**
 * Get spending for all categories in a month
 * @param month - Month in "YYYY-MM" format
 * @returns Map of categoryId to spending amount
 */
export async function getAllCategorySpending(month: string): Promise<Map<number, number>> {
	const transactions = await db.transactions.toArray();
	const spending = new Map<number, number>();

	for (const t of transactions) {
		// Skip split parents
		if (t.isSplitParent) continue;

		// Check month
		const txMonth = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, '0')}`;
		if (txMonth !== month) continue;

		// Calculate user's portion
		const userAmount = t.isShared ? t.amount - t.partnerShare : t.amount;
		const current = spending.get(t.categoryId) || 0;
		spending.set(t.categoryId, current + userAmount);
	}

	return spending;
}
