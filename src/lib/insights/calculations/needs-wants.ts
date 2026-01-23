/**
 * Needs vs wants breakdown calculations.
 */

import type { Transaction } from '$lib/db';
import type { NeedsVsWantsResult, NeedsWantsFullResult } from '../types';
import { getUserAmount } from './spending';

/**
 * Calculate the breakdown between essential (needs) and non-essential (wants) spending.
 * Returns null if no transactions or total is zero.
 */
export function calculateNeedsVsWants(transactions: Transaction[]): NeedsVsWantsResult | null {
	if (transactions.length === 0) return null;

	let needsTotal = 0;
	let wantsTotal = 0;

	for (const t of transactions) {
		const amount = getUserAmount(t);
		if (t.isEssential) {
			needsTotal += amount;
		} else {
			wantsTotal += amount;
		}
	}

	const total = needsTotal + wantsTotal;
	if (total === 0) return null;

	const needsPercent = Math.round((needsTotal / total) * 100);
	return { needsTotal, wantsTotal, needsPercent };
}

/**
 * Calculate full needs/wants breakdown including both percentages.
 * Used by NeedsWantsInsights and YTDSummary which need wantsPercent.
 * Never returns null — returns zero stats for empty input.
 */
export function calculateNeedsVsWantsFull(transactions: Transaction[]): NeedsWantsFullResult {
	let needs = 0;
	let wants = 0;

	for (const tx of transactions) {
		const userAmount = getUserAmount(tx);
		if (tx.isEssential) {
			needs += userAmount;
		} else {
			wants += userAmount;
		}
	}

	const total = needs + wants;
	const needsPercent = total > 0 ? (needs / total) * 100 : 0;
	const wantsPercent = total > 0 ? (wants / total) * 100 : 0;

	return { needs, wants, total, needsPercent, wantsPercent };
}
