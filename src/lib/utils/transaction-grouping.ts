import { format, isToday, isYesterday, startOfDay } from 'date-fns';
import type { Transaction } from '$lib/db';
import { sumCurrency } from './currency';

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
