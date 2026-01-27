/**
 * Shared form validation utilities for transaction forms
 */

// Re-export calculateSplitShares from format-helpers (canonical implementation with clamping flags)
export { calculateSplitShares, type SplitSharesResult } from './format-helpers';

/**
 * Validates a split value for shared expenses
 * @param value - The split value to validate
 * @param splitType - Whether it's 'percentage' or 'fixed'
 * @param maxAmount - Maximum amount (for fixed split validation)
 * @returns Object with isValid flag and clamped value
 */
export function validateSplitValue(
	value: number,
	splitType: 'percentage' | 'fixed',
	maxAmount: number
): { isValid: boolean; clampedValue: number } {
	if (splitType === 'percentage') {
		const clamped = Math.min(Math.max(value, 0), 1);
		return {
			isValid: value >= 0 && value <= 1,
			clampedValue: clamped
		};
	} else {
		const clamped = Math.min(Math.max(value, 0), maxAmount);
		return {
			isValid: value >= 0 && value <= maxAmount,
			clampedValue: clamped
		};
	}
}

/**
 * Checks if a date string represents a future date
 * @param dateStr - Date string in YYYY-MM-DD format
 * @returns true if the date is in the future
 */
export function isFutureDateStr(dateStr: string): boolean {
	if (!dateStr) return false;

	const [year, month, day] = dateStr.split('-').map(Number);
	const selected = new Date(year, month - 1, day);
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	return selected > today;
}

/**
 * Validates a transaction amount string
 * @param amountStr - The amount string to validate
 * @returns Object with isValid flag and parsed numeric value
 */
export function validateAmount(amountStr: string): { isValid: boolean; value: number } {
	const cleaned = amountStr.replace(/[^0-9.]/g, '');
	const value = parseFloat(cleaned);

	return {
		isValid: !isNaN(value) && value > 0,
		value: isNaN(value) ? 0 : value
	};
}

/**
 * Cleans a number input string by removing non-numeric characters except decimal point
 * @param value - The input string to clean
 * @returns Cleaned string with only digits and decimal point
 */
export function cleanNumberInput(value: string): string {
	return value.replace(/[^0-9.]/g, '');
}
