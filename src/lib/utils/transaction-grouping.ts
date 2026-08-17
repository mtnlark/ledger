import { format, isToday, isYesterday, startOfDay } from 'date-fns';
import type { Transaction } from '$lib/db';
import { getUserAmount, roundCurrency, sumCurrency } from './currency';

/** A category allocation within a reconstructed purchase. */
export interface PurchaseAllocation {
	categoryId: number;
	amount: number;
}

/**
 * A complete purchase reconstructed from the transaction rows stored in the DB.
 * Standalone transactions have one source transaction and one allocation. Split
 * children with the same parentTransactionId share a purchase.
 */
export interface TransactionPurchase {
	/** Stable within this grouping operation; useful for keyed maps and sets. */
	key: string;
	parentTransactionId?: number;
	sourceTransactions: Transaction[];
	allocations: PurchaseAllocation[];
	merchant: string;
	date: Date;
	totalAmount: number;
	userAmount: number;
	partnerAmount: number;
	dominantCategoryId: number;
	isSplit: boolean;
	isShared: boolean;
}

/**
 * Reconstruct complete purchases from allocation-level transaction records.
 * Deleted rows and hidden split parents are always excluded. Ordering follows
 * the first visible appearance of a purchase in the input.
 */
export function groupTransactionsIntoPurchases(
	transactions: Transaction[]
): TransactionPurchase[] {
	const purchases: TransactionPurchase[] = [];
	const purchaseIndexByParent = new Map<number, number>();

	for (let inputIndex = 0; inputIndex < transactions.length; inputIndex++) {
		const transaction = transactions[inputIndex];
		if (transaction.isDeleted || transaction.isSplitParent) continue;

		const parentId = transaction.parentTransactionId;
		let purchaseIndex: number | undefined;
		if (parentId != null) {
			purchaseIndex = purchaseIndexByParent.get(parentId);
		}

		if (purchaseIndex === undefined) {
			purchaseIndex = purchases.length;
			if (parentId != null) purchaseIndexByParent.set(parentId, purchaseIndex);
			purchases.push({
				key: parentId != null
					? `parent:${parentId}`
					: `transaction:${transaction.id ?? inputIndex}`,
				parentTransactionId: parentId,
				sourceTransactions: [],
				allocations: [],
				merchant: transaction.merchant,
				date: new Date(transaction.date),
				totalAmount: 0,
				userAmount: 0,
				partnerAmount: 0,
				dominantCategoryId: transaction.categoryId,
				isSplit: parentId != null,
				isShared: transaction.isShared
			});
		}

		const purchase = purchases[purchaseIndex];
		purchase.sourceTransactions.push(transaction);
		purchase.allocations.push({
			categoryId: transaction.categoryId,
			amount: roundCurrency(transaction.amount)
		});
	}

	for (const purchase of purchases) {
		purchase.totalAmount = sumCurrency(purchase.sourceTransactions.map((t) => t.amount));
		purchase.userAmount = sumCurrency(purchase.sourceTransactions.map(getUserAmount));
		purchase.partnerAmount = sumCurrency(
			purchase.sourceTransactions.map((t) => t.partnerShare)
		);
		purchase.dominantCategoryId = purchase.allocations.reduce(
			(dominant, allocation) => allocation.amount > dominant.amount ? allocation : dominant,
			purchase.allocations[0]
		).categoryId;
		purchase.isShared = purchase.sourceTransactions.every((t) => t.isShared);
	}

	return purchases;
}

/**
 * Scale a category allocation template to a new total using integer cents.
 * Any rounding remainder is assigned to the largest original allocation.
 */
export function scalePurchaseAllocations(
	allocations: PurchaseAllocation[],
	newTotal: number
): PurchaseAllocation[] {
	if (allocations.length === 0) return [];

	const targetCents = Math.round(newTotal * 100);
	const originalCents = allocations.map((allocation) => Math.round(allocation.amount * 100));
	const originalTotalCents = originalCents.reduce((sum, cents) => sum + cents, 0);
	const largestIndex = originalCents.reduce(
		(maxIndex, cents, index) => cents > originalCents[maxIndex] ? index : maxIndex,
		0
	);

	if (originalTotalCents === 0) {
		return allocations.map((allocation, index) => ({
			...allocation,
			amount: index === largestIndex ? targetCents / 100 : 0
		}));
	}

	const scaledCents = originalCents.map((cents) =>
		Math.round((cents * targetCents) / originalTotalCents)
	);
	const remainder = targetCents - scaledCents.reduce((sum, cents) => sum + cents, 0);
	scaledCents[largestIndex] += remainder;

	return allocations.map((allocation, index) => ({
		...allocation,
		amount: scaledCents[index] / 100
	}));
}

/**
 * Represents a group of transactions for a single date
 */
export interface DateGroup {
	dateKey: string;
	label: string;
	transactions: Transaction[];
}

/**
 * Sort transactions by date in descending order (newest first)
 * Creates a new array without mutating the original
 */
