import type { CategoryBudget } from '$lib/db';
import { roundCurrency } from './currency';

/**
 * Budget rollover semantics (decided June 2026):
 * - Surpluses on rollover-enabled budget rows carry into the SAME category's
 *   next month and chain across consecutive rollover months. A month with no
 *   budget row, or with rollsOver off, breaks the chain.
 * - Deficits never reduce the category's next budget. Overspend on last
 *   month's rollover rows is summed into a month-level pool (deficitCarried)
 *   that reduces the overall effective total — a rebalancing prompt, with
 *   one-month memory only.
 */

export interface EffectiveBudget {
	categoryId: number;
	/** This month's budgetAmount. */
	base: number;
	/** Surplus carried into this category from the rollover chain (≥ 0). */
	carryover: number;
	/** base + carryover. */
	effective: number;
	/** This month's rollsOver flag. */
	rollsOver: boolean;
}

export interface RolloverResult {
	byCategory: Map<number, EffectiveBudget>;
	/** Overspend across last month's rollover rows (≥ 0); reduces the pool, not categories. */
	deficitCarried: number;
	/** The month the deficit came from, for display ("carried from May"). */
	prevMonth: string;
	/** Σ effective − deficitCarried. */
	effectiveTotal: number;
}

export interface RolloverOptions {
	/** How many months back the surplus chain may reach (default 24). */
	maxChainMonths?: number;
}

export function previousMonthKey(month: string): string {
	const [y, m] = month.split('-').map(Number);
	return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export function computeEffectiveBudgets(
	budgets: CategoryBudget[],
	spendingByMonth: Map<string, Map<number, number>>,
	targetMonth: string,
	options: RolloverOptions = {}
): RolloverResult {
	const { maxChainMonths = 24 } = options;

	// Index rows by category, then month
	const rowsByCategory = new Map<number, Map<string, CategoryBudget>>();
	for (const b of budgets) {
		if (b.month > targetMonth) continue;
		let byMonth = rowsByCategory.get(b.categoryId);
		if (!byMonth) {
			byMonth = new Map();
			rowsByCategory.set(b.categoryId, byMonth);
		}
		byMonth.set(b.month, b);
	}

	// Ascending walk window ending at targetMonth
	const months: string[] = [targetMonth];
	for (let i = 0; i < maxChainMonths; i++) {
		months.unshift(previousMonthKey(months[0]));
	}

	const prevMonth = previousMonthKey(targetMonth);
	const spent = (month: string, categoryId: number): number =>
		spendingByMonth.get(month)?.get(categoryId) ?? 0;

	const byCategory = new Map<number, EffectiveBudget>();
	let deficitCarried = 0;
	let effectiveSum = 0;

	for (const [categoryId, rows] of rowsByCategory) {
		// Surplus carried INTO the month currently being walked; 0 outside a chain
		let surplusCarry = 0;

		for (const month of months) {
			const budgetRow = rows.get(month);
			if (!budgetRow) {
				// Gap breaks the chain
				surplusCarry = 0;
				continue;
			}

			const carryover = roundCurrency(surplusCarry);
			const effective = roundCurrency(budgetRow.budgetAmount + carryover);
			const monthSpent = spent(month, categoryId);

			if (month === targetMonth) {
				byCategory.set(categoryId, {
					categoryId,
					base: budgetRow.budgetAmount,
					carryover,
					effective,
					rollsOver: budgetRow.rollsOver === true
				});
				effectiveSum += effective;
			} else if (budgetRow.rollsOver === true) {
				surplusCarry = Math.max(0, roundCurrency(effective - monthSpent));
				if (month === prevMonth) {
					deficitCarried += Math.max(0, roundCurrency(monthSpent - effective));
				}
			} else {
				// Budgeted but not rolling over: chain ends here
				surplusCarry = 0;
			}
		}
	}

	deficitCarried = roundCurrency(deficitCarried);
	return {
		byCategory,
		deficitCarried,
		prevMonth,
		effectiveTotal: roundCurrency(effectiveSum - deficitCarried)
	};
}
