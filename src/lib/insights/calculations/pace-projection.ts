/**
 * Pace projection: project end-of-month spending based on current rate.
 */

import type { MonthlyBudget } from '$lib/db';
import type { PaceProjectionResult } from '../types';

/**
 * Calculate projected spending for the month based on current pace.
 *
 * @param totalSpent Total spent so far this month
 * @param budget Monthly budget (income)
 * @param savedFromContributions Amount saved from contributions that affect available
 * @param currentDay Current day of month (1-indexed)
 * @param daysInMonth Total days in the month
 * @param minMonthFraction Suppress the projection until this fraction of the month has
 *   elapsed (default 0 = never suppress). Avoids wild early-month extrapolation when a
 *   single large charge lands in the first few days.
 */
export function calculatePaceProjection(
	totalSpent: number,
	budget: MonthlyBudget | null,
	savedFromContributions: number,
	currentDay: number,
	daysInMonth: number,
	minMonthFraction: number = 0
): PaceProjectionResult | null {
	if (!budget) return null;
	if (currentDay === 0) return null;

	// Too early in the month for a stable projection — one outlier would dominate.
	const minDay = Math.ceil(daysInMonth * minMonthFraction);
	if (currentDay < minDay) return null;

	const dailyAvg = totalSpent / currentDay;
	const projected = totalSpent + dailyAvg * (daysInMonth - currentDay);
	const available = budget.income - savedFromContributions;
	const percentOfBudget = available > 0 ? (projected / available) * 100 : 0;

	return {
		projected: Math.round(projected),
		available: Math.round(available),
		percentOfBudget: Math.round(percentOfBudget),
		isOverBudget: projected > available
	};
}
