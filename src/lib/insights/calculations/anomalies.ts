/**
 * Anomaly detection: categories significantly above their historical average.
 * Uses z-scores when standard deviation data is available, falling back to
 * ratio-based detection for categories with insufficient history.
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
 * Detect spending anomalies — categories significantly above their historical average.
 * Uses z-score based detection when category stats (with stdDev) are available.
 * Falls back to ratio-based detection when stdDev is 0.
 *
 * @param currentSpending Current month spending by category
 * @param categoryStats Historical stats (mean + stdDev) per category
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

		const { mean, stdDev } = stats;
		if (mean < config.minAverage) continue;

		const ratio = current / mean;

		if (stdDev > 0) {
			// Z-score based: flag if spending is significantly above mean
			const zScore = computeZScore(current, mean, stdDev);
			if (zScore > config.zScoreThreshold) {
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
			if (ratio > fallbackRatio) {
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
