/**
 * Spending calculations: category breakdowns and totals.
 */

import type { Transaction } from '$lib/db';

/**
 * Get user's portion of a transaction amount (accounting for splits).
 */
export function getUserAmount(transaction: Transaction): number {
	return transaction.isShared ? transaction.amount - transaction.partnerShare : transaction.amount;
}

/**
 * Calculate total spending by category for a list of transactions.
 * Returns user's portion for shared transactions.
 */
export function getSpendingByCategory(transactions: Transaction[]): Map<number, number> {
	const spending = new Map<number, number>();
	for (const t of transactions) {
		const amount = getUserAmount(t);
		spending.set(t.categoryId, (spending.get(t.categoryId) || 0) + amount);
	}
	return spending;
}

/**
 * Calculate the total user spending across all transactions.
 */
export function getTotalSpent(transactions: Transaction[]): number {
	let total = 0;
	for (const t of transactions) {
		total += getUserAmount(t);
	}
	return total;
}
