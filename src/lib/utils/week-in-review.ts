/**
 * Week in Review: pure calculation logic for the dashboard card.
 *
 * Shows a summary of last week's spending (Mon–Sun) with week-over-week comparison.
 */

import { startOfWeek, endOfWeek, startOfDay, format } from 'date-fns';
import type { Transaction, Category } from '$lib/db';
import { getSpendingByCategory, getTotalSpent } from '$lib/insights/calculations/spending';
import { countMerchantVisits } from '$lib/insights/calculations/top-merchant';
import { roundCurrency } from '$lib/utils/currency';
import { groupTransactionsIntoPurchases } from '$lib/utils/transaction-grouping';

const DISMISS_KEY = 'ledger-week-review-dismissed';

export interface WeekInReview {
	/** Total user spending last week */
	totalSpent: number;
	/** Number of transactions last week */
	txCount: number;
	/** Top category by total spend */
	topCategory: { id: number; name: string; amount: number } | null;
	/** Top merchant by frequency (min 1 visit) */
	topMerchant: { name: string; count: number } | null;
	/** Total user spending the week before last (for comparison) */
	priorWeekTotal: number;
	/** Dollar change (lastWeek - priorWeek) */
	change: number;
}

/**
 * Get the Monday–Sunday date range for N weeks ago.
 * weeksAgo=1 → last week, weeksAgo=2 → the week before that.
 */
export function getWeekRange(weeksAgo: number, referenceDate: Date = new Date()): { start: Date; end: Date } {
	const ref = startOfDay(referenceDate);
	// Shift back by weeksAgo weeks
	const shifted = new Date(ref);
	shifted.setDate(shifted.getDate() - weeksAgo * 7);

	const start = startOfWeek(shifted, { weekStartsOn: 1 }); // Monday 00:00
	const end = endOfWeek(shifted, { weekStartsOn: 1 }); // Sunday 23:59:59.999

	return { start, end };
}

/**
 * Filter transactions whose date falls within [start, end] (inclusive, by calendar date).
 * Excludes soft-deleted and split-parent transactions.
 */
export function filterTransactionsInRange(
	transactions: Transaction[],
	start: Date,
	end: Date
): Transaction[] {
	const startTime = startOfDay(start).getTime();
	const endTime = startOfDay(end).getTime();

	return transactions.filter((t) => {
		if (t.isDeleted || t.isSplitParent) return false;
		const txTime = startOfDay(new Date(t.date)).getTime();
		return txTime >= startTime && txTime <= endTime;
	});
}

/**
 * Calculate the Week in Review data for the dashboard.
 * Returns null if there are no transactions last week.
 */
export function calculateWeekInReview(
	allTransactions: Transaction[],
	categories: Category[]
): WeekInReview | null {
	const lastWeekRange = getWeekRange(1);
	const priorWeekRange = getWeekRange(2);

	const lastWeekTxns = filterTransactionsInRange(allTransactions, lastWeekRange.start, lastWeekRange.end);
	const priorWeekTxns = filterTransactionsInRange(allTransactions, priorWeekRange.start, priorWeekRange.end);

	if (lastWeekTxns.length === 0) return null;

	const totalSpent = roundCurrency(getTotalSpent(lastWeekTxns));
	const priorWeekTotal = roundCurrency(getTotalSpent(priorWeekTxns));
	const change = roundCurrency(totalSpent - priorWeekTotal);

	// Top category by total spend
	const categorySpending = getSpendingByCategory(lastWeekTxns);
	let topCategory: WeekInReview['topCategory'] = null;
	let maxCatSpend = 0;
	for (const [catId, amount] of categorySpending) {
		if (amount > maxCatSpend) {
			maxCatSpend = amount;
			const cat = categories.find((c) => c.id === catId);
			if (cat) {
				topCategory = { id: catId, name: cat.name, amount: roundCurrency(amount) };
			}
		}
	}

	// Top merchant by frequency (min 1 visit)
	const merchantFreq = countMerchantVisits(lastWeekTxns);
	let topMerchant: WeekInReview['topMerchant'] = null;
	let maxCount = 0;
	for (const [name, count] of merchantFreq) {
		if (count > maxCount) {
			maxCount = count;
			topMerchant = { name, count };
		}
	}

	return {
		totalSpent,
		txCount: groupTransactionsIntoPurchases(lastWeekTxns).length,
		topCategory,
		topMerchant,
		priorWeekTotal,
		change
	};
}

/**
 * Check if the Week in Review has been dismissed for the current week.
 * Compares stored Monday date against this week's Monday.
 */
export function isDismissedThisWeek(): boolean {
	try {
		const stored = localStorage.getItem(DISMISS_KEY);
		if (!stored) return false;
		const thisMonday = startOfWeek(new Date(), { weekStartsOn: 1 });
		const mondayStr = format(thisMonday, 'yyyy-MM-dd');
		return stored === mondayStr;
	} catch {
		return false;
	}
}

/**
 * Dismiss the Week in Review for the current week.
 * Stores this week's Monday date string in localStorage.
 */
export function dismissWeekReview(): void {
	try {
		const thisMonday = startOfWeek(new Date(), { weekStartsOn: 1 });
		const mondayStr = format(thisMonday, 'yyyy-MM-dd');
		localStorage.setItem(DISMISS_KEY, mondayStr);
	} catch {
		// Silently fail if localStorage unavailable
	}
}
