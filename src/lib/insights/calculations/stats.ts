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
 * Compute the median of a set of values. Returns 0 for an empty array.
 * Unlike the mean, a single outlier can shift the median by at most one
 * rank position, making it a better "typical value" for skewed monthly
 * spending data (e.g., one big one-off purchase among mostly-zero months).
 */
export function computeMedian(values: number[]): number {
	if (values.length === 0) return 0;

	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Generate exponential decay weights for a sequence of values.
 * Most recent value (last in array) gets weight 1.0, earlier values decay.
 *
 * @param length Number of weights to generate
 * @param decay Decay factor per period (default 0.85 = 15% decay per month)
 * @returns Array of weights, oldest first (to match chronological order)
 */
export function generateDecayWeights(length: number, decay = 0.85): number[] {
	const weights: number[] = [];
	for (let i = 0; i < length; i++) {
		// i=0 is oldest, i=length-1 is most recent
		const periodsFromEnd = length - 1 - i;
		weights.push(Math.pow(decay, periodsFromEnd));
	}
	return weights;
}

/**
 * Compute weighted mean.
 */
export function computeWeightedMean(values: number[], weights: number[]): number {
	if (values.length === 0 || values.length !== weights.length) return 0;

	const weightedSum = values.reduce((sum, v, i) => sum + v * weights[i], 0);
	const weightSum = weights.reduce((sum, w) => sum + w, 0);
	return weightSum > 0 ? weightedSum / weightSum : 0;
}

/**
 * Compute weighted population standard deviation.
 * Uses reliability weights (frequency weights) formula.
 */
export function computeWeightedStdDev(values: number[], weights: number[]): number {
	if (values.length < 2 || values.length !== weights.length) return 0;

	const mean = computeWeightedMean(values, weights);
	const weightSum = weights.reduce((sum, w) => sum + w, 0);
	if (weightSum === 0) return 0;

	const weightedSquaredDiffs = values.reduce((sum, v, i) => sum + weights[i] * (v - mean) ** 2, 0);
	return Math.sqrt(weightedSquaredDiffs / weightSum);
}

/**
 * Compute z-score: how many standard deviations a value is from the mean.
 * Returns 0 if stdDev is 0 (avoids division by zero).
 */
export function computeZScore(value: number, mean: number, stdDev: number): number {
	if (stdDev === 0) return 0;
	return (value - mean) / stdDev;
}

/**
 * Find the most common value in an array (statistical mode).
 * For ties, returns the first value that reached the highest count.
 * Assumes arr is non-empty.
 */
export function mode<T>(arr: T[]): T {
	const counts = new Map<T, number>();
	for (const val of arr) {
		counts.set(val, (counts.get(val) || 0) + 1);
	}

	let maxCount = 0;
	let modeValue = arr[0];
	for (const [val, count] of counts) {
		if (count > maxCount) {
			maxCount = count;
			modeValue = val;
		}
	}
	return modeValue;
}
