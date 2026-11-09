import { getAllTransactions, getAvailableMonths } from './transactions';
import { getAllCategories } from './categories';
import { getSettings } from './settings';
import { getBudgetForMonth } from './budget';
import { getEffectiveBudgetsForMonth } from './categoryBudget';
import { getAllContributions, getContributionsAffectingAvailable } from './savingsContributions';
import { getForecastPlanning } from './forecast';
import { getRecurringSuggestions, shouldShowRecurringBanner } from './recurringSuggestions';
import { calculateForecast } from '$lib/planning/forecast';
import { createForecastIndex } from '$lib/planning/forecast-index';
import { summarizeSavings } from '$lib/utils/savings-summary';

/** Build a complete view from plain store results before publishing reactive state. */
export async function loadDashboardData(month: string) {
	const [categories, settings, allTransactions, budget, availableMonths, contributions, forecastContributions, rollover] = await Promise.all([
		getAllCategories(), getSettings(), getAllTransactions(), getBudgetForMonth(month),
		getAvailableMonths(), getContributionsAffectingAvailable(month), getAllContributions(), getEffectiveBudgetsForMonth(month)
	]);
	const index = createForecastIndex(allTransactions);
	const [planning, recurringSuggestions] = await Promise.all([
		getForecastPlanning(month, allTransactions, index, settings),
		shouldShowRecurringBanner(month, settings.lastAutoSuggestedMonth) ? getRecurringSuggestions(month, allTransactions) : []
	]);
	const rolloverAdjustment = rollover.carryoverTotal - rollover.deficitCarried;
	const forecast = calculateForecast({ month, transactions: allTransactions, contributions: forecastContributions, planning, income: budget?.income ?? null, rolloverAdjustment, index });
	return {
		categories, settings, allTransactions, budget, availableMonths, recurringSuggestions, rolloverAdjustment, forecast,
		transactions: (index.rowsByMonth.get(month) ?? []).map(r => r.transaction),
		savedFromContributions: summarizeSavings(contributions).netCashSaved,
		fromSavings: summarizeSavings(contributions).withdrawals
	};
}
