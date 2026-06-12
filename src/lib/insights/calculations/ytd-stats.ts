/**
 * Year-to-date statistics calculations.
 */

import { format } from 'date-fns';
import { getMonthKey } from '$lib/db';
import type { Transaction } from '$lib/db';
import type { YTDStatsResult } from '../types';
import { getUserAmount } from './spending';
import { countMerchantVisits } from './top-merchant';

/**
 * Compute year-to-date statistics for all transactions in the current year.
 *
 * @param allTransactions All transactions (will be filtered to current year)
 * @param year The year to compute stats for (defaults to current year)
 */
export function computeYTDStats(allTransactions: Transaction[], year?: number): YTDStatsResult {
	const currentYear = year ?? new Date().getFullYear();

	// Filter to current year
	const ytdTransactions = allTransactions.filter(
		(t) => new Date(t.date).getFullYear() === currentYear
	);

	// Build daily spending map
	const dailySpending = new Map<string, number>();
	for (const t of ytdTransactions) {
		const dateKey = format(new Date(t.date), 'yyyy-MM-dd');
		const amount = getUserAmount(t);
		dailySpending.set(dateKey, (dailySpending.get(dateKey) || 0) + amount);
	}

	// Total spent
	let totalSpent = 0;
	for (const t of ytdTransactions) {
		totalSpent += getUserAmount(t);
	}

	// Stats window: Jan 1 of the target year through today, clamped to Dec 31
	// for completed past years (use UTC to avoid DST-related partial-day errors)
	const now = new Date();
	const endDate = currentYear < now.getFullYear() ? new Date(currentYear, 11, 31) : now;
	const endKey = format(endDate, 'yyyy-MM-dd');

	// Spend days (only count days inside the window, excluding future-dated transactions)
	const spendDaySet = new Set<string>();
	for (const t of ytdTransactions) {
		const dateKey = format(new Date(t.date), 'yyyy-MM-dd');
		if (dateKey <= endKey) {
			spendDaySet.add(dateKey);
		}
	}
	const spendDays = spendDaySet.size;
	const startUTC = Date.UTC(currentYear, 0, 1);
	const endUTC = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
	const daysInYearSoFar = Math.max(
		0,
		Math.floor((endUTC - startUTC) / (1000 * 60 * 60 * 24)) + 1
	);

	const noSpendDays = daysInYearSoFar - spendDays;
	const dailyAvg = daysInYearSoFar > 0 ? totalSpent / daysInYearSoFar : 0;

	// Biggest spending month
	const monthlySpending = new Map<string, number>();
	for (const t of ytdTransactions) {
		const monthKey = getMonthKey(new Date(t.date));
		const amount = getUserAmount(t);
		monthlySpending.set(monthKey, (monthlySpending.get(monthKey) || 0) + amount);
	}

	// Exclude current calendar month from biggest/smallest (partial month would skew results)
	const currentMonthKey = getMonthKey(now);
	const completedMonths = new Map<string, number>();
	for (const [month, amount] of monthlySpending) {
		if (month !== currentMonthKey) {
			completedMonths.set(month, amount);
		}
	}

	let biggestMonth: { label: string; amount: number } | null = null;
	if (completedMonths.size > 0) {
		let max = { month: '', amount: 0 };
		for (const [month, amount] of completedMonths) {
			if (amount > max.amount) {
				max = { month, amount };
			}
		}
		if (max.month) {
			const [, monthNum] = max.month.split('-').map(Number);
			const monthName = new Date(currentYear, monthNum - 1).toLocaleString('default', {
				month: 'long'
			});
			biggestMonth = { label: monthName, amount: max.amount };
		}
	}

	// Smallest spending month (only if 2+ completed months exist)
	let smallestMonth: { label: string; amount: number } | null = null;
	if (completedMonths.size > 1) {
		let min = { month: '', amount: Infinity };
		for (const [month, amount] of completedMonths) {
			if (amount < min.amount) {
				min = { month, amount };
			}
		}
		if (min.month) {
			const [, monthNum] = min.month.split('-').map(Number);
			const monthName = new Date(currentYear, monthNum - 1).toLocaleString('default', {
				month: 'long'
			});
			smallestMonth = { label: monthName, amount: min.amount };
		}
	}

	// Most frequent merchant (no minimum threshold for YTD)
	// Split children sharing a parentTransactionId count as one visit
	const freq = countMerchantVisits(ytdTransactions);
	let topMerchant: { merchant: string; count: number } | null = null;
	let maxCount = 0;
	for (const [merchant, count] of freq) {
		if (count > maxCount) {
			maxCount = count;
			topMerchant = { merchant, count };
		}
	}
	if (topMerchant && topMerchant.merchant === '') {
		topMerchant = null;
	}

	return {
		totalSpent,
		spendDays,
		noSpendDays,
		daysInYearSoFar,
		dailyAvg,
		biggestMonth,
		smallestMonth,
		topMerchant,
		dailySpending
	};
}
