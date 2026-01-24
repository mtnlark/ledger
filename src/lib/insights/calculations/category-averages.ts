/**
 * Category average and statistics calculations for anomaly detection.
 */

import type { Transaction } from '$lib/db';
import { getSpendingByCategory } from './spending';
import { computeStdDev } from './stats';

/**
 * Per-category statistics: mean and standard deviation of monthly spending.
 */
export interface CategoryStats {
	mean: number;
	stdDev: number;
}

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

/**
 * Compute both mean and standard deviation of monthly spending per category.
 * Uses population standard deviation (divides by N, not N-1).
 *
 * @param getTransactionsForMonth Function to retrieve transactions for a given month key
 * @param months Array of month keys to compute stats across
 * @returns Map of categoryId -> { mean, stdDev }
 */
export function computeCategoryStats(
	getTransactionsForMonth: (month: string) => Transaction[],
	months: string[]
): Map<number, CategoryStats> {
	const stats = new Map<number, CategoryStats>();
	if (months.length === 0) return stats;

	// Collect per-month spending for each category
	const categoryMonthlyValues = new Map<number, number[]>();

	for (const month of months) {
		const transactions = getTransactionsForMonth(month);
		const spending = getSpendingByCategory(transactions);

		// Track which categories we've seen this month
		const seenThisMonth = new Set<number>();

		for (const [catId, amount] of spending) {
			if (!categoryMonthlyValues.has(catId)) {
				categoryMonthlyValues.set(catId, []);
			}
			categoryMonthlyValues.get(catId)!.push(amount);
			seenThisMonth.add(catId);
		}

		// For categories not seen this month, record 0
		for (const catId of categoryMonthlyValues.keys()) {
			if (!seenThisMonth.has(catId)) {
				categoryMonthlyValues.get(catId)!.push(0);
			}
		}
	}

	for (const [catId, values] of categoryMonthlyValues) {
		// Pad with zeros for months before the category first appeared
		while (values.length < months.length) {
			values.push(0);
		}
		const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
		const stdDev = computeStdDev(values);
		stats.set(catId, { mean, stdDev });
	}

	return stats;
}
