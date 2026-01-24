/**
 * Type definitions for the insights calculation layer.
 */

import type { Transaction, Category, MonthlyBudget } from '$lib/db';

// Re-export types from existing calculations for convenience
export type {
	AnomalyResult,
	PaceProjectionResult,
	NeedsVsWantsResult,
	VelocityComparisonResult,
	TopMerchantResult
} from '$lib/utils/insights-calculations';

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
