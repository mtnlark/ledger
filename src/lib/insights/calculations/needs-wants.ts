/**
 * Needs vs wants breakdown calculations.
 */

import type { Transaction } from '$lib/db';
import type { NeedsVsWantsResult, NeedsWantsFullResult } from '../types';
import { getUserAmount } from './spending';
import { calculatePercent } from '$lib/utils/currency';

/**
 * Check if a transaction is essential (needs), falling back to category default.
 */
function isEssential(t: Transaction, categoryEssentialMap?: Map<number, boolean>): boolean {
	return t.isEssential || (categoryEssentialMap?.get(t.categoryId) ?? false);
}

/**
 * Calculate the breakdown between essential (needs) and non-essential (wants) spending.
 * Returns null if no transactions or total is zero.
 *
 * @param categoryEssentialMap Optional map of categoryId → isEssential for fallback classification
 */
export function calculateNeedsVsWants(
	transactions: Transaction[],
	categoryEssentialMap?: Map<number, boolean>
): NeedsVsWantsResult | null {
	if (transactions.length === 0) return null;

	let needsTotal = 0;
	let wantsTotal = 0;

	for (const t of transactions) {
		const amount = getUserAmount(t);
		if (isEssential(t, categoryEssentialMap)) {
			needsTotal += amount;
		} else {
			wantsTotal += amount;
		}
	}

	const total = needsTotal + wantsTotal;
	if (total === 0) return null;

	const needsPercent = calculatePercent(needsTotal, total, true);
	return { needsTotal, wantsTotal, needsPercent };
}

/**
 * Calculate full needs/wants breakdown including both percentages.
 * Used by NeedsWantsInsights and YTDSummary which need wantsPercent.
 * Never returns null — returns zero stats for empty input.
 *
 * @param categoryEssentialMap Optional map of categoryId → isEssential for fallback classification
 */
export function calculateNeedsVsWantsFull(
	transactions: Transaction[],
	categoryEssentialMap?: Map<number, boolean>
): NeedsWantsFullResult {
	let needs = 0;
	let wants = 0;

	for (const tx of transactions) {
		const userAmount = getUserAmount(tx);
		if (isEssential(tx, categoryEssentialMap)) {
			needs += userAmount;
		} else {
			wants += userAmount;
		}
	}

	const total = needs + wants;
	// Round percentages to match calculateNeedsVsWants() for display consistency
	const needsPercent = calculatePercent(needs, total, true);
	const wantsPercent = calculatePercent(wants, total, true);

	return { needs, wants, total, needsPercent, wantsPercent };
}
