/**
 * Budget alert calculation utilities
 */

import { config } from '$lib/config';

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

// Re-export for backwards compatibility
export const APPROACHING_THRESHOLD = config.budget.approachingThreshold;

/**
 * Calculate budget alerts for a list of category budgets
 *
 * Alert types are determined based on remaining amount rounded to whole dollars,
 * since that's how they're displayed to users. This prevents confusing alerts
 * like "$0 over" or "$0 left approaching" when spending is very close to budget.
 *
 * @param categoryBudgets - Array of budget data with spending
 * @returns Sorted array of alerts (over first, then at, then approaching)
 */
export function calculateBudgetAlerts(categoryBudgets: CategoryBudgetData[]): BudgetAlert[] {
	const alerts: BudgetAlert[] = [];

	for (const data of categoryBudgets) {
		const remaining = data.budgetAmount - data.spent;
		// Round to whole dollars for display consistency
		const roundedRemaining = Math.round(remaining);

		if (roundedRemaining < 0) {
			// Over budget (rounded remaining is negative)
			alerts.push({
				type: 'over',
				categoryName: data.categoryName,
				categoryIcon: data.categoryIcon,
				amount: Math.abs(roundedRemaining)
			});
		} else if (roundedRemaining === 0) {
			// At budget (remaining rounds to zero)
			alerts.push({
				type: 'at',
				categoryName: data.categoryName,
				categoryIcon: data.categoryIcon,
				amount: 0
			});
		} else if (roundedRemaining <= config.budget.approachingThreshold) {
			// Approaching budget (within threshold)
			alerts.push({
				type: 'approaching',
				categoryName: data.categoryName,
				categoryIcon: data.categoryIcon,
				amount: roundedRemaining
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
