/**
 * Month Review: retrospective superlatives for a completed (past) month.
 *
 * Computes historical rank, vs-average stats, biggest purchase,
 * most visited merchant, category standout, and needs %.
 */

import type { Transaction, Category } from '$lib/db';
import { getMonthKey } from '$lib/db';
import { getUserAmount } from './spending';
import { countMerchantVisits } from './top-merchant';
import {
	generateDecayWeights,
	computeWeightedMean,
	computeWeightedStdDev
} from './stats';
import { calculatePercent } from '$lib/utils/currency';
import { normalizeMerchant } from '$lib/utils/string-helpers';
import { groupTransactionsIntoPurchases } from '$lib/utils/transaction-grouping';

interface SavingsReviewResult {
	/** Total saved this month */
	totalSaved: number;
	/** Savings rate as decimal (0.25 = 25%) - null if no income */
	savingsRate: number | null;
	/** Comparison to historical average - only populated when ABOVE average */
	vsAverage: { percentDiff: number; averageRate: number } | null;
	/** True if this is the highest savings month on record */
	isHighestMonth: boolean;
}

export interface MonthReviewResult {
	historicalRank: { rank: number; total: number; direction: 'highest' | 'lowest' } | null;
	vsAverage: { percentDiff: number; isAbove: boolean; withinOneSigma: boolean; weightedMean: number; sampleSize: number } | null;
	biggestPurchase: { merchant: string; amount: number } | null;
	mostVisitedMerchant: { merchant: string; count: number; totalSpent: number } | null;
	categoryStandout: { name: string; icon: string; diff: number; isIncrease: boolean } | null;
	needsPercent: number | null;
	savings: SavingsReviewResult | null;
}

/** Default rolling window for historical comparisons (12 months) */
const ROLLING_WINDOW_MONTHS = 12;

/**
 * Calculate the distance in months between two month keys.
 */
function monthDistance(a: string, b: string): number {
	const [yearA, monA] = a.split('-').map(Number);
	const [yearB, monB] = b.split('-').map(Number);
	return Math.abs((yearA * 12 + monA) - (yearB * 12 + monB));
}

/**
 * Filter monthly totals to only include months within a rolling window.
 * Uses a symmetric window centered on the selected month, so insights
 * for past months improve as new data becomes available.
 * @param allMonthlyTotals Map of month keys to totals
 * @param selectedMonth The reference month (YYYY-MM)
 * @param windowMonths Number of months to include (default 12)
 * @returns Filtered map containing only months within the window
 */
function filterToRollingWindow(
	allMonthlyTotals: Map<string, number>,
	selectedMonth: string,
	windowMonths: number = ROLLING_WINDOW_MONTHS
): Map<string, number> {
	const months = [...allMonthlyTotals.keys()];
	if (!months.includes(selectedMonth)) return new Map();

	// Sort by proximity to selected month (closest first), take nearest N
	const byProximity = months
		.map((month) => ({ month, distance: monthDistance(month, selectedMonth) }))
		.sort((a, b) => a.distance - b.distance)
		.slice(0, windowMonths);

	const filtered = new Map<string, number>();
	for (const { month } of byProximity) {
		filtered.set(month, allMonthlyTotals.get(month)!);
	}
	return filtered;
}

/**
 * Compute the historical spending rank of a month among recent months.
 * Uses a rolling 12-month window for comparison.
 * Returns whichever of "Nth highest" or "Nth lowest" has the smaller rank number.
 */
