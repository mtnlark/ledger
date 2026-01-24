import { db, calculatePartnerShare, getMonthKey, type Transaction } from '$lib/db';
import { liveQuery } from 'dexie';
import { persistData } from '$lib/storage';
import { invalidateMerchantCache } from './merchants';
import { invalidateRecurringCache } from './recurring';
import { isSubscriptionCancelled, reactivateSubscription } from './subscriptionSettings';
import { getMonthDateRange } from '$lib/utils/date-helpers';
import { getTransactionCache } from './transactionCache';
import {
	validateAmount,
	validateMerchant,
	validateCategory,
	validateSplitValue
} from '$lib/utils/transaction-validation';

// Re-export cache utilities for external use
export { getTransactionCache, invalidateTransactionCache } from './transactionCache';
export type { CachedTransaction } from './transactionCache';

// Helper to invalidate all caches that depend on transaction data
function invalidateTransactionCaches(): void {
	invalidateMerchantCache();
	invalidateRecurringCache();
}

// Reactive transactions for current month
// Filters out split parent transactions (they've been replaced by children)
export function createTransactionsStore(month: string) {
	const { start, end } = getMonthDateRange(month);
	return liveQuery(() =>
		db.transactions
			.where('date')
			.between(start, end, true, true)
			.filter((t) => !t.isSplitParent)
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
// Returns the ID of the created transaction
// Throws if validation fails
export async function addTransaction(
	transaction: Omit<Transaction, 'id' | 'partnerShare' | 'createdAt' | 'updatedAt'>
): Promise<number> {
	// Validate required fields
	const amountResult = validateAmount(transaction.amount);
	if (!amountResult.isValid) {
		throw new Error(amountResult.error ?? 'Invalid amount');
	}

	const merchantResult = validateMerchant(transaction.merchant);
	if (!merchantResult.isValid) {
		throw new Error(merchantResult.error ?? 'Invalid merchant');
	}

	const categoryResult = validateCategory(transaction.categoryId);
	if (!categoryResult.isValid) {
		throw new Error(categoryResult.error ?? 'Invalid category');
	}

	// Validate date is a valid Date object
	if (!(transaction.date instanceof Date) || isNaN(transaction.date.getTime())) {
		throw new Error('Invalid date');
	}

	// Validate split value if shared
	if (transaction.isShared) {
		const splitResult = validateSplitValue(
			transaction.splitType,
			transaction.splitValue,
			transaction.amount
		);
		if (!splitResult.isValid) {
			throw new Error('Invalid split value');
		}
	}

	const now = new Date();
	const partnerShare = transaction.isShared
		? calculatePartnerShare(transaction.amount, transaction.splitType, transaction.splitValue)
		: 0;

	const newTransaction: Omit<Transaction, 'id'> = {
		...transaction,
		partnerShare,
		createdAt: now,
		updatedAt: now
	};

	const id = (await db.transactions.add(newTransaction)) as number;

	// Update the cache incrementally
	const cache = getTransactionCache();
	if (cache.isLoaded) {
		cache.add({ ...newTransaction, id } as Transaction & { id: number });
	}

	// Auto-reactivate if adding a subscription for a cancelled merchant
	if (transaction.isSubscription && await isSubscriptionCancelled(transaction.merchant)) {
		await reactivateSubscription(transaction.merchant);
	}

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

	const updatedFields = {
		...updates,
		partnerShare,
		updatedAt: new Date()
	};

	await db.transactions.update(id, updatedFields);

	// Update the cache incrementally
	const cache = getTransactionCache();
	if (cache.isLoaded) {
		cache.update(id, updatedFields);
	}

	// Auto-reactivate if marking as subscription for a cancelled merchant
	if (updates.isSubscription === true) {
		const merchant = updates.merchant ?? existing.merchant;
		if (await isSubscriptionCancelled(merchant)) {
			await reactivateSubscription(merchant);
		}
	}

	invalidateTransactionCaches();
	await persistData();
}

// Delete a transaction
export async function deleteTransaction(id: number): Promise<void> {
	await db.transactions.delete(id);

	// Update the cache incrementally
	const cache = getTransactionCache();
	if (cache.isLoaded) {
		cache.remove(id);
	}

	invalidateTransactionCaches();
	await persistData();
}

// Bulk delete transactions
export async function bulkDeleteTransactions(ids: number[]): Promise<void> {
	if (ids.length === 0) return;
	await db.transactions.where('id').anyOf(ids).delete();

	// Update the cache incrementally
	const cache = getTransactionCache();
	if (cache.isLoaded) {
		cache.bulkRemove(ids);
	}

	invalidateTransactionCaches();
	await persistData();
}

// Bulk update category for transactions
export async function bulkUpdateCategory(ids: number[], categoryId: number): Promise<void> {
	if (ids.length === 0) return;
	const updatedAt = new Date();
	await db.transactions.where('id').anyOf(ids).modify({
		categoryId,
		updatedAt
	});

	// Update the cache incrementally
	const cache = getTransactionCache();
	if (cache.isLoaded) {
		cache.bulkUpdate(ids, { categoryId, updatedAt });
	}

	invalidateTransactionCaches();
	await persistData();
}

// Split a transaction into multiple category-based parts
// Returns the child transaction IDs
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
	const childTransactions: Transaction[] = [];

	// Create child transactions
	for (const split of splits) {
		const partnerShare = parent.isShared
			? calculatePartnerShare(split.amount, parent.splitType, parent.splitValue)
			: 0;

		const childData: Omit<Transaction, 'id'> = {
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
		};

		const childId = (await db.transactions.add(childData)) as number;
		childIds.push(childId);
		childTransactions.push({ ...childData, id: childId } as Transaction);
	}

	// Mark the parent as split so it's hidden from normal queries
	await db.transactions.update(id, {
		isSplitParent: true,
		updatedAt: now
	});

	// Update the cache incrementally
	const cache = getTransactionCache();
	if (cache.isLoaded) {
		// Mark parent as split (will be excluded from getAll)
		cache.markSplitParent(id);
		// Add child transactions
		for (const child of childTransactions) {
			cache.add({ ...child, id: child.id! });
		}
	}

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

	// Update the cache incrementally
	const cache = getTransactionCache();
	if (cache.isLoaded) {
		cache.bulkUpdate(ids, { isSettled: true, settledDate: now, updatedAt: now });
	}

	invalidateTransactionCaches();
	await persistData();
}

// Get unsettled transactions (sorted by date, most recent first)
// Note: IndexedDB doesn't support boolean index keys, so we use filter
// Filters out split parent transactions (they've been replaced by children)
export async function getUnsettledTransactions(): Promise<Transaction[]> {
	return db.transactions
		.filter((t) => t.isShared && !t.isSettled && !t.isSplitParent)
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
	// Exclude split parent transactions (they've been replaced by children)
	const transactions = await db.transactions
		.where('date')
		.between(start, end, true, true)
		.filter((t) => !t.isSplitParent)
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
// Uses cache when available, otherwise loads from DB and initializes cache
// Uses async lock to prevent concurrent double-loading
// Filters out split parent transactions (they've been replaced by children)
export async function getAllTransactions(): Promise<Transaction[]> {
	const cache = getTransactionCache();

	// Use async initialization with lock to prevent concurrent loads
	await cache.initializeAsync(() => db.transactions.toArray());

	// Return filtered list (cache.getAll() filters split parents)
	return cache.getAll();
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
	// Exclude split parent transactions (they've been replaced by children)
	const transactions = await db.transactions
		.where('categoryId')
		.equals(categoryId)
		.filter((t) => {
			const date = new Date(t.date);
			return date >= start && date <= end && !t.isSplitParent;
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
