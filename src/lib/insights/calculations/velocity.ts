/**
 * Velocity comparison: daily spending rate vs previous period.
 * Optionally adapts threshold based on historical spending variance.
 */

import type { VelocityComparisonResult } from '../types';
import { computeStdDev } from './stats';

/**
 * Compare spending velocity (daily average) between current and previous periods.
 * When historicalMonthlyTotals is provided, the threshold adapts to the user's
 * natural spending variability (coefficient of variation).
 *
 * @param currentTotal Total spent in current period
 * @param prevTotal Total spent in previous period
 * @param currentDays Number of days elapsed in current period
 * @param prevDays Total days in previous period
 * @param percentThreshold Minimum percentage change to consider significant (also used as floor)
 * @param historicalMonthlyTotals Optional array of past monthly totals for adaptive threshold
 */
export function calculateVelocityComparison(
	currentTotal: number,
	prevTotal: number,
	currentDays: number,
	prevDays: number,
	percentThreshold: number,
	historicalMonthlyTotals?: number[]
): VelocityComparisonResult | null {
	if (currentDays === 0) return null;

	const currentDailyAvg = currentTotal / currentDays;
	const prevDailyAvg = prevDays > 0 ? prevTotal / prevDays : 0;

	if (prevDailyAvg === 0) return null;

	const percentChange = Math.round(((currentDailyAvg - prevDailyAvg) / prevDailyAvg) * 100);

	// Determine effective threshold
	let effectiveThreshold = percentThreshold;
	if (historicalMonthlyTotals && historicalMonthlyTotals.length >= 2) {
		const mean = historicalMonthlyTotals.reduce((s, v) => s + v, 0) / historicalMonthlyTotals.length;
		if (mean > 0) {
			const sd = computeStdDev(historicalMonthlyTotals);
			const cv = (sd / mean) * 100; // coefficient of variation as percentage
			effectiveThreshold = Math.max(cv, percentThreshold);
		}
	}

	if (Math.abs(percentChange) < effectiveThreshold) return null;

	return {
		currentDailyAvg,
		prevDailyAvg,
		percentChange,
		isUp: percentChange > 0
	};
}
