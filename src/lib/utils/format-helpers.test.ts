import { describe, it, expect } from 'vitest';
import {
	formatCurrency,
	formatCurrencyWhole,
	formatPercentage,
	calculateSplitShares
} from './format-helpers';

describe('format-helpers', () => {
	describe('formatCurrency', () => {
		it('formats positive amounts with dollar sign', () => {
			expect(formatCurrency(100)).toBe('$100.00');
		});

		it('formats amounts with cents', () => {
			expect(formatCurrency(49.99)).toBe('$49.99');
		});

		it('formats zero', () => {
			expect(formatCurrency(0)).toBe('$0.00');
		});

		it('formats negative amounts', () => {
			expect(formatCurrency(-25.5)).toBe('-$25.50');
		});

		it('formats large amounts with commas', () => {
			expect(formatCurrency(1234567.89)).toBe('$1,234,567.89');
		});

		it('rounds to two decimal places', () => {
			expect(formatCurrency(10.999)).toBe('$11.00');
			expect(formatCurrency(10.994)).toBe('$10.99');
		});

		it('handles very small amounts', () => {
			expect(formatCurrency(0.01)).toBe('$0.01');
		});
	});

	describe('formatCurrencyWhole', () => {
		it('formats amounts without decimals', () => {
			expect(formatCurrencyWhole(100)).toBe('$100');
		});

		it('rounds to nearest whole number', () => {
			expect(formatCurrencyWhole(49.49)).toBe('$49');
			expect(formatCurrencyWhole(49.5)).toBe('$50');
			expect(formatCurrencyWhole(49.99)).toBe('$50');
		});

		it('formats zero', () => {
			expect(formatCurrencyWhole(0)).toBe('$0');
		});

		it('formats negative amounts', () => {
			expect(formatCurrencyWhole(-25.5)).toBe('-$26');
		});

		it('formats large amounts with commas', () => {
			expect(formatCurrencyWhole(1234567.89)).toBe('$1,234,568');
		});
	});

	describe('formatPercentage', () => {
		it('formats decimal as percentage', () => {
			expect(formatPercentage(0.5)).toBe('50%');
		});

		it('formats 100%', () => {
			expect(formatPercentage(1)).toBe('100%');
		});

		it('formats 0%', () => {
			expect(formatPercentage(0)).toBe('0%');
		});

		it('rounds to whole number by default', () => {
			expect(formatPercentage(0.333)).toBe('33%');
			expect(formatPercentage(0.666)).toBe('67%');
		});

		it('respects decimal places parameter', () => {
			expect(formatPercentage(0.333, 1)).toBe('33.3%');
			expect(formatPercentage(0.3333, 2)).toBe('33.33%');
		});

		it('handles values over 100%', () => {
			expect(formatPercentage(1.5)).toBe('150%');
		});
	});

	describe('calculateSplitShares', () => {
		describe('percentage split type', () => {
			it('calculates shares for 50/50 split', () => {
				const result = calculateSplitShares(100, 'percentage', 0.5);
				expect(result.partnerShare).toBe(50);
				expect(result.yourShare).toBe(50);
			});

			it('calculates shares for 70/30 split', () => {
				const result = calculateSplitShares(100, 'percentage', 0.7);
				expect(result.partnerShare).toBe(70);
				expect(result.yourShare).toBe(30);
			});

			it('handles 100% to partner', () => {
				const result = calculateSplitShares(200, 'percentage', 1);
				expect(result.partnerShare).toBe(200);
				expect(result.yourShare).toBe(0);
			});

			it('handles 0% to partner', () => {
				const result = calculateSplitShares(200, 'percentage', 0);
				expect(result.partnerShare).toBe(0);
				expect(result.yourShare).toBe(200);
			});

			it('clamps percentage above 1 to 1', () => {
				const result = calculateSplitShares(100, 'percentage', 1.5);
				expect(result.partnerShare).toBe(100);
				expect(result.yourShare).toBe(0);
				expect(result.wasClampedHigh).toBe(true);
			});

			it('clamps negative percentage to 0', () => {
				const result = calculateSplitShares(100, 'percentage', -0.5);
				expect(result.partnerShare).toBe(0);
				expect(result.yourShare).toBe(100);
				expect(result.wasClampedLow).toBe(true);
			});
		});

		describe('fixed split type', () => {
			it('calculates shares for fixed amount', () => {
				const result = calculateSplitShares(100, 'fixed', 30);
				expect(result.partnerShare).toBe(30);
				expect(result.yourShare).toBe(70);
			});

			it('handles partner paying full amount', () => {
				const result = calculateSplitShares(100, 'fixed', 100);
				expect(result.partnerShare).toBe(100);
				expect(result.yourShare).toBe(0);
			});

			it('handles partner paying zero', () => {
				const result = calculateSplitShares(100, 'fixed', 0);
				expect(result.partnerShare).toBe(0);
				expect(result.yourShare).toBe(100);
			});

			it('clamps fixed amount above total to total', () => {
				const result = calculateSplitShares(100, 'fixed', 150);
				expect(result.partnerShare).toBe(100);
				expect(result.yourShare).toBe(0);
				expect(result.wasClampedHigh).toBe(true);
			});

			it('clamps negative fixed amount to 0', () => {
				const result = calculateSplitShares(100, 'fixed', -50);
				expect(result.partnerShare).toBe(0);
				expect(result.yourShare).toBe(100);
				expect(result.wasClampedLow).toBe(true);
			});
		});

		describe('edge cases', () => {
			it('handles zero total amount', () => {
				const result = calculateSplitShares(0, 'percentage', 0.5);
				expect(result.partnerShare).toBe(0);
				expect(result.yourShare).toBe(0);
			});

			it('handles decimal amounts correctly with rounding', () => {
				// 99.99 * 0.5 = 49.995, which rounds to 50.00
				// yourShare = 99.99 - 50.00 = 49.99
				const result = calculateSplitShares(99.99, 'percentage', 0.5);
				expect(result.partnerShare).toBe(50);
				expect(result.yourShare).toBe(49.99);
			});
		});
	});
});
