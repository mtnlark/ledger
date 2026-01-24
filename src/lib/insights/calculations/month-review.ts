/**
 * Month Review: retrospective superlatives for a completed (past) month.
 *
 * Computes historical rank, vs-average stats, biggest purchase,
 * most visited merchant, category standout, and needs %.
 */

import type { Transaction, Category } from '$lib/db';
import { getMonthKey } from '$lib/db';
import { getUserAmount } from './spending';
import { computeStdDev } from './stats';

export interface MonthReviewResult {
	historicalRank: { rank: number; total: number; direction: 'highest' | 'lowest' } | null;
	vsAverage: { percentDiff: number; isAbove: boolean; withinOneSigma: boolean } | null;
	biggestPurchase: { merchant: string; amount: number } | null;
	mostVisitedMerchant: { merchant: string; count: number } | null;
	categoryStandout: { name: string; icon: string; diff: number; isIncrease: boolean } | null;
	needsPercent: number | null;
}

/**
 * Compute the historical spending rank of a month among all months.
 * Returns whichever of "Nth highest" or "Nth lowest" has the smaller rank number.
 */
export function computeHistoricalRank(
	selectedMonthTotal: number,
	allMonthlyTotals: Map<string, number>,
	selectedMonth: string
): MonthReviewResult['historicalRank'] {
	if (allMonthlyTotals.size < 2) return null;
	if (!allMonthlyTotals.has(selectedMonth)) return null;

	const totals = [...allMonthlyTotals.values()].sort((a, b) => b - a); // descending
	const total = allMonthlyTotals.size;

	// Rank from highest (1 = highest spending)
	// Use findIndex to count how many values are strictly greater, avoiding
	// indexOf issues when multiple months have identical totals.
	const highestRank = totals.filter((v) => v > selectedMonthTotal).length + 1;
	// Rank from lowest (1 = lowest spending)
	const lowestRank = totals.filter((v) => v < selectedMonthTotal).length + 1;

	if (lowestRank < highestRank) {
		return { rank: lowestRank, total, direction: 'lowest' };
	}
	return { rank: highestRank, total, direction: 'highest' };
}

/**
 * Compare the selected month's total to the historical mean and σ.
 */
export function computeVsAverage(
	selectedMonthTotal: number,
	allMonthlyTotals: Map<string, number>
): MonthReviewResult['vsAverage'] {
	if (allMonthlyTotals.size < 2) return null;

	const values = [...allMonthlyTotals.values()];
	const mean = values.reduce((s, v) => s + v, 0) / values.length;
	if (mean === 0) return null;

	const stdDev = computeStdDev(values);
	const diff = selectedMonthTotal - mean;
	const percentDiff = Math.round(Math.abs(diff) / mean * 100);
	const isAbove = diff > 0;
	const withinOneSigma = stdDev > 0 ? Math.abs(diff) <= stdDev : true;

	return { percentDiff, isAbove, withinOneSigma };
}

/** Category names excluded from "biggest purchase" (predictable recurring expenses). */
const DEFAULT_EXCLUDED_CATEGORIES = new Set(['rent']);

/**
 * Find the largest single purchase (user portion) in the month,
 * excluding predictable recurring categories like Rent.
 */
export function computeBiggestPurchase(
	transactions: Transaction[],
	categories: Category[],
	excludeCategoryNames: Set<string> = DEFAULT_EXCLUDED_CATEGORIES
): MonthReviewResult['biggestPurchase'] {
	if (transactions.length === 0) return null;

	// Build set of excluded category IDs
	const excludedIds = new Set<number>();
	for (const cat of categories) {
		if (cat.id !== undefined && excludeCategoryNames.has(cat.name.toLowerCase())) {
			excludedIds.add(cat.id);
		}
	}

	let biggest: Transaction | null = null;
	let biggestAmount = 0;

	for (const t of transactions) {
		if (excludedIds.has(t.categoryId)) continue;
		const amount = getUserAmount(t);
		if (amount > biggestAmount) {
			biggestAmount = amount;
			biggest = t;
		}
	}

	if (!biggest || biggestAmount === 0) return null;
	return { merchant: biggest.merchant, amount: biggestAmount };
}

/**
 * Find the most frequently visited merchant (≥ minVisits threshold).
 */
