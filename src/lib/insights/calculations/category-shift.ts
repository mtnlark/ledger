/**
 * Category shift detection: biggest spending change from previous month.
 * Uses per-category standard deviation to determine significance.
 */

import type { Transaction, Category } from '$lib/db';
import type { CategoryShiftResult, CategoryDeepDiveShift } from '../types';
import type { AnomalyResult } from '../types';
import type { CategoryStats } from './category-averages';
import { getSpendingByCategory, getUserAmount } from './spending';

interface ShiftConfig {
	earlyMonthCutoff: number;
	earlyMonthRatio: number;
	zScoreThreshold: number;
	minAmount: number;
	fallbackMinDifference: number;
}

/**
 * Compute the top category shift (biggest absolute dollar change from last month).
 * Uses per-category stdDev to determine if a shift is statistically significant.
 * Filters out "down" shifts that are likely just expenses that haven't posted yet.
 * Also excludes shifts that overlap with detected anomalies.
 */
export function computeTopCategoryShift(
	currentTransactions: Transaction[],
	previousTransactions: Transaction[],
	categories: Category[],
	currentDay: number,
	anomalies: AnomalyResult[],
	config: ShiftConfig,
	categoryStats?: Map<number, CategoryStats>
): CategoryShiftResult | null {
	if (previousTransactions.length === 0) return null;

	const currentSpending = getSpendingByCategory(currentTransactions);
	const prevSpending = getSpendingByCategory(previousTransactions);

	const isEarlyInMonth = currentDay <= config.earlyMonthCutoff;

	let biggestShift: CategoryShiftResult | null = null;
	let biggestAbsDiff = 0;

	const allCatIds = new Set([...currentSpending.keys(), ...prevSpending.keys()]);

	for (const catId of allCatIds) {
		const current = currentSpending.get(catId) || 0;
		const previous = prevSpending.get(catId) || 0;
		const diff = current - previous;
		const absDiff = Math.abs(diff);
		const isDecrease = diff < 0;

		// Skip "down" shifts that look like expenses that haven't posted yet
		if (isDecrease) {
			if (current === 0) continue;
			if (
				isEarlyInMonth &&
				previous > 0 &&
				current / previous < config.earlyMonthRatio
			)
				continue;
		}

		// Determine minimum significant difference for this category
		const stats = categoryStats?.get(catId);
		const minDifference =
			stats && stats.stdDev > 0
				? stats.stdDev * config.zScoreThreshold
				: config.fallbackMinDifference;

		// Only consider meaningful shifts
		if (
			absDiff > biggestAbsDiff &&
			absDiff >= minDifference &&
			(current > config.minAmount || previous > config.minAmount)
		) {
			biggestAbsDiff = absDiff;
			const cat = categories.find((c) => c.id === catId);
			biggestShift = {
				name: cat?.name ?? 'Unknown',
				current,
				previous,
				diff,
				isIncrease: diff > 0
			};
		}
	}

	// Don't show if it's already an anomaly
	if (biggestShift && anomalies.some((a) => a.name === biggestShift!.name)) {
		return null;
	}

	return biggestShift;
}

/**
 * Compute the top category change for CategoryDeepDives preview.
 * Uses absolute dollar change as the ranking metric.
 * Includes icon and percent change.
 */
export function computeCategoryDeepDiveShift(
	currentTransactions: Transaction[],
	previousTransactions: Transaction[],
	categories: Category[]
): CategoryDeepDiveShift | null {
	if (previousTransactions.length === 0 || currentTransactions.length === 0) return null;

	const currentSpending = new Map<number, number>();
	const prevSpending = new Map<number, number>();

	for (const t of currentTransactions) {
		const amount = getUserAmount(t);
		currentSpending.set(t.categoryId, (currentSpending.get(t.categoryId) || 0) + amount);
	}
	for (const t of previousTransactions) {
		const amount = getUserAmount(t);
		prevSpending.set(t.categoryId, (prevSpending.get(t.categoryId) || 0) + amount);
	}

	let maxChange = { categoryId: 0, absDiff: 0, changePercent: 0, current: 0, previous: 0 };

	const allCategoryIds = new Set([...currentSpending.keys(), ...prevSpending.keys()]);

	for (const catId of allCategoryIds) {
		const current = currentSpending.get(catId) || 0;
		const previous = prevSpending.get(catId) || 0;
		const absDiff = Math.abs(current - previous);

		if (absDiff > maxChange.absDiff) {
			// Round percentage for display consistency
			const changePercent = previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0;
			maxChange = { categoryId: catId, absDiff, changePercent, current, previous };
		}
	}

	if (maxChange.categoryId === 0 || maxChange.absDiff === 0) return null;

	const cat = categories.find((c) => c.id === maxChange.categoryId);
	return {
		name: cat?.name ?? 'Unknown',
		icon: cat?.icon ?? '',
		changePercent: maxChange.changePercent,
		current: maxChange.current,
		previous: maxChange.previous
	};
}
