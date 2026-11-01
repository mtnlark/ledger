/** Opt-in benchmark, compiled with Vite's production SSR pipeline by run-forecast.mjs. */
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { db, DEFAULT_SETTINGS, type Transaction } from '$lib/db';
import { calculateForecast } from '$lib/planning/forecast';
import { calculateForecast as baselineForecast } from './baseline-forecast';
import { getForecastPlanning } from '$lib/stores/forecast';
import { getForecastPlanning as baselinePlanning } from './baseline-forecast-planning';
import { createForecastIndex } from '$lib/planning/forecast-index';
import { loadDashboardData } from '$lib/stores/dashboard';
import { getAllTransactions, getAvailableMonths, invalidateTransactionCache } from '$lib/stores/transactions';
import { getAllCategories } from '$lib/stores/categories';
import { getSettings } from '$lib/stores/settings';
import { getBudgetForMonth } from '$lib/stores/budget';
import { getEffectiveBudgetsForMonth } from '$lib/stores/categoryBudget';
import { getAllContributions, getContributionsAffectingAvailable } from '$lib/stores/savingsContributions';

const now = new Date(2026, 10, 3, 12), month = '2026-11';
async function measure(fn: () => unknown) {
	const start = performance.now(); await fn(); const initialMs = performance.now() - start;
	const samples = [];
	for (let i = 0; i < 5; i++) { const start = performance.now(); await fn(); samples.push(performance.now() - start); }
	return { initialMs: +initialMs.toFixed(2), repeatedMs: +samples.sort((a, b) => a - b)[2].toFixed(2) };
}
function records(size: number): Transaction[] {
	// 36 months, 45 recurring merchants plus unique everyday purchases; no split bug in equivalence fixture.
	return Array.from({ length: size }, (_, i) => {
		const period = i % 36;
		const slot = Math.floor(i / 36);
		const bill = i < 45 * 36;
		const date = new Date(2026, 10 - period, slot % 28 + 1, 12);
		return { id: i + 1, date, merchant: bill ? `Bill ${slot}` : `Everyday ${i}`, amount: bill ? 50 + slot : 42, categoryId: 1, isShared: false, splitType: 'percentage', splitValue: .5, partnerShare: 0, isSettled: false, isEssential: false, isSubscription: false, createdAt: now, updatedAt: now };
	});
}
async function baselineRefresh() {
	const [, , transactions, budget, , , contributions, rollover] = await Promise.all([
		getAllCategories(), getSettings(), getAllTransactions(), getBudgetForMonth(month), getAvailableMonths(),
		getContributionsAffectingAvailable(month), getAllContributions(), getEffectiveBudgetsForMonth(month)
	]);
	return baselineForecast({ month, transactions, contributions, income: budget?.income ?? null, rolloverAdjustment: rollover.carryoverTotal - rollover.deficitCarried, planning: await baselinePlanning(month, transactions) });
}
export async function run() {
	const results = [];
	for (const size of [3000, 9000, 27000]) {
		await db.delete(); await db.open();
		await db.settings.put({ ...DEFAULT_SETTINGS, lastAutoSuggestedMonth: month });
		await db.categories.put({ id: 1, name: 'Synthetic', isActive: true, isEssential: false, sortOrder: 1 });
		const transactions = records(size);
		await db.transactions.bulkPut(transactions); invalidateTransactionCache();
		const planning = await getForecastPlanning(month, transactions);
		assert.deepEqual(planning, await baselinePlanning(month, transactions));
		const input = { month, now, transactions, planning, contributions: [], income: null };
		assert.deepEqual(calculateForecast(input), baselineForecast(input));
		assert.deepEqual((await loadDashboardData(month)).forecast, await baselineRefresh());
		const index = createForecastIndex(transactions);
		for (const [name, fn] of [
			['calculation before', () => baselineForecast(input)],
			['calculation after (including index)', () => calculateForecast(input)],
			['calculation after (shared index)', () => calculateForecast({ ...input, index })],
			['inference before', () => baselinePlanning(month, transactions)],
			['inference after (including index)', () => getForecastPlanning(month, transactions)],
			['refresh before', baselineRefresh],
			['refresh after', () => loadDashboardData(month)]
		] as const) {
			if (name.startsWith('refresh')) invalidateTransactionCache();
			results.push({ size, name, ...await measure(fn) });
		}
	}
	console.table(results);
	return results;
}
