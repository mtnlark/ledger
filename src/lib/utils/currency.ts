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

// ============================================================================
// Percentage Utilities
// ============================================================================

/**
 * Calculate a percentage value.
 *
 * @param part - The numerator (portion of the whole)
 * @param whole - The denominator (total)
 * @param round - Whether to round to nearest integer (default: false)
 * @returns Percentage as a number (0-100+), or 0 if whole is 0
 *
 * @example
 * calculatePercent(25, 100) // 25
 * calculatePercent(1, 3) // 33.33333...
 * calculatePercent(1, 3, true) // 33
 * calculatePercent(50, 0) // 0 (safe division)
 */
export function calculatePercent(part: number, whole: number, round = false): number {
	if (whole === 0) return 0;
	const percent = (part / whole) * 100;
	return round ? Math.round(percent) : percent;
}

/**
 * Check if a percentage exceeds a threshold.
 * Uses raw calculation for comparison to avoid rounding errors at boundaries.
 *
 * @param part - The numerator
 * @param whole - The denominator
 * @param threshold - The threshold percentage to compare against
 * @returns True if (part/whole)*100 > threshold
 *
 * @example
 * percentExceeds(81, 100, 80) // true (81% > 80%)
 * percentExceeds(80, 100, 80) // false (80% is not > 80%)
 * percentExceeds(50, 0, 80) // false (safe division)
 */
export function percentExceeds(part: number, whole: number, threshold: number): boolean {
	if (whole <= 0) return false;
	return (part / whole) * 100 > threshold;
}

/**
 * Check if a percentage meets or exceeds a threshold.
 * Uses raw calculation for comparison to avoid rounding errors at boundaries.
 *
 * @param part - The numerator
 * @param whole - The denominator
 * @param threshold - The threshold percentage to compare against
 * @returns True if (part/whole)*100 >= threshold
 *
 * @example
 * percentMeetsOrExceeds(80, 100, 80) // true (80% >= 80%)
 * percentMeetsOrExceeds(79, 100, 80) // false (79% < 80%)
 */
export function percentMeetsOrExceeds(part: number, whole: number, threshold: number): boolean {
	if (whole <= 0) return false;
	return (part / whole) * 100 >= threshold;
}
