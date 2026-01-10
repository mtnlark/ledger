import { db, calculatePartnerShare, getMonthKey, type Transaction } from '$lib/db';
import { liveQuery } from 'dexie';
import { persistData } from '$lib/storage';
import { invalidateMerchantCache } from './merchants';
import { invalidateRecurringCache } from './recurring';
import { getMonthDateRange } from '$lib/utils/date-helpers';

// Helper to invalidate all caches that depend on transaction data
function invalidateTransactionCaches(): void {
	invalidateMerchantCache();
	invalidateRecurringCache();
}

// Reactive transactions for current month
export function createTransactionsStore(month: string) {
	const { start, end } = getMonthDateRange(month);
	return liveQuery(() =>
		db.transactions
			.where('date')
			.between(start, end, true, true)
			.reverse()
			.sortBy('date')
	);
}

// Get all transactions for a month using indexed date range query
// Filters out split parent transactions (they've been replaced by children)
export async function getTransactionsByMonth(month: string): Promise<Transaction[]> {
	const { start, end } = getMonthDateRange(month);
	const transactions = await db.transactions
		.where('date')
		.between(start, end, true, true)
		.filter((t) => !t.isSplitParent)
		.reverse()
		.sortBy('date');
	return transactions;
}

// Get transactions within a date range using indexed query
// Filters out split parent transactions (they've been replaced by children)
export async function getTransactionsByDateRange(
	fromDate?: Date,
	toDate?: Date
): Promise<Transaction[]> {
	// Normalize dates to start/end of day for inclusive range
	const start = fromDate
		? new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate())
		: new Date(0); // Unix epoch if no start
	const end = toDate
		? new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59, 999)
		: new Date(9999, 11, 31); // Far future if no end

	return db.transactions
		.where('date')
		.between(start, end, true, true)
		.filter((t) => !t.isSplitParent)
		.reverse()
		.sortBy('date');
}

// Add a new transaction
export async function addTransaction(
	transaction: Omit<Transaction, 'id' | 'partnerShare' | 'createdAt' | 'updatedAt'>
): Promise<number> {
	const now = new Date();
	const partnerShare = transaction.isShared
		? calculatePartnerShare(transaction.amount, transaction.splitType, transaction.splitValue)
		: 0;

	const id = await db.transactions.add({
		...transaction,
		partnerShare,
		createdAt: now,
		updatedAt: now
	}) as number;

	invalidateTransactionCaches();
	await persistData();
	return id;
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

	invalidateTransactionCaches();
	await persistData();
}

// Delete a transaction
export async function deleteTransaction(id: number): Promise<void> {
	await db.transactions.delete(id);
	invalidateTransactionCaches();
	await persistData();
}

// Bulk delete transactions
export async function bulkDeleteTransactions(ids: number[]): Promise<void> {
	if (ids.length === 0) return;
	await db.transactions.where('id').anyOf(ids).delete();
	invalidateTransactionCaches();
	await persistData();
}

// Bulk update category for transactions
export async function bulkUpdateCategory(ids: number[], categoryId: number): Promise<void> {
	if (ids.length === 0) return;
	await db.transactions.where('id').anyOf(ids).modify({
		categoryId,
		updatedAt: new Date()
	});
	invalidateTransactionCaches();
	await persistData();
}

// Split a transaction into multiple category-based parts
export async function splitTransaction(
	id: number,
	splits: { categoryId: number; amount: number; notes?: string }[]
): Promise<number[]> {
	if (splits.length < 2) {
		throw new Error('Must have at least 2 split lines');
	}

	const parent = await db.transactions.get(id);
	if (!parent) {
		throw new Error('Transaction not found');
	}

	// Validate total equals parent amount (within rounding tolerance)
	const total = splits.reduce((sum, s) => sum + s.amount, 0);
	if (Math.abs(total - parent.amount) > 0.01) {
		throw new Error('Split amounts must equal original transaction amount');
	}

	// Cannot split a transaction that is already a child
	if (parent.parentTransactionId) {
		throw new Error('Cannot split a transaction that is already part of a split');
	}

	const now = new Date();
	const childIds: number[] = [];

	// Create child transactions
	for (const split of splits) {
		const partnerShare = parent.isShared
			? calculatePartnerShare(split.amount, parent.splitType, parent.splitValue)
			: 0;

		const childId = await db.transactions.add({
			date: parent.date,
			merchant: parent.merchant,
			amount: split.amount,
			categoryId: split.categoryId,
			isShared: parent.isShared,
			splitType: parent.splitType,
			splitValue: parent.splitValue,
			partnerShare,
			isSettled: parent.isSettled,
			settledDate: parent.settledDate,
			notes: split.notes,
			isEssential: parent.isEssential,
			isSubscription: parent.isSubscription,
			subscriptionFrequency: parent.subscriptionFrequency,
			parentTransactionId: id,
			createdAt: now,
			updatedAt: now
		});
		childIds.push(childId as number);
	}

	// Mark the parent as split so it's hidden from normal queries
	await db.transactions.update(id, {
		isSplitParent: true,
		updatedAt: now
	});

	invalidateTransactionCaches();
	await persistData();
	return childIds;
}

