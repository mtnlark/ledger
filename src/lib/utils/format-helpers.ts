import { roundCurrency } from './currency';

/**
 * Result of calculating split shares between user and partner
 */
export interface SplitSharesResult {
	partnerShare: number;
	yourShare: number;
	wasClampedLow?: boolean;
	wasClampedHigh?: boolean;
}

/**
 * Format a number as USD currency with 2 decimal places
 * @param value - The amount to format
 * @returns Formatted currency string (e.g., "$1,234.56")
 */
export function formatCurrency(value: number): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD'
	}).format(value);
}

/**
 * Format a number as USD currency without decimal places
 * @param value - The amount to format
 * @returns Formatted currency string (e.g., "$1,235")
 */
export function formatCurrencyWhole(value: number): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 0,
		maximumFractionDigits: 0
	}).format(value);
}

/**
 * Format a decimal as a percentage string
 * @param value - The decimal value (0.5 = 50%)
 * @param decimalPlaces - Number of decimal places (default: 0)
 * @returns Formatted percentage string (e.g., "50%")
 */
export function formatPercentage(value: number, decimalPlaces: number = 0): string {
	const percent = Math.round(value * 100 * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces);
	return `${percent}%`;
}

/**
 * Calculate partner and user shares for a shared expense.
 * Both shares are rounded to 2 decimal places to avoid floating-point issues.
 *
 * @param amount - Total transaction amount
 * @param splitType - 'percentage' or 'fixed'
 * @param splitValue - For percentage: 0-1, for fixed: dollar amount
 * @returns Object with partnerShare, yourShare, and clamping flags
 */
export function calculateSplitShares(
	amount: number,
	splitType: 'percentage' | 'fixed',
	splitValue: number
): SplitSharesResult {
	let partnerShare: number;
	let wasClampedLow = false;
	let wasClampedHigh = false;

	if (splitType === 'percentage') {
		// Clamp percentage between 0 and 1
		let validatedValue = splitValue;
		if (splitValue < 0) {
			validatedValue = 0;
			wasClampedLow = true;
		} else if (splitValue > 1) {
			validatedValue = 1;
			wasClampedHigh = true;
		}
		// Round to avoid floating-point precision issues (e.g., 100 * 0.333... = 33.33)
		partnerShare = roundCurrency(amount * validatedValue);
	} else {
		// Fixed: clamp between 0 and amount
		if (splitValue < 0) {
			partnerShare = 0;
			wasClampedLow = true;
		} else if (splitValue > amount) {
			partnerShare = amount;
			wasClampedHigh = true;
		} else {
			partnerShare = roundCurrency(splitValue);
		}
	}

	// Calculate yourShare from rounded partnerShare to ensure they sum correctly
	const yourShare = roundCurrency(amount - partnerShare);

	return {
		partnerShare,
		yourShare,
		...(wasClampedLow && { wasClampedLow }),
		...(wasClampedHigh && { wasClampedHigh })
	};
}
