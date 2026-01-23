/**
 * Category average calculations for anomaly detection.
 */

import type { Transaction } from '$lib/db';
import { getSpendingByCategory } from './spending';

/**
 * Compute the average spending per category across a set of months.
 * Divides by total months (not months with spending) for consistent averages.
 *
 * @param getTransactionsForMonth Function to retrieve transactions for a given month key
 * @param months Array of month keys to average across
 * @returns Map of categoryId -> average spending
 */
export function computeCategoryAverages(
	getTransactionsForMonth: (month: string) => Transaction[],
	months: string[]
): Map<number, number> {
	const averages = new Map<number, number>();
	if (months.length === 0) return averages;

	const categoryTotals = new Map<number, number>();

	for (const month of months) {
		const transactions = getTransactionsForMonth(month);
		const spending = getSpendingByCategory(transactions);
		for (const [catId, amount] of spending) {
			categoryTotals.set(catId, (categoryTotals.get(catId) || 0) + amount);
		}
	}

	for (const [catId, total] of categoryTotals) {
		averages.set(catId, total / months.length);
	}

	return averages;
}
