/**
 * InsightsEngine: memoized orchestrator for all insight calculations.
 *
 * Uses TransactionCache.version for automatic cache invalidation.
 * Month-scoped calculations use multi-key caching (up to 12 months).
 */

import type { Transaction, Category, MonthlyBudget } from '$lib/db';
import type {
	AnomalyResult,
	PaceProjectionResult,
	NeedsVsWantsResult,
	NeedsWantsFullResult,
	VelocityComparisonResult,
	TopMerchantResult,
	CategoryShiftResult,
	CategoryDeepDiveShift,
	YTDStatsResult,
	MonthReviewResult
} from './types';
import { memoByVersion, memoByVersionMultiKey } from './memo';
import { getTransactionCache } from '$lib/stores/transactionCache';
import type { CategoryStats } from './calculations';
import {
	getSpendingByCategory as rawGetSpendingByCategory,
	getTotalSpent as rawGetTotalSpent,
	calculateNeedsVsWants as rawCalculateNeedsVsWants,
	calculateNeedsVsWantsFull as rawCalculateNeedsVsWantsFull,
	computeTopCategoryShift as rawComputeTopCategoryShift,
	computeCategoryDeepDiveShift as rawComputeCategoryDeepDiveShift,
	computeCategoryAverages as rawComputeCategoryAverages,
	computeCategoryStats as rawComputeCategoryStats,
	detectAnomalies as rawDetectAnomalies,
	calculatePaceProjection as rawCalculatePaceProjection,
	calculateVelocityComparison as rawCalculateVelocityComparison,
	getTopMerchant as rawGetTopMerchant,
	computeYTDStats as rawComputeYTDStats,
	computeMonthReview as rawComputeMonthReview
} from './calculations';

export class InsightsEngine {
	// Multi-key memoized (month-scoped): cache up to 12 months per version
	private _getSpendingByCategory = memoByVersionMultiKey(rawGetSpendingByCategory);
	private _getTotalSpent = memoByVersionMultiKey(rawGetTotalSpent);
	private _calculateNeedsVsWants = memoByVersionMultiKey(rawCalculateNeedsVsWants);
	private _calculateNeedsVsWantsFull = memoByVersionMultiKey(rawCalculateNeedsVsWantsFull);
	private _getTopMerchant = memoByVersionMultiKey(
		(transactions: Transaction[], minVisits: number) => rawGetTopMerchant(transactions, minVisits)
	);
	private _computeTopCategoryShift = memoByVersionMultiKey(
		(
			current: Transaction[],
			previous: Transaction[],
			categories: Category[],
			currentDay: number,
			anomalies: AnomalyResult[],
			config: { earlyMonthCutoff: number; earlyMonthRatio: number; zScoreThreshold: number; minAmount: number; fallbackMinDifference: number },
			categoryStats?: Map<number, CategoryStats>
		) => rawComputeTopCategoryShift(current, previous, categories, currentDay, anomalies, config, categoryStats)
	);
	private _computeCategoryDeepDiveShift = memoByVersionMultiKey(
		(current: Transaction[], previous: Transaction[], categories: Category[]) =>
			rawComputeCategoryDeepDiveShift(current, previous, categories)
	);
	private _calculateVelocityComparison = memoByVersionMultiKey(
		(
			currentTotal: number,
			prevTotal: number,
			currentDays: number,
			prevDays: number,
			percentThreshold: number,
			historicalMonthlyTotals?: number[]
		) => rawCalculateVelocityComparison(currentTotal, prevTotal, currentDays, prevDays, percentThreshold, historicalMonthlyTotals)
	);
	private _calculatePaceProjection = memoByVersionMultiKey(
		(totalSpent: number, budget: MonthlyBudget | null, currentDay: number, daysInMonth: number) =>
			rawCalculatePaceProjection(totalSpent, budget, currentDay, daysInMonth)
	);

	// Single-key memoized (all-time scope)
	private _computeCategoryAverages = memoByVersion(
		(getTransactionsForMonth: (month: string) => Transaction[], months: string[]) =>
			rawComputeCategoryAverages(getTransactionsForMonth, months)
	);
	private _computeCategoryStats = memoByVersion(
		(getTransactionsForMonth: (month: string) => Transaction[], months: string[]) =>
			rawComputeCategoryStats(getTransactionsForMonth, months)
	);
	private _detectAnomalies = memoByVersion(
		(
			currentSpending: Map<number, number>,
			categoryStats: Map<number, CategoryStats>,
			categories: Category[],
			config: { minAverage: number; zScoreThreshold: number; maxToShow: number; fallbackRatioThreshold?: number }
		) => rawDetectAnomalies(currentSpending, categoryStats, categories, config)
	);
	private _computeMonthReview = memoByVersionMultiKey(
		(
			selectedMonth: string,
			selectedMonthTransactions: Transaction[],
			previousMonthTransactions: Transaction[],
			allTransactions: Transaction[],
			categories: Category[]
		) => rawComputeMonthReview(selectedMonth, selectedMonthTransactions, previousMonthTransactions, allTransactions, categories)
	);
	private _computeYTDStats = memoByVersion(
		(allTransactions: Transaction[], year?: number) => rawComputeYTDStats(allTransactions, year)
	);

