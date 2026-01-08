import { writable, derived } from 'svelte/store';
import { db, calculatePartnerShare, getMonthKey, type Transaction } from '$lib/db';
import { liveQuery } from 'dexie';

// Current selected month store
export const currentMonth = writable(getMonthKey(new Date()));

// Reactive transactions for current month
export function createTransactionsStore(month: string) {
	return liveQuery(() =>
		db.transactions
			.where('date')
			.between(
				new Date(`${month}-01`),
				new Date(
					new Date(`${month}-01`).getFullYear(),
					new Date(`${month}-01`).getMonth() + 1,
					0,
					23,
					59,
					59
				)
			)
			.reverse()
			.sortBy('date')
	);
}

// Get all transactions for a month
export async function getTransactionsByMonth(month: string): Promise<Transaction[]> {
	// Get all transactions and filter by month using consistent month-key extraction
	// This avoids timezone issues where UTC dates might shift to adjacent months locally
	const allTransactions = await db.transactions.toArray();

	return allTransactions
		.filter((t) => {
			// Use getMonthKey which correctly extracts local year/month
			const txMonthKey = getMonthKey(new Date(t.date));
			return txMonthKey === month;
		})
		.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// Add a new transaction
export async function addTransaction(
	transaction: Omit<Transaction, 'id' | 'partnerShare' | 'createdAt' | 'updatedAt'>
): Promise<number> {
	const now = new Date();
	const partnerShare = transaction.isShared
		? calculatePartnerShare(transaction.amount, transaction.splitType, transaction.splitValue)
		: 0;

	return db.transactions.add({
		...transaction,
		partnerShare,
		createdAt: now,
		updatedAt: now
	});
}

// Update a transaction
export async function updateTransaction(
	id: number,
	updates: Partial<Omit<Transaction, 'id' | 'createdAt'>>
): Promise<void> {
	const existing = await db.transactions.get(id);
	if (!existing) return;

	// Recalculate partner share if relevant fields changed
	let partnerShare = existing.partnerShare;
	if (
		updates.amount !== undefined ||
		updates.splitType !== undefined ||
		updates.splitValue !== undefined ||
		updates.isShared !== undefined
	) {
		const isShared = updates.isShared ?? existing.isShared;
		const amount = updates.amount ?? existing.amount;
		const splitType = updates.splitType ?? existing.splitType;
		const splitValue = updates.splitValue ?? existing.splitValue;

		partnerShare = isShared ? calculatePartnerShare(amount, splitType, splitValue) : 0;
	}

	await db.transactions.update(id, {
		...updates,
		partnerShare,
		updatedAt: new Date()
	});
}

// Delete a transaction
export async function deleteTransaction(id: number): Promise<void> {
	await db.transactions.delete(id);
}

// Mark transactions as settled
export async function markAsSettled(ids: number[]): Promise<void> {
	const now = new Date();
	await db.transactions.where('id').anyOf(ids).modify({
		isSettled: true,
		settledDate: now,
		updatedAt: now
	});
}

// Get unsettled transactions
export async function getUnsettledTransactions(): Promise<Transaction[]> {
	// Filter for shared transactions that haven't been settled
	const allTransactions = await db.transactions.toArray();
	return allTransactions.filter((t) => t.isShared && !t.isSettled);
}

// Calculate outstanding balance (what partner owes)
export async function calculateOutstandingBalance(): Promise<number> {
	const unsettled = await getUnsettledTransactions();
	return unsettled.reduce((sum, t) => sum + t.partnerShare, 0);
}

// Get the earliest month that has transactions (for month picker)
export async function getEarliestTransactionMonth(): Promise<string | null> {
	const allTransactions = await db.transactions.toArray();
	if (allTransactions.length === 0) return null;

	// Find the earliest date
	const earliest = allTransactions.reduce((min, t) => {
		const date = new Date(t.date);
		return date < min ? date : min;
	}, new Date(allTransactions[0].date));

	return getMonthKey(earliest);
}

// Get spending totals by month for trends chart
export async function getMonthlySpendingTrends(months: string[]): Promise<Map<string, number>> {
	const allTransactions = await db.transactions.toArray();
	const spending = new Map<string, number>();

	// Initialize all months with 0
	for (const month of months) {
		spending.set(month, 0);
	}

	// Sum spending for each month
	for (const t of allTransactions) {
		const date = new Date(t.date);
		const monthKey = getMonthKey(date);

		if (spending.has(monthKey)) {
			// For shared transactions, only count your portion
			const amount = t.isShared ? t.amount - t.partnerShare : t.amount;
			spending.set(monthKey, (spending.get(monthKey) || 0) + amount);
		}
	}

	return spending;
}

// Get all months that have data (transactions or budgets)
export async function getAvailableMonths(): Promise<string[]> {
	const currentMonthKey = getMonthKey(new Date());
	const earliestMonth = await getEarliestTransactionMonth();

	// If no transactions, just return current month
	if (!earliestMonth) return [currentMonthKey];

	// Generate all months from earliest to current
	const months: string[] = [];
	const [startYear, startMonth] = earliestMonth.split('-').map(Number);
	const [endYear, endMonth] = currentMonthKey.split('-').map(Number);

	let year = startYear;
	let month = startMonth;

	while (year < endYear || (year === endYear && month <= endMonth)) {
		months.push(`${year}-${String(month).padStart(2, '0')}`);
		month++;
		if (month > 12) {
			month = 1;
			year++;
		}
	}

	return months;
}

// Get all transactions (for YTD calculations)
export async function getAllTransactions(): Promise<Transaction[]> {
	return db.transactions.toArray();
}

// Get spending by category across multiple months
export async function getCategoryTrends(
	categoryId: number,
	months: string[]
): Promise<Map<string, number>> {
	const allTransactions = await db.transactions.toArray();
	const spending = new Map<string, number>();

	// Initialize all months with 0
	for (const month of months) {
		spending.set(month, 0);
	}

	// Sum spending for the category in each month
	for (const t of allTransactions) {
		if (t.categoryId !== categoryId) continue;

		const monthKey = getMonthKey(new Date(t.date));
		if (spending.has(monthKey)) {
			const amount = t.isShared ? t.amount - t.partnerShare : t.amount;
			spending.set(monthKey, (spending.get(monthKey) || 0) + amount);
		}
	}

	return spending;
}

// Get daily spending for a month (for velocity chart)
export async function getDailySpending(
	month: string
): Promise<{ day: number; amount: number; cumulative: number }[]> {
	const transactions = await getTransactionsByMonth(month);

	// Parse month to get days in month
	const [year, monthNum] = month.split('-').map(Number);
	const daysInMonth = new Date(year, monthNum, 0).getDate();

	// Initialize all days with 0
	const dailyAmounts = new Map<number, number>();
	for (let d = 1; d <= daysInMonth; d++) {
		dailyAmounts.set(d, 0);
	}

	// Sum spending by day
	for (const t of transactions) {
		const date = new Date(t.date);
		const day = date.getDate();
		const amount = t.isShared ? t.amount - t.partnerShare : t.amount;
		dailyAmounts.set(day, (dailyAmounts.get(day) || 0) + amount);
	}

	// Build result with cumulative totals
	const result: { day: number; amount: number; cumulative: number }[] = [];
	let cumulative = 0;

	for (let d = 1; d <= daysInMonth; d++) {
		const amount = dailyAmounts.get(d) || 0;
		cumulative += amount;
		result.push({ day: d, amount, cumulative });
	}

	return result;
}
