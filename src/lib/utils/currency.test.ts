import { describe, it, expect } from 'vitest';
import {
	CURRENCY_EPSILON,
	roundCurrency,
	currencyEquals,
	isZeroCurrency,
	sumCurrency,
	isSplitBalanced,
	roundCoefficient,
	calculatePercent,
	percentExceeds,
	percentMeetsOrExceeds
} from './currency';

describe('CURRENCY_EPSILON', () => {
	it('should be half a cent', () => {
		expect(CURRENCY_EPSILON).toBe(0.005);
	});
});

describe('roundCurrency', () => {
	it('should round to 2 decimal places', () => {
		expect(roundCurrency(10.004)).toBe(10.0);
		expect(roundCurrency(10.005)).toBe(10.01);
		expect(roundCurrency(10.006)).toBe(10.01);
	});

	it('should handle typical transaction amounts', () => {
		expect(roundCurrency(33.333333)).toBe(33.33);
		expect(roundCurrency(66.666666)).toBe(66.67);
		expect(roundCurrency(100 / 3)).toBe(33.33);
	});

	it('should handle the classic 0.1 + 0.2 issue', () => {
		const result = 0.1 + 0.2; // 0.30000000000000004
		expect(roundCurrency(result)).toBe(0.3);
	});

	it('should preserve already-rounded values', () => {
		expect(roundCurrency(10.0)).toBe(10.0);
		expect(roundCurrency(10.01)).toBe(10.01);
		expect(roundCurrency(10.99)).toBe(10.99);
	});

	it('should handle negative values', () => {
		// Note: -10.005 * 100 = -1000.5000000000001 in floating point, which rounds to -1001
		expect(roundCurrency(-10.005)).toBe(-10.01);
		expect(roundCurrency(-10.006)).toBe(-10.01);
		expect(roundCurrency(-10.004)).toBe(-10.0);
	});

	it('should handle zero', () => {
		expect(roundCurrency(0)).toBe(0);
		expect(roundCurrency(0.001)).toBe(0);
		expect(roundCurrency(-0.001)).toBe(-0);
	});

	it('should handle large values', () => {
		expect(roundCurrency(123456.789)).toBe(123456.79);
		expect(roundCurrency(999999.994)).toBe(999999.99);
		expect(roundCurrency(999999.995)).toBe(1000000.0);
	});
});

describe('currencyEquals', () => {
	it('should return true for identical values', () => {
		expect(currencyEquals(10.0, 10.0)).toBe(true);
		expect(currencyEquals(0, 0)).toBe(true);
		expect(currencyEquals(-5.5, -5.5)).toBe(true);
	});

	it('should return true for values within epsilon', () => {
		expect(currencyEquals(10.0, 10.001)).toBe(true);
		expect(currencyEquals(10.0, 10.004)).toBe(true);
		expect(currencyEquals(10.001, 10.0)).toBe(true);
	});

	it('should return false for values outside epsilon', () => {
		expect(currencyEquals(10.0, 10.01)).toBe(false);
		expect(currencyEquals(10.0, 10.006)).toBe(false);
		expect(currencyEquals(10.0, 9.99)).toBe(false);
	});

	it('should handle floating-point precision issues', () => {
		// 0.1 + 0.2 = 0.30000000000000004
		expect(currencyEquals(0.1 + 0.2, 0.3)).toBe(true);
	});

	it('should handle negative values', () => {
		expect(currencyEquals(-10.0, -10.001)).toBe(true);
		expect(currencyEquals(-10.0, -10.01)).toBe(false);
	});
});

describe('isZeroCurrency', () => {
	it('should return true for zero', () => {
		expect(isZeroCurrency(0)).toBe(true);
	});

	it('should return true for values within epsilon of zero', () => {
		expect(isZeroCurrency(0.001)).toBe(true);
		expect(isZeroCurrency(0.004)).toBe(true);
		expect(isZeroCurrency(-0.001)).toBe(true);
		expect(isZeroCurrency(-0.004)).toBe(true);
	});

	it('should return false for values outside epsilon', () => {
		expect(isZeroCurrency(0.01)).toBe(false);
		expect(isZeroCurrency(0.006)).toBe(false);
		expect(isZeroCurrency(-0.01)).toBe(false);
	});

	it('should handle floating-point precision issues', () => {
		// Result of subtracting nearly equal values
		const result = 10.0 - 9.999;
		expect(isZeroCurrency(result)).toBe(true);
	});
});

