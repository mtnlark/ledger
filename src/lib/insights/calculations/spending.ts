/**
 * Spending calculations: category breakdowns and totals.
 */

import type { Transaction } from '$lib/db';
import { sumCurrency, getUserAmount, calculateTotalSpent } from '$lib/utils/currency';

export { getUserAmount };

/**
 * Calculate total spending by category for a list of transactions.
 * Returns user's portion for shared transactions.
 * Uses sumCurrency() to avoid floating-point accumulation errors.
 */
export function getSpendingByCategory(transactions: Transaction[]): Map<number, number> {
	// Collect amounts per category first, then sum with sumCurrency()
	const amountsByCategory = new Map<number, number[]>();
	for (const t of transactions) {
		const amount = getUserAmount(t);
		if (!amountsByCategory.has(t.categoryId)) {
			amountsByCategory.set(t.categoryId, []);
		}
		amountsByCategory.get(t.categoryId)!.push(amount);
	}

	// Sum each category's amounts to avoid floating-point drift
	const spending = new Map<number, number>();
	for (const [catId, amounts] of amountsByCategory) {
		spending.set(catId, sumCurrency(amounts));
	}
	return spending;
}

/**
 * Calculate the total user spending across all transactions.
 * Uses sumCurrency() to avoid floating-point accumulation errors.
 */
export function getTotalSpent(transactions: Transaction[]): number {
	return calculateTotalSpent(transactions);
}
