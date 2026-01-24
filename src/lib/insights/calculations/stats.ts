/**
 * Shared statistical helpers for insight calculations.
 * Uses population standard deviation (not sample) since we compute
 * over the user's complete transaction history.
 */

/**
 * Compute population standard deviation for a set of values.
 * Returns 0 for empty arrays or arrays with a single value.
 */
export function computeStdDev(values: number[]): number {
	if (values.length < 2) return 0;

	const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
	const squaredDiffs = values.reduce((sum, v) => sum + (v - mean) ** 2, 0);
	return Math.sqrt(squaredDiffs / values.length);
}

/**
 * Compute z-score: how many standard deviations a value is from the mean.
 * Returns 0 if stdDev is 0 (avoids division by zero).
 */
export function computeZScore(value: number, mean: number, stdDev: number): number {
	if (stdDev === 0) return 0;
	return (value - mean) / stdDev;
}