describe('sumCurrency', () => {
	it('should sum an array of values', () => {
		expect(sumCurrency([10.01, 10.02, 10.03])).toBe(30.06);
	});

	it('should return 0 for empty array', () => {
		expect(sumCurrency([])).toBe(0);
	});

	it('should handle single value', () => {
		expect(sumCurrency([10.01])).toBe(10.01);
	});

	it('should round the final result', () => {
		// 0.1 + 0.2 + 0.3 might have precision issues
		expect(sumCurrency([0.1, 0.2, 0.3])).toBe(0.6);
	});

	it('should handle many small values', () => {
		// Sum of 100 values of 0.01 should be exactly 1.00
		const values = Array(100).fill(0.01);
		expect(sumCurrency(values)).toBe(1.0);
	});

	it('should handle realistic transaction scenario', () => {
		// Partner shares from multiple transactions
		const partnerShares = [12.34, 56.78, 90.12, 34.56, 78.90];
		const result = sumCurrency(partnerShares);
		expect(result).toBe(272.7);
	});

	it('should handle mixed positive and negative values', () => {
		expect(sumCurrency([100.0, -50.0, 25.0, -25.0])).toBe(50.0);
	});

	it('should prevent accumulated floating-point errors', () => {
		// Many thirds should accumulate errors without rounding
		const thirds = Array(9).fill(100 / 3); // 33.333... each
		const result = sumCurrency(thirds);
		// 9 * 33.333... = 300, but floating point would drift
		expect(result).toBe(300.0);
	});
});

describe('isSplitBalanced', () => {
	it('should return true for zero remaining', () => {
		expect(isSplitBalanced(0)).toBe(true);
	});

	it('should return true for tiny remaining amounts', () => {
		expect(isSplitBalanced(0.001)).toBe(true);
		expect(isSplitBalanced(-0.001)).toBe(true);
		expect(isSplitBalanced(0.004)).toBe(true);
	});

	it('should return false for significant remaining amounts', () => {
		expect(isSplitBalanced(0.01)).toBe(false);
		expect(isSplitBalanced(-0.01)).toBe(false);
		expect(isSplitBalanced(1.0)).toBe(false);
	});

	it('should work with realistic split scenarios', () => {
		// $100 split three ways: 33.33 + 33.33 + 33.34 = 100.00
		const total = 100;
		const splits = [33.33, 33.33, 33.34];
		const remaining = total - splits.reduce((a, b) => a + b, 0);
		expect(isSplitBalanced(remaining)).toBe(true);
	});

	it('should detect unbalanced splits', () => {
		// $100 with only $99 allocated
		const remaining = 100 - 99;
		expect(isSplitBalanced(remaining)).toBe(false);
	});
});

describe('roundCoefficient', () => {
	it('should round to 4 decimal places by default', () => {
		expect(roundCoefficient(0.05234)).toBe(0.0523);
		expect(roundCoefficient(0.05235)).toBe(0.0524);
		expect(roundCoefficient(0.12345678)).toBe(0.1235);
	});

	it('should support custom decimal places', () => {
		expect(roundCoefficient(0.12345678, 2)).toBe(0.12);
		expect(roundCoefficient(0.12345678, 6)).toBe(0.123457);
		expect(roundCoefficient(0.12345678, 0)).toBe(0);
	});

	it('should handle small coefficients correctly', () => {
		// Variance/coefficient of variation values
		expect(roundCoefficient(0.0001)).toBe(0.0001);
		expect(roundCoefficient(0.00001)).toBe(0);
		expect(roundCoefficient(0.00005)).toBe(0.0001);
	});

	it('should handle coefficients greater than 1', () => {
		expect(roundCoefficient(1.5234)).toBe(1.5234);
		expect(roundCoefficient(2.123456, 3)).toBe(2.123);
	});
});

describe('calculatePercent', () => {
	it('should calculate basic percentages', () => {
		expect(calculatePercent(25, 100)).toBe(25);
		expect(calculatePercent(50, 100)).toBe(50);
		expect(calculatePercent(100, 100)).toBe(100);
	});

	it('should handle fractions', () => {
		expect(calculatePercent(1, 3)).toBeCloseTo(33.333333, 5);
		expect(calculatePercent(2, 3)).toBeCloseTo(66.666666, 5);
	});

	it('should round when requested', () => {
		expect(calculatePercent(1, 3, true)).toBe(33);
		expect(calculatePercent(2, 3, true)).toBe(67);
		expect(calculatePercent(1, 6, true)).toBe(17); // 16.666... rounds to 17
	});

	it('should return 0 when whole is 0', () => {
		expect(calculatePercent(50, 0)).toBe(0);
		expect(calculatePercent(50, 0, true)).toBe(0);
	});

	it('should handle percentages over 100', () => {
		expect(calculatePercent(150, 100)).toBe(150);
		expect(calculatePercent(200, 100, true)).toBe(200);
	});

	it('should handle budget scenarios', () => {
		// $85.50 spent of $100 budget
		expect(calculatePercent(85.5, 100)).toBe(85.5);
		expect(calculatePercent(85.5, 100, true)).toBe(86);
	});
});

