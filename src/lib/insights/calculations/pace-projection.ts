/**
 * Pace projection: project end-of-month spending based on current rate.
 */

import type { MonthlyBudget } from '$lib/db';
import type { PaceProjectionResult } from '../types';

/**
 * Calculate projected spending for the month based on current pace.
 *
 * @param totalSpent Total spent so far this month
 * @param budget Monthly budget (income - savings = available)
 * @param currentDay Current day of month (1-indexed)
 * @param daysInMonth Total days in the month
 */
export function calculatePaceProjection(
	totalSpent: number,
	budget: MonthlyBudget | null,
	currentDay: number,
	daysInMonth: number
): PaceProjectionResult | null {
	if (!budget) return null;
	if (currentDay === 0) return null;

	const dailyAvg = totalSpent / currentDay;
	const projected = totalSpent + dailyAvg * (daysInMonth - currentDay);
	const available = budget.income - budget.savedAmount;
	const percentOfBudget = available > 0 ? (projected / available) * 100 : 0;

	return {
		projected: Math.round(projected),
		available: Math.round(available),
		percentOfBudget: Math.round(percentOfBudget),
		isOverBudget: projected > available
	};
}
