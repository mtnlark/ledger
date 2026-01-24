import type { Transaction, Category, MonthlyBudget } from '$lib/db';

/**
 * Get user's portion of a transaction amount (accounting for splits)
 */
export function getUserAmount(transaction: Transaction): number {
	return transaction.isShared ? transaction.amount - transaction.partnerShare : transaction.amount;
}

/**
 * Calculate total spending by category for a list of transactions.
 * Returns user's portion for shared transactions.
 */
export function getSpendingByCategory(transactions: Transaction[]): Map<number, number> {
	const spending = new Map<number, number>();
	for (const t of transactions) {
		const amount = getUserAmount(t);
		spending.set(t.categoryId, (spending.get(t.categoryId) || 0) + amount);
	}
	return spending;
}

/**
 * Calculate average spending per category across multiple months.
 * @param monthlySpending Map of month -> category spending map
 * @param months Array of month keys to average
 * @returns Map of categoryId -> average spending
 */
export function calculateCategoryAverages(
	monthlySpending: Map<string, Map<number, number>>,
	months: string[]
): Map<number, number> {
	const averages = new Map<number, number>();
	if (months.length === 0) return averages;

	// Collect totals per category
	const categoryTotals = new Map<number, number>();

	for (const month of months) {
		const spending = monthlySpending.get(month);
		if (spending) {
			for (const [catId, amount] of spending) {
				categoryTotals.set(catId, (categoryTotals.get(catId) || 0) + amount);
			}
		}
	}

	// Calculate averages (divide by total months, not just months with spending)
	for (const [catId, total] of categoryTotals) {
		averages.set(catId, total / months.length);
	}

	return averages;
}

/**
 * Anomaly detection result
 */
export interface AnomalyResult {
	catId: number;
	name: string;
	current: number;
	avg: number;
	ratio: number;
	zScore?: number;
}

/**
 * Detect spending anomalies - categories significantly above their historical average.
 * @param currentSpending Current month spending by category
 * @param averages Historical average spending by category
 * @param categories Category data for names
 * @param minAverage Minimum average to consider (filters out categories with little history)
 * @param ratioThreshold Spending must be this ratio above average to be flagged
 * @param maxToShow Maximum number of anomalies to return
 */
export function detectAnomalies(
	currentSpending: Map<number, number>,
	averages: Map<number, number>,
	categories: Array<{ id?: number; name: string }>,
	minAverage: number,
	ratioThreshold: number,
	maxToShow: number
): AnomalyResult[] {
	const results: AnomalyResult[] = [];

	for (const [catId, current] of currentSpending) {
		const avg = averages.get(catId) || 0;

		// Only flag if there's meaningful historical spending
		if (avg > minAverage) {
			const ratio = current / avg;
			if (ratio > ratioThreshold) {
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

	// Sort by ratio (highest first) and limit results
	return results.sort((a, b) => b.ratio - a.ratio).slice(0, maxToShow);
}

/**
 * Pace projection result
 */
export interface PaceProjectionResult {
	projected: number;
	available: number;
	percentOfBudget: number;
	isOverBudget: boolean;
}

/**
 * Calculate projected spending for the month based on current pace.
 * @param totalSpent Total spent so far this month
 * @param budget Monthly budget (income - savings = available)
 * @param currentDay Current day of month
 * @param daysInMonth Total days in the month
 */
export function calculatePaceProjection(
	totalSpent: number,
	budget: MonthlyBudget | null,
	currentDay: number,
	daysInMonth: number
): PaceProjectionResult | null {
	if (!budget) return null;
	if (currentDay === 0) return null;

	const dailyAvg = totalSpent / currentDay;
	const projected = totalSpent + dailyAvg * (daysInMonth - currentDay);
	const available = budget.income - budget.savedAmount;
	const percentOfBudget = available > 0 ? (projected / available) * 100 : 0;

	return {
		projected: Math.round(projected),
		available: Math.round(available),
		percentOfBudget: Math.round(percentOfBudget),
		isOverBudget: projected > available
	};
}

/**
 * Needs vs wants result
 */
export interface NeedsVsWantsResult {
	needsTotal: number;
	wantsTotal: number;
	needsPercent: number;
}

/**
 * Calculate the breakdown between essential (needs) and non-essential (wants) spending.
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
 * Velocity comparison result
 */
export interface VelocityComparisonResult {
	currentDailyAvg: number;
	prevDailyAvg: number;
	percentChange: number;
	isUp: boolean;
}

/**
 * Compare spending velocity (daily average) between current and previous periods.
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

	// Only return if change is significant
	if (Math.abs(percentChange) < percentThreshold) return null;

	return {
		currentDailyAvg,
		prevDailyAvg,
		percentChange,
		isUp: percentChange > 0
	};
}

/**
 * Top merchant result
 */
export interface TopMerchantResult {
	merchant: string;
	count: number;
}

/**
 * Find the most frequently visited merchant.
 * @param transactions List of transactions
 * @param minVisits Minimum visits to be considered
 */
export function getTopMerchant(
	transactions: Transaction[],
	minVisits: number
): TopMerchantResult | null {
	if (transactions.length === 0) return null;

	const freq = new Map<string, number>();
	for (const t of transactions) {
		freq.set(t.merchant, (freq.get(t.merchant) || 0) + 1);
	}

	let top = { merchant: '', count: 0 };
	for (const [merchant, count] of freq) {
		if (count > top.count) {
			top = { merchant, count };
		}
	}

	return top.count >= minVisits ? top : null;
}