export function computeMostVisitedMerchant(
	transactions: Transaction[],
	minVisits = 2
): MonthReviewResult['mostVisitedMerchant'] {
	if (transactions.length === 0) return null;

	const counts = new Map<string, number>();
	for (const t of transactions) {
		const name = t.merchant.trim().toLowerCase();
		counts.set(name, (counts.get(name) || 0) + 1);
	}

	let topMerchant = '';
	let topCount = 0;
	for (const [merchant, count] of counts) {
		if (count > topCount) {
			topCount = count;
			topMerchant = merchant;
		}
	}

	if (topCount < minVisits) return null;

	// Find original casing from first occurrence
	const originalName = transactions.find(
		(t) => t.merchant.trim().toLowerCase() === topMerchant
	)?.merchant ?? topMerchant;

	return { merchant: originalName, count: topCount };
}

/**
 * Find the category with the biggest absolute $ change vs the previous month.
 */
export function computeCategoryStandout(
	currentTransactions: Transaction[],
	previousTransactions: Transaction[],
	categories: Category[]
): MonthReviewResult['categoryStandout'] {
	if (previousTransactions.length === 0) return null;

	// Compute spending by category for both months
	const currentByCategory = new Map<number, number>();
	for (const t of currentTransactions) {
		const amount = getUserAmount(t);
		currentByCategory.set(t.categoryId, (currentByCategory.get(t.categoryId) || 0) + amount);
	}

	const previousByCategory = new Map<number, number>();
	for (const t of previousTransactions) {
		const amount = getUserAmount(t);
		previousByCategory.set(t.categoryId, (previousByCategory.get(t.categoryId) || 0) + amount);
	}

	// Find the category with largest absolute change
	const allCategoryIds = new Set([...currentByCategory.keys(), ...previousByCategory.keys()]);
	let bestDiff = 0;
	let bestCategoryId: number | null = null;

	for (const catId of allCategoryIds) {
		const current = currentByCategory.get(catId) || 0;
		const previous = previousByCategory.get(catId) || 0;
		const diff = Math.abs(current - previous);
		if (diff > bestDiff) {
			bestDiff = diff;
			bestCategoryId = catId;
		}
	}

	if (bestCategoryId === null || bestDiff === 0) return null;

	const category = categories.find((c) => c.id === bestCategoryId);
	if (!category) return null;

	const currentAmount = currentByCategory.get(bestCategoryId) || 0;
	const previousAmount = previousByCategory.get(bestCategoryId) || 0;
	const isIncrease = currentAmount > previousAmount;

	return {
		name: category.name,
		icon: category.icon || '📝',
		diff: bestDiff,
		isIncrease
	};
}

/**
 * Compute the needs percentage for a month's transactions.
 */
export function computeNeedsPercent(transactions: Transaction[]): number | null {
	if (transactions.length === 0) return null;

	let total = 0;
	let needsTotal = 0;

	for (const t of transactions) {
		const amount = getUserAmount(t);
		total += amount;
		if (t.isEssential) {
			needsTotal += amount;
		}
	}

	if (total === 0) return null;
	return Math.round((needsTotal / total) * 100);
}

/**
 * Compute all monthly totals from all transactions, grouped by month key.
 */
export function computeMonthlyTotals(allTransactions: Transaction[]): Map<string, number> {
	const totals = new Map<string, number>();
	for (const t of allTransactions) {
		const key = getMonthKey(new Date(t.date));
		const amount = getUserAmount(t);
		totals.set(key, (totals.get(key) || 0) + amount);
	}
	return totals;
}

/**
 * Orchestrator: compute all month review superlatives.
 */
export function computeMonthReview(
	selectedMonth: string,
	selectedMonthTransactions: Transaction[],
	previousMonthTransactions: Transaction[],
	allTransactions: Transaction[],
	categories: Category[]
): MonthReviewResult {
	const monthlyTotals = computeMonthlyTotals(allTransactions);
	const selectedMonthTotal = monthlyTotals.get(selectedMonth) || 0;

	return {
		historicalRank: computeHistoricalRank(selectedMonthTotal, monthlyTotals, selectedMonth),
		vsAverage: computeVsAverage(selectedMonthTotal, monthlyTotals),
		biggestPurchase: computeBiggestPurchase(selectedMonthTransactions, categories),
		mostVisitedMerchant: computeMostVisitedMerchant(selectedMonthTransactions),
		categoryStandout: computeCategoryStandout(selectedMonthTransactions, previousMonthTransactions, categories),
		needsPercent: computeNeedsPercent(selectedMonthTransactions)
	};
}
