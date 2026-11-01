import { getMonthKey, parseMonthKey, type Settings, type Transaction } from '$lib/db';
import { emptyPlanning, type PlanningData } from '$lib/planning/types';
import { formatDateForInput } from '$lib/utils/date-helpers';
import { normalizeMerchant } from '$lib/utils/string-helpers';
import { groupTransactionsIntoPurchases } from '$lib/utils/transaction-grouping';
import { createForecastIndex, monthMerchantKey, type ForecastIndex } from '$lib/planning/forecast-index';
import { config } from '$lib/config';
import { getRecurringSuggestions } from './recurringSuggestions';
import { getSettings } from './settings';

/** Reuse Ledger's recurring detection and subscription controls for an estimate.
 * These inferred schedules never become saved plans or recorded transactions.
 */
export async function getForecastPlanning(month: string, transactions: Transaction[], index: ForecastIndex = createForecastIndex(transactions), providedSettings?: Settings): Promise<PlanningData> {
	const settings = providedSettings ?? await getSettings();
	const planning = settings.planning ?? emptyPlanning();
	const rows = index.rows.filter(r => r.month <= month).map(r => r.transaction);
	const target = parseMonthKey(month);
	const purchases = index.purchases.filter(p => p.month <= month).flatMap(p => {
		const lines = p.purchase.sourceTransactions.filter(t => t.amount > 0);
		return lines.length === p.purchase.sourceTransactions.length ? [p.purchase] : groupTransactionsIntoPurchases(lines);
	});
	const byMerchant = new Map<string, typeof purchases>();
	const byMonthMerchant = new Map<string, typeof purchases>();
	for (const purchase of purchases) {
		const merchant = normalizeMerchant(purchase.merchant);
		const key = monthMerchantKey(getMonthKey(purchase.date), merchant);
		if (!byMerchant.has(merchant)) byMerchant.set(merchant, []);
		if (!byMonthMerchant.has(key)) byMonthMerchant.set(key, []);
		byMerchant.get(merchant)!.push(purchase);
		byMonthMerchant.get(key)!.push(purchase);
	}
	const bills = (await getRecurringSuggestions(month, rows, { includeRecorded: true, purchases: purchases.flatMap(p => {
		const lines = p.sourceTransactions.filter(t => !t.isExpectedOneOff);
		return lines.length === p.sourceTransactions.length ? [p] : groupTransactionsIntoPurchases(lines);
	}) })).filter(bill => {
		if (settings.confirmedActiveSubscriptions.includes(bill.id) || settings.confirmedActiveSubscriptions.includes(normalizeMerchant(bill.merchant))) return true;
		const last = Math.max(...(byMerchant.get(normalizeMerchant(bill.merchant)) ?? []).filter(p => (!bill.isSubscription || Math.abs(p.totalAmount - bill.expectedAmount) <= .01)).map(p => p.date.getTime()));
		const days = (target.getTime() - last) / 86400000;
		const limit = bill.frequency === 'annual' ? config.subscription.annualStaleMonths * 30 : bill.frequency === 'semi-annual' ? config.subscription.semiAnnualStaleMonths * 30 : config.subscription.monthlyStaleDays;
		return days <= limit;
	});
	const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
	return { ...planning, schedules: [...planning.schedules, ...bills.map(bill => {
		const expectedDate = new Date(target.getFullYear(), target.getMonth(), Math.min(bill.expectedDate, lastDay));
		// An existing payment can move within the month without creating a second bill.
		const payment = (byMonthMerchant.get(monthMerchantKey(month, normalizeMerchant(bill.merchant))) ?? []).filter(p => p.sourceTransactions.some(t => t.categoryId === bill.categoryId) && (!bill.isSubscription || Math.abs(p.totalAmount - bill.expectedAmount) <= Math.max(.01, bill.expectedAmount * .05))).sort((a, b) => Math.abs(a.date.getTime() - expectedDate.getTime()) - Math.abs(b.date.getTime() - expectedDate.getTime()))[0];
		return {
		id: `forecast:${bill.id}`,
		merchant: bill.merchant,
		date: formatDateForInput(payment?.date ?? expectedDate),
		frequency: bill.frequency,
		amount: bill.isSubscription ? bill.expectedAmount : settings.fixedRecurringAmounts?.find(a => a.merchant === normalizeMerchant(bill.merchant))?.amount ?? bill.expectedAmount,
		// Detected bill amounts are estimates; the actual payment replaces them.
		amountType: bill.isSubscription ? bill.amountType : 'variable' as const,
		categoryId: bill.categoryId,
		isShared: bill.isShared,
		splitType: bill.splitType,
		splitValue: bill.splitValue,
		active: true
	};
	})] };
}
