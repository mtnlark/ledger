import { getMonthKey, parseMonthKey, type Transaction } from '$lib/db';
import { emptyPlanning, type PlanningData } from '$lib/planning/types';
import { formatDateForInput } from '$lib/utils/date-helpers';
import { normalizeMerchant } from '$lib/utils/string-helpers';
import { groupTransactionsIntoPurchases } from '$lib/utils/transaction-grouping';
import { config } from '$lib/config';
import { getRecurringSuggestions } from './recurringSuggestions';
import { getSettings } from './settings';

/** Reuse Ledger's recurring detection and subscription controls for an estimate.
 * These inferred schedules never become saved plans or recorded transactions.
 */
export async function getForecastPlanning(month: string, transactions: Transaction[]): Promise<PlanningData> {
	const settings = await getSettings();
	const planning = settings.planning ?? emptyPlanning();
	const rows = transactions.filter(t => getMonthKey(new Date(t.date)) <= month);
	const target = parseMonthKey(month);
	const purchases = groupTransactionsIntoPurchases(rows.filter(t => t.amount > 0 && !t.refundOfTransactionId));
	const bills = (await getRecurringSuggestions(month, rows, { includeRecorded: true })).filter(bill => {
		if (settings.confirmedActiveSubscriptions.includes(bill.id) || settings.confirmedActiveSubscriptions.includes(normalizeMerchant(bill.merchant))) return true;
		const last = Math.max(...purchases.filter(p => normalizeMerchant(p.merchant) === normalizeMerchant(bill.merchant) && (!bill.isSubscription || Math.abs(p.totalAmount - bill.expectedAmount) <= .01)).map(p => p.date.getTime()));
		const days = (target.getTime() - last) / 86400000;
		const limit = bill.frequency === 'annual' ? config.subscription.annualStaleMonths * 30 : bill.frequency === 'semi-annual' ? config.subscription.semiAnnualStaleMonths * 30 : config.subscription.monthlyStaleDays;
		return days <= limit;
	});
	const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
	return { ...planning, schedules: [...planning.schedules, ...bills.map(bill => {
		const expectedDate = new Date(target.getFullYear(), target.getMonth(), Math.min(bill.expectedDate, lastDay));
		// An existing payment can move within the month without creating a second bill.
		const payment = purchases.filter(p => getMonthKey(p.date) === month && normalizeMerchant(p.merchant) === normalizeMerchant(bill.merchant) && p.sourceTransactions.some(t => t.categoryId === bill.categoryId) && (!bill.isSubscription || Math.abs(p.totalAmount - bill.expectedAmount) <= Math.max(.01, bill.expectedAmount * .05))).sort((a, b) => Math.abs(a.date.getTime() - expectedDate.getTime()) - Math.abs(b.date.getTime() - expectedDate.getTime()))[0];
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