export function sortTransactionsByDate(transactions: Transaction[]): Transaction[] {
	return [...transactions].sort(
		(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
	);
}

/**
 * Group transactions by date (normalized to start of day)
 * @returns Map where key is date string (yyyy-MM-dd) and value is array of transactions
 */
export function groupTransactionsByDate(transactions: Transaction[]): Map<string, Transaction[]> {
	const groups = new Map<string, Transaction[]>();

	for (const tx of transactions) {
		const date = startOfDay(new Date(tx.date));
		const dateKey = format(date, 'yyyy-MM-dd');
		const existing = groups.get(dateKey) || [];
		groups.set(dateKey, [...existing, tx]);
	}

	return groups;
}

/**
 * Format a date key string into a human-readable label
 * Returns "Today", "Yesterday", or formatted date like "Friday, January 10"
 */
export function formatDateGroupLabel(dateKey: string): string {
	// Parse date string as local time, not UTC
	// (new Date("yyyy-MM-dd") interprets as UTC, causing off-by-one day issues)
	const [year, month, day] = dateKey.split('-').map(Number);
	const date = new Date(year, month - 1, day);

	if (isToday(date)) {
		return 'Today';
	}
	if (isYesterday(date)) {
		return 'Yesterday';
	}
	return format(date, 'EEEE, MMMM d');
}

/**
 * Sort and group transactions by date for display
 * @returns Array of DateGroups sorted by date (newest first)
 */
export function createDateGroups(transactions: Transaction[]): DateGroup[] {
	// Sort transactions by date (newest first)
	const sorted = sortTransactionsByDate(transactions);

	// Group by date
	const groups = groupTransactionsByDate(sorted);

	// Convert to array with labels
	const result: DateGroup[] = [];
	for (const [dateKey, txs] of groups) {
		result.push({
			dateKey,
			label: formatDateGroupLabel(dateKey),
			transactions: txs
		});
	}

	return result;
}

/**
 * A standalone transaction row in the list.
 */
export interface SingleRow {
	type: 'single';
	transaction: Transaction;
	date: Date;
}

/**
 * A collapsed group of split children that share a parentTransactionId.
 * Aggregates (total, youTotal, etc.) are reconstructed from the visible
 * children — the hidden isSplitParent record is not needed.
 */
export interface SplitGroupRow {
	type: 'split';
	parentId: number;
	merchant: string;
	date: Date;
	children: Transaction[];
	total: number;
	/** Category of the largest child — drives the summary row's icon/color. */
	dominantCategoryId: number;
	allShared: boolean;
	anyPending: boolean;
	youTotal: number;
	partnerTotal: number;
}

export type ListRow = SingleRow | SplitGroupRow;

/**
 * Collapse split children (those carrying parentTransactionId) into a single
 * group row while leaving standalone transactions as individual rows.
 *
 * Order follows first appearance — a split group takes the position of its
 * first child, even if its other children are non-adjacent. Groups left with
 * fewer than two visible children (e.g. after a category filter) are demoted
 * back to a single row, since a "group of one" reads worse than a plain row.
 */
export function buildListRows(transactions: Transaction[]): ListRow[] {
	const rows: ListRow[] = [];
	const groupIndexByParent = new Map<number, number>();

	for (const tx of transactions) {
		const parentId = tx.parentTransactionId;
		if (parentId != null) {
			const existingIdx = groupIndexByParent.get(parentId);
			if (existingIdx === undefined) {
				groupIndexByParent.set(parentId, rows.length);
				rows.push({
					type: 'split',
					parentId,
					merchant: tx.merchant,
					date: new Date(tx.date),
					children: [tx],
					total: 0,
					dominantCategoryId: tx.categoryId,
					allShared: true,
					anyPending: false,
					youTotal: 0,
					partnerTotal: 0
				});
			} else {
				(rows[existingIdx] as SplitGroupRow).children.push(tx);
			}
		} else {
			rows.push({ type: 'single', transaction: tx, date: new Date(tx.date) });
		}
	}

	return rows.map((row) => {
		if (row.type !== 'split') return row;
		if (row.children.length < 2) {
			return { type: 'single', transaction: row.children[0], date: row.date };
		}
		const { children } = row;
		const dominant = children.reduce((max, c) => (c.amount > max.amount ? c : max), children[0]);
		return {
			...row,
			total: sumCurrency(children.map((c) => c.amount)),
			youTotal: sumCurrency(children.map((c) => c.amount - c.partnerShare)),
			partnerTotal: sumCurrency(children.map((c) => c.partnerShare)),
			allShared: children.every((c) => c.isShared),
			anyPending: children.some((c) => c.isShared && !c.isSettled),
			dominantCategoryId: dominant.categoryId
		};
	});
}

/**
 * A date-labelled group of list rows (single or split).
 */
export interface ListRowGroup {
	dateKey: string;
	label: string;
	rows: ListRow[];
}

/**
 * Group already-built list rows by date (newest first), mirroring
 * createDateGroups but preserving split-group rows as single units.
 * Expects rows in display order (caller sorts the source transactions first).
 */
export function groupRowsByDate(rows: ListRow[]): ListRowGroup[] {
	const groups = new Map<string, ListRow[]>();
	for (const row of rows) {
		const dateKey = format(startOfDay(row.date), 'yyyy-MM-dd');
		const existing = groups.get(dateKey);
		if (existing) {
			existing.push(row);
		} else {
			groups.set(dateKey, [row]);
		}
	}

	const result: ListRowGroup[] = [];
	for (const [dateKey, rs] of groups) {
		result.push({ dateKey, label: formatDateGroupLabel(dateKey), rows: rs });
	}
	return result;
}