export function computeHistoricalRank(
	selectedMonthTotal: number,
	allMonthlyTotals: Map<string, number>,
	selectedMonth: string
): MonthReviewResult['historicalRank'] {
	// Filter to rolling window
	const windowTotals = filterToRollingWindow(allMonthlyTotals, selectedMonth);

	if (windowTotals.size < 2) return null;
	if (!windowTotals.has(selectedMonth)) return null;

	const totals = [...windowTotals.values()].sort((a, b) => b - a); // descending
	const total = windowTotals.size;

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
 * Uses a rolling 12-month window with exponential decay weighting so
 * recent months have more influence on the baseline.
 *
 * @param selectedMonthTotal The spending total for the month being reviewed
 * @param allMonthlyTotals Map of month keys to spending totals
 * @param selectedMonth The month being reviewed (for rolling window calculation)
 * @param decay Decay factor per month (default 0.9 = 10% decay, gentler than other uses)
 */
export function computeVsAverage(
	selectedMonthTotal: number,
	allMonthlyTotals: Map<string, number>,
	selectedMonth?: string,
	decay = 0.9
): MonthReviewResult['vsAverage'] {
	// Apply rolling window if selectedMonth is provided
	const totalsToUse = selectedMonth
		? filterToRollingWindow(allMonthlyTotals, selectedMonth)
		: allMonthlyTotals;

	if (totalsToUse.size < 2) return null;

	// Sort entries so closest months to selected get highest weight.
	// generateDecayWeights gives weight 1.0 to the last element, so sort
	// farthest-first / closest-last (proximity-based instead of chronological).
	// This ensures months near the selected month influence the baseline most,
	// regardless of whether they come before or after it.
	const sortedEntries = selectedMonth
		? [...totalsToUse.entries()].sort((a, b) =>
				monthDistance(b[0], selectedMonth) - monthDistance(a[0], selectedMonth)
			)
		: [...totalsToUse.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	const values = sortedEntries.map(([, v]) => v);

	// Generate decay weights (most recent month = 1.0)
	const weights = generateDecayWeights(values.length, decay);

	const mean = computeWeightedMean(values, weights);
	if (mean === 0) return null;

	const stdDev = computeWeightedStdDev(values, weights);
	const diff = selectedMonthTotal - mean;
	const percentDiff = calculatePercent(Math.abs(diff), mean, true);
	const isAbove = diff > 0;
	const withinOneSigma = stdDev > 0 ? Math.abs(diff) <= stdDev : true;

	return { percentDiff, isAbove, withinOneSigma, weightedMean: mean, sampleSize: totalsToUse.size };
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

	let biggestMerchant = '';
	let biggestAmount = 0;

	for (const purchase of groupTransactionsIntoPurchases(transactions)) {
		if (purchase.allocations.every((allocation) => excludedIds.has(allocation.categoryId))) {
			continue;
		}
		const amount = purchase.userAmount;
		if (amount > biggestAmount) {
			biggestAmount = amount;
			biggestMerchant = purchase.merchant;
		}
	}

	if (!biggestMerchant || biggestAmount === 0) return null;
	return { merchant: biggestMerchant, amount: biggestAmount };
}

/**
 * Find the most frequently visited merchant (≥ minVisits threshold).
 * Split children sharing a parentTransactionId count as one visit.
 */
export function computeMostVisitedMerchant(
	transactions: Transaction[],
	minVisits = 2
): MonthReviewResult['mostVisitedMerchant'] {
	if (transactions.length === 0) return null;

	const counts = countMerchantVisits(transactions, normalizeMerchant);

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
		(t) => normalizeMerchant(t.merchant) === topMerchant
	)?.merchant ?? topMerchant;

	// Sum user amounts for the top merchant's transactions
	let totalSpent = 0;
	for (const t of transactions) {
		if (normalizeMerchant(t.merchant) === topMerchant) {
			totalSpent += getUserAmount(t);
		}
	}

	return { merchant: originalName, count: topCount, totalSpent };
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
	return calculatePercent(needsTotal, total, true);
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

/** Sources that count toward savings rate (reduce available to spend) */
const SOURCES_AFFECTING_AVAILABLE = new Set(['bank_transfer', 'other']);

/**
 * Compute savings review for a completed month.
 * IMPORTANT: Only surfaces positive insights (above average, highest month).
 * Never flags low savings rates to avoid false alarms from mid-month paycheck timing.
 *
 * Note: totalSaved includes ALL contributions (retirement, investment, etc.)
 * for consistency with the Savings tab. savingsRate only uses contributions
 * that affect available to spend (bank_transfer, other).
 *
 * @param selectedMonth The month being reviewed (YYYY-MM)
 * @param contributions All contributions for the selected month
 * @param allContributions All contributions across all months (for comparison)
 * @param income The income for the selected month (null if not set)
 * @param allBudgets All monthly budgets (for historical rate comparison)
 */
export function computeSavingsReview(
	selectedMonth: string,
	contributions: { date: Date; amount: number; source: string }[],
	allContributions: { date: Date; amount: number; source: string }[],
	income: number | null,
	allBudgets: { month: string; income: number }[]
): SavingsReviewResult | null {
	// Total saved includes ALL contributions (for consistency with Savings tab)
	const totalSaved = contributions.reduce((sum, c) => sum + c.amount, 0);

	// If no savings this month, nothing to report
	if (totalSaved === 0) return null;

	// For savings rate, only count contributions that affect available to spend
	const affectingAvailable = contributions.filter((c) =>
		SOURCES_AFFECTING_AVAILABLE.has(c.source)
	);
	const totalAffectingAvailable = affectingAvailable.reduce((sum, c) => sum + c.amount, 0);

	// Calculate savings rate (if income is available)
	const savingsRate = income && income > 0 ? totalAffectingAvailable / income : null;

	// Group ALL contributions by month for "highest month" comparison
	const allSavedByMonth = new Map<string, number>();
	for (const c of allContributions) {
		const month = getMonthKey(new Date(c.date));
		allSavedByMonth.set(month, (allSavedByMonth.get(month) || 0) + c.amount);
	}

	// Check if this is the highest savings month (using ALL contributions)
	const allTotals = [...allSavedByMonth.values()];
	const isHighestMonth = allTotals.length >= 2 && totalSaved >= Math.max(...allTotals);

	// For savings rate comparison, group only affecting-available contributions
	const rateByMonth = new Map<string, number>();
	for (const c of allContributions) {
		if (!SOURCES_AFFECTING_AVAILABLE.has(c.source)) continue;
		const month = getMonthKey(new Date(c.date));
		rateByMonth.set(month, (rateByMonth.get(month) || 0) + c.amount);
	}

	// Calculate historical savings rates for comparison (only if we have current rate)
	let vsAverage: SavingsReviewResult['vsAverage'] = null;
	if (savingsRate !== null && allBudgets.length >= 2) {
		const historicalRates: number[] = [];

		for (const budget of allBudgets) {
			if (budget.month === selectedMonth) continue; // Exclude current month
			if (budget.income <= 0) continue;

			const monthSaved = rateByMonth.get(budget.month) || 0;
			if (monthSaved > 0) {
				historicalRates.push(monthSaved / budget.income);
			}
		}

		if (historicalRates.length >= 1) {
			const averageRate = historicalRates.reduce((a, b) => a + b, 0) / historicalRates.length;

			// Only report if ABOVE average (never flag low rates)
			if (savingsRate > averageRate) {
				const percentDiff = calculatePercent(savingsRate - averageRate, averageRate, true);
				// Only show if meaningfully above (at least 10% higher)
				if (percentDiff >= 10) {
					vsAverage = { percentDiff, averageRate };
				}
			}
		}
	}

	return {
		totalSaved,
		savingsRate,
		vsAverage,
		isHighestMonth
	};
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
		vsAverage: computeVsAverage(selectedMonthTotal, monthlyTotals, selectedMonth),
		biggestPurchase: computeBiggestPurchase(selectedMonthTransactions, categories),
		mostVisitedMerchant: computeMostVisitedMerchant(selectedMonthTransactions),
		categoryStandout: computeCategoryStandout(selectedMonthTransactions, previousMonthTransactions, categories),
		needsPercent: computeNeedsPercent(selectedMonthTransactions),
		// Savings computed separately in SmartTakeaways with contributions data
		savings: null
	};
}
