/**
 * Anomaly detection: categories significantly above their historical average.
 */

import type { Category } from '$lib/db';
import type { AnomalyResult } from '../types';

interface AnomalyConfig {
	minAverage: number;
	ratioThreshold: number;
	maxToShow: number;
}

/**
 * Detect spending anomalies — categories significantly above their historical average.
 *
 * @param currentSpending Current month spending by category
 * @param averages Historical average spending by category
 * @param categories Category data for names
 * @param config Thresholds for detection
 */
export function detectAnomalies(
	currentSpending: Map<number, number>,
	averages: Map<number, number>,
	categories: Category[],
	config: AnomalyConfig
): AnomalyResult[] {
	const results: AnomalyResult[] = [];

	for (const [catId, current] of currentSpending) {
		const avg = averages.get(catId) || 0;

		if (avg > config.minAverage) {
			const ratio = current / avg;
			if (ratio > config.ratioThreshold) {
				const category = categories.find((c) => c.id === catId);
				results.push({
					catId,
					name: category?.name ?? 'Unknown',
					current,
					avg,
					ratio
				});
			}
		}
	}

	return results.sort((a, b) => b.ratio - a.ratio).slice(0, config.maxToShow);
}
