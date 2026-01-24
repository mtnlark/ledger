/**
 * Type definitions for the insights calculation layer.
 */

import type { Transaction, Category, MonthlyBudget } from '$lib/db';

export interface AnomalyResult {
	catId: number;
	name: string;
	current: number;
	avg: number;
	ratio: number;
	zScore?: number;
}

export interface PaceProjectionResult {
	projected: number;
	available: number;
	percentOfBudget: number;
	isOverBudget: boolean;
}

export interface NeedsVsWantsResult {
	needsTotal: number;
	wantsTotal: number;
	needsPercent: number;
}

export interface VelocityComparisonResult {
	currentDailyAvg: number;
	prevDailyAvg: number;
	percentChange: number;
	isUp: boolean;
}

export interface TopMerchantResult {
	merchant: string;
	count: number;
}

/**
 * Extended needs/wants result that includes percentages for both sides.
 * Used by NeedsWantsInsights and YTDSummary components.
 */
export interface NeedsWantsFullResult {
	needs: number;
	wants: number;
	total: number;
	needsPercent: number;
	wantsPercent: number;
}

/**
 * Category shift data: biggest spending change from one month to the next.
 */
export interface CategoryShiftResult {
	name: string;
	current: number;
	previous: number;
	diff: number;
	isIncrease: boolean;
}

/**
 * Category deep dive shift: includes icon and percent change.
 */
export interface CategoryDeepDiveShift {
	name: string;
	icon: string;
	changePercent: number;
	current: number;
	previous: number;
}

/**
 * Year-to-date statistics.
 */
export interface YTDStatsResult {
	totalSpent: number;
	spendDays: number;
	noSpendDays: number;
	daysInYearSoFar: number;
	dailyAvg: number;
	biggestMonth: { label: string; amount: number } | null;
	topMerchant: { merchant: string; count: number } | null;
	dailySpending: Map<string, number>;
}

/**
 * Month review retrospective superlatives for a past month.
 */
export type { MonthReviewResult } from './calculations/month-review';

// Input types for calculations
export type { Transaction, Category, MonthlyBudget };
