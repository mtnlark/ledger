/**
 * Anomaly detection: categories significantly above their historical average.
 * Uses z-scores when standard deviation data is available, falling back to
 * ratio-based detection for categories with insufficient history.
 *
 * Includes adaptive thresholds: with fewer months of history, the z-score
 * threshold is relaxed to avoid over-triggering on noisy statistics.
 */

import type { Category } from '$lib/db';
import type { AnomalyResult } from '../types';
import type { CategoryStats } from './category-averages';
import { computeZScore } from './stats';

interface AnomalyConfig {
	minAverage: number;
	zScoreThreshold: number;
	maxToShow: number;
	/** Fallback ratio threshold when stdDev is 0 (e.g., only 1 month of data) */
	fallbackRatioThreshold?: number;
}

/**
 * Calculate adaptive z-score threshold based on sample size.
 * With fewer months of history, we need a higher threshold to avoid
 * false positives from noisy statistics.
 *
 * Formula: threshold × (1 + 1/sampleCount)
 * - 2 months: threshold × 1.5 (e.g., 2.0 → 3.0)
 * - 3 months: threshold × 1.33 (e.g., 2.0 → 2.67)
 * - 6 months: threshold × 1.17 (e.g., 2.0 → 2.33)
 * - 12+ months: approaches base threshold
 */
function getAdaptiveZThreshold(baseThreshold: number, sampleCount: number): number {
	const adjustment = 1 / Math.max(sampleCount, 1);
	return baseThreshold * (1 + adjustment);
}

/**
 * Detect spending anomalies — categories significantly above their historical average.
 * Uses z-score based detection when category stats (with stdDev) are available.
 * Falls back to ratio-based detection when stdDev is 0.
 *
 * The z-score threshold is adaptive: categories with less history require
 * higher z-scores to be flagged, reducing false positives from noisy data.
 *
 * @param currentSpending Current month spending by category
 * @param categoryStats Historical stats (mean + stdDev + sampleCount) per category
 * @param categories Category data for names
 * @param config Thresholds for detection
 */
export function detectAnomalies(
	currentSpending: Map<number, number>,
	categoryStats: Map<number, CategoryStats>,
	categories: Category[],
	config: AnomalyConfig
): AnomalyResult[] {
	const results: AnomalyResult[] = [];
	const fallbackRatio = config.fallbackRatioThreshold ?? 1.5;

	for (const [catId, current] of currentSpending) {
		const stats = categoryStats.get(catId);
		if (!stats) continue;

		const { mean, stdDev, sampleCount } = stats;
		if (mean < config.minAverage) continue;

		const ratio = current / mean;

		if (stdDev > 0) {
			// Adaptive z-score threshold based on sample size
			const effectiveThreshold = getAdaptiveZThreshold(
				config.zScoreThreshold,
				sampleCount ?? 3 // fallback for legacy stats without sampleCount
			);

			// Z-score based: flag if spending is significantly above mean
			const zScore = computeZScore(current, mean, stdDev);
			if (zScore > effectiveThreshold) {
				const category = categories.find((c) => c.id === catId);
				results.push({
					catId,
					name: category?.name ?? 'Unknown',
					current,
					avg: mean,
					ratio,
					zScore
				});
			}
		} else {
			// Fallback: no variance data, use simple ratio
			// Also apply adaptive threshold for ratio
			const effectiveRatio = fallbackRatio * (1 + 1 / (sampleCount ?? 1));
			if (ratio > effectiveRatio) {
				const category = categories.find((c) => c.id === catId);
				results.push({
					catId,
					name: category?.name ?? 'Unknown',
					current,
					avg: mean,
					ratio
				});
			}
		}
	}

	// Sort by z-score (descending), then by ratio for fallback entries
	return results
		.sort((a, b) => (b.zScore ?? b.ratio) - (a.zScore ?? a.ratio))
		.slice(0, config.maxToShow);
}
