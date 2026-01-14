import { format, isToday, isYesterday, startOfDay } from 'date-fns';
import type { Transaction } from '$lib/db';

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
