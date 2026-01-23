/**
 * Velocity comparison: daily spending rate vs previous period.
 */

import type { VelocityComparisonResult } from '../types';

/**
 * Compare spending velocity (daily average) between current and previous periods.
 *
 * @param currentTotal Total spent in current period
 * @param prevTotal Total spent in previous period
 * @param currentDays Number of days elapsed in current period
 * @param prevDays Total days in previous period
 * @param percentThreshold Minimum percentage change to consider significant
 */
export function calculateVelocityComparison(
	currentTotal: number,
	prevTotal: number,
	currentDays: number,
	prevDays: number,
	percentThreshold: number
): VelocityComparisonResult | null {
	if (currentDays === 0) return null;

	const currentDailyAvg = currentTotal / currentDays;
	const prevDailyAvg = prevDays > 0 ? prevTotal / prevDays : 0;

	if (prevDailyAvg === 0) return null;

	const percentChange = Math.round(((currentDailyAvg - prevDailyAvg) / prevDailyAvg) * 100);

	if (Math.abs(percentChange) < percentThreshold) return null;

	return {
		currentDailyAvg,
		prevDailyAvg,
		percentChange,
		isUp: percentChange > 0
	};
}
