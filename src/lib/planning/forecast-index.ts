import { getMonthKey, type Transaction } from '$lib/db';
import { formatDateForInput } from '$lib/utils/date-helpers';
import { normalizeMerchant } from '$lib/utils/string-helpers';
import { groupTransactionsIntoPurchases, type TransactionPurchase } from '$lib/utils/transaction-grouping';
import { getUserAmount } from '$lib/utils/currency';

export interface ForecastRow {
	transaction: Transaction;
	month: string;
	day: number;
	date: string;
	userAmount: number;
}
export interface ForecastPurchase {
	purchase: TransactionPurchase;
	order: number;
	month: string;
	merchant: string;
	time: number;
	categories: Set<number>;
}

function append<T>(map: Map<string, T[]>, key: string, value: T) {
	const bucket = map.get(key);
	if (bucket) bucket.push(value);
	else map.set(key, [value]);
}
export const explicitPaymentKey = (id: string, date: string) => JSON.stringify([id, date]);
export const monthMerchantKey = (month: string, merchant: string) => `${month}:${merchant}`;

/** One refresh owns this index; never cache mutable transaction arrays across saves. */
export function createForecastIndex(transactions: Transaction[]) {
	const rows: ForecastRow[] = [];
	const rowsByMonth = new Map<string, ForecastRow[]>();
	let earliestMonth: string | null = null;
	for (const transaction of transactions) {
		if (transaction.isDeleted || transaction.isSplitParent) continue;
		const date = new Date(transaction.date);
		const month = getMonthKey(date);
		const row = { transaction, month, day: date.getDate(), date: formatDateForInput(date), userAmount: getUserAmount(transaction) };
		rows.push(row);
		append(rowsByMonth, month, row);
		if (earliestMonth === null || month < earliestMonth) earliestMonth = month;
	}
	const byMonthMerchant = new Map<string, ForecastPurchase[]>();
	const byMerchant = new Map<string, ForecastPurchase[]>();
	const explicit = new Map<string, ForecastPurchase[]>();
	const purchases = groupTransactionsIntoPurchases(rows.map(r => r.transaction).filter(t => !t.refundOfTransactionId)).map((purchase, order) => {
		const value: ForecastPurchase = { purchase, order, month: getMonthKey(purchase.date), merchant: normalizeMerchant(purchase.merchant), time: purchase.date.getTime(), categories: new Set(purchase.sourceTransactions.map(t => t.categoryId)) };
		append(byMonthMerchant, monthMerchantKey(value.month, value.merchant), value);
		append(byMerchant, value.merchant, value);
		const links = new Set(purchase.sourceTransactions.filter(t => t.scheduleId && t.scheduleDate).map(t => explicitPaymentKey(t.scheduleId!, t.scheduleDate!)));
		for (const key of links) append(explicit, key, value);
		return value;
	});
	return { rows, rowsByMonth, earliestMonth, purchases, byMonthMerchant, byMerchant, explicit };
}
export type ForecastIndex = ReturnType<typeof createForecastIndex>;
