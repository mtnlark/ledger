import { config } from '$lib/config';

/**
 * Parse a stored date value (from JSON deserialization) to a local Date.
 * Transaction dates represent calendar dates, not precise instants.
 * Extracts YYYY-MM-DD from the ISO string to avoid timezone shift
 * where UTC midnight becomes the previous day in western timezones.
 */
export function parseStoredDate(value: string | Date): Date {
	if (typeof value === 'string') {
		const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
		if (match) {
			return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
		}
	}
	// Fallback: if already a Date object, normalize to local midnight
	const d = value instanceof Date ? value : new Date(value);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Parse an ISO date string (YYYY-MM-DD) to a local Date
 * Used for HTML date input values which are always in ISO format
 * Avoids UTC timezone issues that occur with new Date('YYYY-MM-DD')
 */
export function parseLocalDate(dateStr: string): Date {
	const [year, month, day] = dateStr.split('-').map(Number);
	return new Date(year, month - 1, day);
}

/**
 * Parse a date string in various formats to a local Date
 * Handles: "2026-01-01", "1/1/2026", "01/01/2026"
 * Returns null if parsing fails
 */
export function parseDateString(dateStr: string): Date | null {
	if (!dateStr || typeof dateStr !== 'string') {
		return null;
	}

	const trimmed = dateStr.trim();

	// Try ISO format first (YYYY-MM-DD)
	const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
	if (isoMatch) {
		const [, year, month, day] = isoMatch;
		return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
	}

	// Try US format (M/D/YYYY or MM/DD/YYYY)
	const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
	if (usMatch) {
		let [, month, day, year] = usMatch;
		// Handle 2-digit years
		let yearNum = parseInt(year);
		if (yearNum < 100) {
			yearNum += yearNum < config.date.twoDigitYearCutoff ? 2000 : 1900;
		}
		return new Date(yearNum, parseInt(month) - 1, parseInt(day));
	}

	return null;
}

/**
 * Convert Excel serial date number to a local Date
 * Excel's epoch is Dec 30, 1899
 * Uses date arithmetic to avoid timezone issues
 */
export function excelDateToJS(excelDate: number): Date {
	const days = Math.floor(excelDate);
	return new Date(1899, 11, 30 + days);
}

/**
 * Format a Date to ISO date string (YYYY-MM-DD) for HTML date inputs
 */
export function formatDateForInput(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * Get start and end dates for a month given a month key (YYYY-MM)
 * Returns dates in local timezone
 */
export function getMonthDateRange(monthKey: string): { start: Date; end: Date } {
	const [year, month] = monthKey.split('-').map(Number);
	const start = new Date(year, month - 1, 1); // First day at 00:00:00
	const end = new Date(year, month, 0, 23, 59, 59, 999); // Last day at 23:59:59.999
	return { start, end };
}
