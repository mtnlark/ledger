import { getMonthKey } from '$lib/db';

const STORAGE_KEY = 'ledger-selected-month';

/**
 * Get the currently selected month from localStorage
 * Falls back to current month if not set or invalid
 */
export function getSelectedMonth(): string {
	if (typeof localStorage === 'undefined') {
		return getMonthKey(new Date());
	}

	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored && /^\d{4}-\d{2}$/.test(stored)) {
		return stored;
	}
	return getMonthKey(new Date());
}

/**
 * Save the selected month to localStorage
 */
export function setSelectedMonth(month: string): void {
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(STORAGE_KEY, month);
	}
}

/**
 * Check if the selected month is the current month
 */
export function isCurrentMonth(month: string): boolean {
	return month === getMonthKey(new Date());
}

/**
 * Get the current month key
 */
export function getCurrentMonth(): string {
	return getMonthKey(new Date());
}
