/**
 * Budget status utility for consistent color determination across the app.
 * Handles floating-point precision issues and provides a 4-state color system.
 */

import { config } from '$lib/config';

/**
 * Budget status categories:
 * - 'under': Less than approaching threshold (green)
 * - 'approaching': Between approaching threshold and at-budget zone (yellow)
 * - 'at': Within tolerance of 100% (gray - neutral, neither good nor bad)
 * - 'over': Exceeds the at-budget tolerance (red)
 */
export type BudgetStatus = 'under' | 'approaching' | 'at' | 'over';

export interface BudgetStatusResult {
	/** The budget status category */
	status: BudgetStatus;
	/** Tailwind class for the progress bar fill color */
	colorClass: string;
	/** Tailwind class for text color */
	textColorClass: string;
	/** Human-readable label for the status */
	label: string;
	/** Raw percentage spent (may exceed 100) */
	percentSpent: number;
	/** Percentage for display (capped at 100 for progress bars) */
	displayPercent: number;
}

interface BudgetStatusOptions {
	/** Percent threshold for "approaching" status. Default: 80 */
	approachingThreshold?: number;
	/** Percent below 100% to treat as "at budget". Default: 0.5 */
	atBudgetUnderTolerance?: number;
	/** Minimum dollar amount over budget still treated as "at". Default: 2 */
	atBudgetOverToleranceMin?: number;
	/** Percent of budget over still treated as "at". Default: 1 */
	atBudgetOverTolerancePercent?: number;
}

/** Color classes for each status */
const STATUS_COLORS: Record<BudgetStatus, { fill: string; text: string }> = {
	under: {
		fill: 'bg-gradient-to-r from-success-200 to-success-500',
		text: 'text-success-600'
	},
	approaching: {
		fill: 'bg-gradient-to-r from-warning-300 to-warning-500',
		text: 'text-warning-600'
	},
	at: {
		// Warm slate blue gradient for "at budget" - neutral but visible
		fill: 'bg-gradient-to-r from-neutral-300 to-neutral-500',
		text: 'text-neutral-600'
	},
	over: {
		fill: 'bg-gradient-to-r from-danger-300 to-danger-500',
		text: 'text-danger-500'
	}
};

/** Human-readable labels for each status */
const STATUS_LABELS: Record<BudgetStatus, string> = {
	under: '',
	approaching: 'Approaching limit',
	at: 'At budget',
	over: 'Over budget'
};

/**
 * Round to whole number for threshold comparisons.
 * This matches what users see in the UI (percentage displayed as whole number).
 * Ensures 98.5%+ shows as "at budget" when the display would show "99%" or "100%".
 */
function roundPercentForThreshold(value: number): number {
	return Math.round(value);
}

/**
 * Round to 1 decimal place for the returned percentSpent value.
 * Provides slightly more precision for display purposes.
 */
function roundPercentForDisplay(value: number): number {
	return Math.round(value * 10) / 10;
}

/**
 * Determine the budget status based on spent and budget amounts.
 *
 * The "at budget" zone uses asymmetric tolerance:
 * - Under side: 0.5% (99.5%+ treated as "at budget")
 * - Over side: $2 OR 1% of budget, whichever is larger
 *
 * This gives users wiggle room - small overspend isn't alarming.
 *
 * @param spent - Amount spent
 * @param budget - Budget amount
 * @param options - Optional configuration overrides
 * @returns BudgetStatusResult with status, colors, and percentages
 */
export function getBudgetStatus(
	spent: number,
	budget: number,
	options: BudgetStatusOptions = {}
): BudgetStatusResult {
	const {
		approachingThreshold = config.budget.approachingThresholdPercent,
		atBudgetUnderTolerance = config.budget.atBudgetUnderTolerancePercent,
		atBudgetOverToleranceMin = config.budget.atBudgetOverToleranceMin,
		atBudgetOverTolerancePercent = config.budget.atBudgetOverTolerancePercent
	} = options;

	// Handle edge case: zero budget
	if (budget <= 0) {
		const status: BudgetStatus = spent > 0 ? 'over' : 'under';
		return {
			status,
			colorClass: STATUS_COLORS[status].fill,
			textColorClass: STATUS_COLORS[status].text,
			label: STATUS_LABELS[status],
			percentSpent: spent > 0 ? Infinity : 0,
			displayPercent: spent > 0 ? 100 : 0
		};
	}

	// Calculate raw percentage
	const rawPercent = (spent / budget) * 100;
	// Use whole-number rounding for threshold comparisons (matches what users see)
	const percentForThreshold = roundPercentForThreshold(rawPercent);
	// Use 1-decimal rounding for the returned value (slightly more precision)
	const percentSpent = roundPercentForDisplay(rawPercent);
	const displayPercent = Math.min(100, percentSpent);

	// Calculate the "at budget" thresholds
	const atBudgetLowerBound = 100 - atBudgetUnderTolerance; // e.g., 99%

	// Over tolerance: max of fixed dollar amount OR percentage of budget
	const overToleranceDollars = Math.max(
		atBudgetOverToleranceMin,
		(atBudgetOverTolerancePercent / 100) * budget
	);
	const atBudgetUpperBound = 100 + (overToleranceDollars / budget) * 100;

	// Determine status using whole-number rounded percentage for threshold comparisons
	// This ensures consistency with what users see (displayed % is rounded to whole number)
	let status: BudgetStatus;

	if (percentForThreshold < approachingThreshold) {
		status = 'under';
	} else if (percentForThreshold < atBudgetLowerBound) {
		status = 'approaching';
	} else if (percentForThreshold <= Math.round(atBudgetUpperBound)) {
		status = 'at';
	} else {
		status = 'over';
	}

	return {
		status,
		colorClass: STATUS_COLORS[status].fill,
		textColorClass: STATUS_COLORS[status].text,
		label: STATUS_LABELS[status],
		percentSpent,
		displayPercent
	};
}

/**
 * Convenience function to get just the color class for a progress bar.
 * Useful when you only need the color and don't need the full result.
 */
export function getBudgetColorClass(spent: number, budget: number): string {
	return getBudgetStatus(spent, budget).colorClass;
}

/**
 * Convenience function to get just the text color class.
 */
export function getBudgetTextColorClass(spent: number, budget: number): string {
	return getBudgetStatus(spent, budget).textColorClass;
}