// Get child transactions for a split parent
export async function getSplitChildren(parentId: number): Promise<Transaction[]> {
	return db.transactions.where('parentTransactionId').equals(parentId).toArray();
}

// Check if a transaction has been split (has children)
export async function isSplitParent(id: number): Promise<boolean> {
	const children = await db.transactions.where('parentTransactionId').equals(id).count();
	return children > 0;
}

// Mark transactions as settled
export async function markAsSettled(ids: number[]): Promise<void> {
	const now = new Date();
	await db.transactions.where('id').anyOf(ids).modify({
		isSettled: true,
		settledDate: now,
		updatedAt: now
	});
	invalidateTransactionCaches();
	await persistData();
}

// Get unsettled transactions (sorted by date, most recent first)
// Note: IndexedDB doesn't support boolean index keys, so we use filter
export async function getUnsettledTransactions(): Promise<Transaction[]> {
	return db.transactions
		.filter((t) => t.isShared && !t.isSettled)
		.reverse()
		.sortBy('date');
}

// Calculate outstanding balance (what partner owes)
export async function calculateOutstandingBalance(): Promise<number> {
	const unsettled = await getUnsettledTransactions();
	return unsettled.reduce((sum, t) => sum + t.partnerShare, 0);
}

// Get the earliest month that has transactions (for month picker)
export async function getEarliestTransactionMonth(): Promise<string | null> {
	// Use date index to get earliest transaction directly
	const earliest = await db.transactions.orderBy('date').first();
	if (!earliest) return null;
	return getMonthKey(new Date(earliest.date));
}

// Get spending totals by month for trends chart
export async function getMonthlySpendingTrends(months: string[]): Promise<Map<string, number>> {
	const spending = new Map<string, number>();
	if (months.length === 0) return spending;

	// Initialize all months with 0
	for (const month of months) {
		spending.set(month, 0);
	}

	// Sort months to find date range
	const sortedMonths = [...months].sort();
	const firstMonth = sortedMonths[0];
	const lastMonth = sortedMonths[sortedMonths.length - 1];

	// Get date range that covers all requested months
	const { start } = getMonthDateRange(firstMonth);
	const { end } = getMonthDateRange(lastMonth);

	// Only load transactions within the requested date range
	const transactions = await db.transactions
		.where('date')
		.between(start, end, true, true)
		.toArray();

	// Sum spending for each month
	for (const t of transactions) {
		const monthKey = getMonthKey(new Date(t.date));

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
// Filters out split parent transactions (they've been replaced by children)
export async function getAllTransactions(): Promise<Transaction[]> {
	return db.transactions.filter((t) => !t.isSplitParent).toArray();
}

// Get spending by category across multiple months
export async function getCategoryTrends(
	categoryId: number,
	months: string[]
): Promise<Map<string, number>> {
	const spending = new Map<string, number>();
	if (months.length === 0) return spending;

	// Initialize all months with 0
	for (const month of months) {
		spending.set(month, 0);
	}

	// Sort months to find date range
	const sortedMonths = [...months].sort();
	const firstMonth = sortedMonths[0];
	const lastMonth = sortedMonths[sortedMonths.length - 1];

	// Get date range that covers all requested months
	const { start } = getMonthDateRange(firstMonth);
	const { end } = getMonthDateRange(lastMonth);

	// Use categoryId index and filter by date range
	const transactions = await db.transactions
		.where('categoryId')
		.equals(categoryId)
		.filter((t) => {
			const date = new Date(t.date);
			return date >= start && date <= end;
		})
		.toArray();

	// Sum spending for each month
	for (const t of transactions) {
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
