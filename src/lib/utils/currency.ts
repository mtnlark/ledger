/**
 * Currency utility functions for consistent handling of monetary values.
 *
 * These utilities ensure consistent rounding and comparison of currency values
 * throughout the application, avoiding floating-point precision issues.
 */

/**
 * Epsilon for currency comparisons (half a cent).
 * Use this for tolerance-based equality checks.
 */
export const CURRENCY_EPSILON = 0.005;

/**
 * Round a value to 2 decimal places (cents).
 * Use this for all currency calculations to ensure consistent precision.
 *
 * @param value - The value to round
 * @returns Value rounded to 2 decimal places
 *
 * @example
 * roundCurrency(10.005) // 10.01
 * roundCurrency(10.004) // 10.00
 * roundCurrency(33.333333) // 33.33
 */
export function roundCurrency(value: number): number {
	return Math.round(value * 100) / 100;
}

/**
 * Compare two currency values for equality with tolerance.
 * Accounts for floating-point precision issues.
 *
 * @param a - First value
 * @param b - Second value
 * @returns True if values are effectively equal
 *
 * @example
 * currencyEquals(10.00, 10.001) // true
 * currencyEquals(10.00, 10.01) // false
 */
export function currencyEquals(a: number, b: number): boolean {
	return Math.abs(a - b) < CURRENCY_EPSILON;
}

/**
 * Check if a currency value is effectively zero.
 *
 * @param value - The value to check
 * @returns True if value is within epsilon of zero
 *
 * @example
 * isZeroCurrency(0.001) // true
 * isZeroCurrency(0.01) // false
 */
export function isZeroCurrency(value: number): boolean {
	return Math.abs(value) < CURRENCY_EPSILON;
}

/**
 * Sum an array of currency values with final rounding.
 * Prevents accumulated floating-point errors from many additions.
 *
 * @param values - Array of currency values to sum
 * @returns Sum rounded to 2 decimal places
 *
 * @example
 * sumCurrency([10.01, 10.02, 10.03]) // 30.06
 * sumCurrency([0.1, 0.2]) // 0.30 (not 0.30000000000000004)
 */
export function sumCurrency(values: number[]): number {
	return roundCurrency(values.reduce((sum, v) => sum + v, 0));
}

/**
 * Check if a split remainder is valid (effectively zero).
 * Used for validating that split transactions add up to the total.
 *
 * @param remaining - The remaining amount after splits
 * @returns True if remaining is effectively zero
 */
export function isSplitBalanced(remaining: number): boolean {
	return isZeroCurrency(remaining);
}
