/**
 * Budget alert calculation utilities
 */

export type BudgetAlertType = 'over' | 'at' | 'approaching';

export interface BudgetAlert {
	type: BudgetAlertType;
	categoryName: string;
	categoryIcon: string;
	amount: number; // Over amount or remaining amount
}

export interface CategoryBudgetData {
	categoryId: number;
	categoryName: string;
	categoryIcon: string;
	budgetAmount: number;
	spent: number;
}

// Threshold for "approaching budget" alert (within $5)
export const APPROACHING_THRESHOLD = 5;

// Epsilon for floating point comparison
// Using $0.50 because formatCurrency rounds to whole dollars,
// so any amount < $0.50 would display as $0
const EPSILON = 0.5;

/**
 * Check if two numbers are approximately equal (within epsilon)
 */
function approxEqual(a: number, b: number): boolean {
	return Math.abs(a - b) < EPSILON;
}

/**
 * Check if a number is approximately zero
 */
function approxZero(n: number): boolean {
	return Math.abs(n) < EPSILON;
}

/**
 * Calculate budget alerts for a list of category budgets
 *
 * @param categoryBudgets - Array of budget data with spending
 * @returns Sorted array of alerts (over first, then at, then approaching)
 */
export function calculateBudgetAlerts(categoryBudgets: CategoryBudgetData[]): BudgetAlert[] {
	const alerts: BudgetAlert[] = [];

	for (const data of categoryBudgets) {
		const remaining = data.budgetAmount - data.spent;

		if (remaining < -EPSILON) {
			// Over budget (more than epsilon below zero)
			alerts.push({
				type: 'over',
				categoryName: data.categoryName,
				categoryIcon: data.categoryIcon,
				amount: Math.abs(remaining)
			});
		} else if (approxZero(remaining)) {
			// Exactly at budget (within epsilon of zero)
			alerts.push({
				type: 'at',
				categoryName: data.categoryName,
				categoryIcon: data.categoryIcon,
				amount: 0
			});
		} else if (remaining <= APPROACHING_THRESHOLD) {
			// Approaching budget (within threshold but not at zero)
			alerts.push({
				type: 'approaching',
				categoryName: data.categoryName,
				categoryIcon: data.categoryIcon,
				amount: remaining
			});
		}
	}

	// Sort: over budget first, then at budget, then approaching
	alerts.sort((a, b) => {
		const priority: Record<BudgetAlertType, number> = { over: 0, at: 1, approaching: 2 };
		if (priority[a.type] !== priority[b.type]) {
			return priority[a.type] - priority[b.type];
		}
		return a.categoryName.localeCompare(b.categoryName);
	});

	return alerts;
}