describe('percentExceeds', () => {
	it('should return true when percentage exceeds threshold', () => {
		expect(percentExceeds(81, 100, 80)).toBe(true);
		expect(percentExceeds(100, 100, 80)).toBe(true);
		expect(percentExceeds(160, 100, 80)).toBe(true);
	});

	it('should return false when percentage equals threshold', () => {
		expect(percentExceeds(80, 100, 80)).toBe(false);
	});

	it('should return false when percentage is below threshold', () => {
		expect(percentExceeds(79, 100, 80)).toBe(false);
		expect(percentExceeds(50, 100, 80)).toBe(false);
	});

	it('should return false when whole is 0', () => {
		expect(percentExceeds(50, 0, 80)).toBe(false);
	});

	it('should return false when whole is negative', () => {
		expect(percentExceeds(50, -100, 80)).toBe(false);
	});

	it('should handle boundary precision', () => {
		// 80.4% should not exceed 80% (but rounded would equal it)
		// This tests raw comparison without rounding issues
		expect(percentExceeds(80.4, 100, 80)).toBe(true);
		expect(percentExceeds(80.0, 100, 80)).toBe(false);
	});

	it('should work with realistic budget values', () => {
		// $17.65 spent of $18 budget = 98.06%
		expect(percentExceeds(17.65, 18, 98)).toBe(true);
		expect(percentExceeds(17.65, 18, 99)).toBe(false);
	});
});

describe('percentMeetsOrExceeds', () => {
	it('should return true when percentage equals threshold', () => {
		expect(percentMeetsOrExceeds(80, 100, 80)).toBe(true);
	});

	it('should return true when percentage exceeds threshold', () => {
		expect(percentMeetsOrExceeds(81, 100, 80)).toBe(true);
	});

	it('should return false when percentage is below threshold', () => {
		expect(percentMeetsOrExceeds(79, 100, 80)).toBe(false);
	});

	it('should return false when whole is 0', () => {
		expect(percentMeetsOrExceeds(50, 0, 80)).toBe(false);
	});

	it('should handle exact 100% budget usage', () => {
		// $100 spent of $100 budget
		expect(percentMeetsOrExceeds(100, 100, 100)).toBe(true);
	});

	it('should handle budget approaching threshold', () => {
		// $79.99 of $100 = 79.99%, threshold is 80%
		expect(percentMeetsOrExceeds(79.99, 100, 80)).toBe(false);
		// $80.00 of $100 = 80%, threshold is 80%
		expect(percentMeetsOrExceeds(80, 100, 80)).toBe(true);
	});
});

describe('real-world scenarios', () => {
	describe('shared expense splits', () => {
		it('should handle 50/50 split on odd cent amounts', () => {
			const total = 33.33;
			const partnerShare = roundCurrency(total * 0.5); // 16.67 (rounded from 16.665)
			const yourShare = roundCurrency(total - partnerShare); // 16.66
			// Note: 16.67 + 16.66 = 33.33 ✓
			expect(partnerShare + yourShare).toBe(total);
		});

		it('should handle percentage splits that create repeating decimals', () => {
			const total = 100;
			const partnerPercent = 1 / 3; // 33.333...%
			const partnerShare = roundCurrency(total * partnerPercent); // 33.33
			const yourShare = roundCurrency(total - partnerShare); // 66.67
			expect(partnerShare).toBe(33.33);
			expect(yourShare).toBe(66.67);
			expect(partnerShare + yourShare).toBe(100);
		});
	});

	describe('outstanding balance calculation', () => {
		it('should sum many partner shares correctly', () => {
			// Simulate 20 shared transactions with various amounts
			const partnerShares = [
				12.5, 33.33, 45.67, 8.99, 15.0, 22.22, 7.77, 100.0, 55.55, 11.11, 9.99, 44.44, 66.66,
				3.33, 77.77, 88.88, 19.99, 29.99, 39.99, 49.99
			];

			const balance = sumCurrency(partnerShares);

			// Verify it's a clean 2-decimal number
			expect(balance).toBe(roundCurrency(balance));
			expect(balance.toString()).toMatch(/^\d+(\.\d{1,2})?$/);
		});
	});

	describe('split transaction validation', () => {
		it('should validate a 3-way category split', () => {
			const total = 150.0;
			const splits = [50.0, 50.0, 50.0];
			const remaining = total - sumCurrency(splits);
			expect(isSplitBalanced(remaining)).toBe(true);
		});

		it('should validate uneven category splits', () => {
			const total = 100.0;
			const splits = [33.33, 33.33, 33.34];
			const remaining = total - sumCurrency(splits);
			expect(isSplitBalanced(remaining)).toBe(true);
		});

		it('should reject incomplete splits', () => {
			const total = 100.0;
			const splits = [30.0, 30.0, 30.0]; // Missing $10
			const remaining = total - sumCurrency(splits);
			expect(isSplitBalanced(remaining)).toBe(false);
		});
	});
});