	private get version(): number {
		return getTransactionCache().version;
	}

	// --- Public API ---

	/** Get spending totals by category for a set of transactions. */
	getSpendingByCategory(transactions: Transaction[], key: string): Map<number, number> {
		return this._getSpendingByCategory(this.version, key, transactions);
	}

	/** Get total user spending across transactions. */
	getTotalSpent(transactions: Transaction[], key: string): number {
		return this._getTotalSpent(this.version, key, transactions);
	}

	/** Calculate needs vs wants breakdown (compact result). */
	getNeedsVsWants(transactions: Transaction[], key: string): NeedsVsWantsResult | null {
		return this._calculateNeedsVsWants(this.version, key, transactions);
	}

	/** Calculate full needs vs wants breakdown with both percentages. */
	getNeedsVsWantsFull(transactions: Transaction[], key: string): NeedsWantsFullResult {
		return this._calculateNeedsVsWantsFull(this.version, key, transactions);
	}

	/** Find the most frequently visited merchant. */
	getTopMerchant(transactions: Transaction[], key: string, minVisits = 2): TopMerchantResult | null {
		return this._getTopMerchant(this.version, key, transactions, minVisits);
	}

	/** Compute the top category shift from previous month. */
	getTopCategoryShift(
		currentTransactions: Transaction[],
		previousTransactions: Transaction[],
		categories: Category[],
		currentDay: number,
		anomalies: AnomalyResult[],
		config: { earlyMonthCutoff: number; earlyMonthRatio: number; zScoreThreshold: number; minAmount: number; fallbackMinDifference: number },
		key: string,
		categoryStats?: Map<number, CategoryStats>
	): CategoryShiftResult | null {
		return this._computeTopCategoryShift(
			this.version,
			key,
			currentTransactions,
			previousTransactions,
			categories,
			currentDay,
			anomalies,
			config,
			categoryStats
		);
	}

	/** Compute the category deep dive shift (biggest change by absolute dollars). */
	getCategoryDeepDiveShift(
		currentTransactions: Transaction[],
		previousTransactions: Transaction[],
		categories: Category[],
		key: string
	): CategoryDeepDiveShift | null {
		return this._computeCategoryDeepDiveShift(
			this.version,
			key,
			currentTransactions,
			previousTransactions,
			categories
		);
	}

	/** Compare spending velocity between periods. */
	getVelocityComparison(
		currentTotal: number,
		prevTotal: number,
		currentDays: number,
		prevDays: number,
		percentThreshold: number,
		key: string,
		historicalMonthlyTotals?: number[]
	): VelocityComparisonResult | null {
		return this._calculateVelocityComparison(
			this.version,
			key,
			currentTotal,
			prevTotal,
			currentDays,
			prevDays,
			percentThreshold,
			historicalMonthlyTotals
		);
	}

	/** Calculate pace projection for current month. */
	getPaceProjection(
		totalSpent: number,
		budget: MonthlyBudget | null,
		currentDay: number,
		daysInMonth: number,
		key: string
	): PaceProjectionResult | null {
		return this._calculatePaceProjection(this.version, key, totalSpent, budget, currentDay, daysInMonth);
	}

	/** Compute category spending averages across months. */
	getCategoryAverages(
		getTransactionsForMonth: (month: string) => Transaction[],
		months: string[],
		key: string
	): Map<number, number> {
		return this._computeCategoryAverages(this.version, key, getTransactionsForMonth, months);
	}

	/** Compute category stats (mean + stdDev) across months. */
	getCategoryStats(
		getTransactionsForMonth: (month: string) => Transaction[],
		months: string[],
		key: string
	): Map<number, CategoryStats> {
		return this._computeCategoryStats(this.version, key, getTransactionsForMonth, months);
	}

	/** Detect spending anomalies above historical averages. */
	getAnomalies(
		currentSpending: Map<number, number>,
		categoryStats: Map<number, CategoryStats>,
		categories: Category[],
		config: { minAverage: number; zScoreThreshold: number; maxToShow: number; fallbackRatioThreshold?: number },
		key: string
	): AnomalyResult[] {
		return this._detectAnomalies(this.version, key, currentSpending, categoryStats, categories, config);
	}

	/** Compute month review retrospective superlatives for a past month. */
	getMonthReview(
		selectedMonth: string,
		selectedMonthTransactions: Transaction[],
		previousMonthTransactions: Transaction[],
		allTransactions: Transaction[],
		categories: Category[]
	): MonthReviewResult {
		return this._computeMonthReview(
			this.version,
			selectedMonth,
			selectedMonth,
			selectedMonthTransactions,
			previousMonthTransactions,
			allTransactions,
			categories
		);
	}

	/** Compute year-to-date statistics. */
	getYTDStats(allTransactions: Transaction[], year?: number): YTDStatsResult {
		return this._computeYTDStats(this.version, 'ytd', allTransactions, year);
	}
}

// Singleton
let instance: InsightsEngine | null = null;

/**
 * Get the global InsightsEngine instance.
 */
export function getInsightsEngine(): InsightsEngine {
	if (!instance) {
		instance = new InsightsEngine();
	}
	return instance;
}

/**
 * Reset the InsightsEngine singleton. For testing only.
 */
export function resetInsightsEngine(): void {
	instance = null;
}
