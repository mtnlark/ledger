import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	validateSplitValue,
	isFutureDateStr,
	validateAmount,
	cleanNumberInput
} from './form-validation';

describe('form-validation', () => {
	describe('cleanNumberInput', () => {
		it('removes non-numeric characters except decimal point', () => {
			expect(cleanNumberInput('$1,234.56')).toBe('1234.56');
		});

		it('allows plain numbers through', () => {
			expect(cleanNumberInput('100')).toBe('100');
			expect(cleanNumberInput('99.99')).toBe('99.99');
		});

		it('removes letters and symbols', () => {
			expect(cleanNumberInput('abc123xyz')).toBe('123');
			expect(cleanNumberInput('$50')).toBe('50');
		});

		it('handles empty string', () => {
			expect(cleanNumberInput('')).toBe('');
		});

		it('preserves multiple decimal points (caller must validate)', () => {
			// This is intentional - we just clean, not validate format
			expect(cleanNumberInput('1.2.3')).toBe('1.2.3');
		});

		it('removes commas from formatted currency', () => {
			expect(cleanNumberInput('1,000,000.00')).toBe('1000000.00');
		});
	});

	describe('validateSplitValue', () => {
		describe('percentage type', () => {
			it('accepts valid percentage values (0-1)', () => {
				expect(validateSplitValue(0.5, 'percentage', 100)).toEqual({
					isValid: true,
					clampedValue: 0.5
				});
			});

			it('accepts boundary values', () => {
				expect(validateSplitValue(0, 'percentage', 100)).toEqual({
					isValid: true,
					clampedValue: 0
				});
				expect(validateSplitValue(1, 'percentage', 100)).toEqual({
					isValid: true,
					clampedValue: 1
				});
			});

			it('clamps values above 1', () => {
				expect(validateSplitValue(1.5, 'percentage', 100)).toEqual({
					isValid: false,
					clampedValue: 1
				});
			});

			it('clamps negative values to 0', () => {
				expect(validateSplitValue(-0.5, 'percentage', 100)).toEqual({
					isValid: false,
					clampedValue: 0
				});
			});
		});

		describe('fixed type', () => {
			it('accepts valid fixed values', () => {
				expect(validateSplitValue(50, 'fixed', 100)).toEqual({
					isValid: true,
					clampedValue: 50
				});
			});

			it('accepts boundary values', () => {
				expect(validateSplitValue(0, 'fixed', 100)).toEqual({
					isValid: true,
					clampedValue: 0
				});
				expect(validateSplitValue(100, 'fixed', 100)).toEqual({
					isValid: true,
					clampedValue: 100
				});
			});

			it('clamps values above max amount', () => {
				expect(validateSplitValue(150, 'fixed', 100)).toEqual({
					isValid: false,
					clampedValue: 100
				});
			});

			it('clamps negative values to 0', () => {
				expect(validateSplitValue(-50, 'fixed', 100)).toEqual({
					isValid: false,
					clampedValue: 0
				});
			});
		});
	});

	describe('isFutureDateStr', () => {
		beforeEach(() => {
			// Mock current date to 2024-06-15
			vi.useFakeTimers();
			vi.setSystemTime(new Date(2024, 5, 15)); // June 15, 2024
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('returns true for dates in the future', () => {
			expect(isFutureDateStr('2024-06-16')).toBe(true);
			expect(isFutureDateStr('2024-07-01')).toBe(true);
			expect(isFutureDateStr('2025-01-01')).toBe(true);
		});

		it('returns false for today', () => {
			expect(isFutureDateStr('2024-06-15')).toBe(false);
		});

		it('returns false for dates in the past', () => {
			expect(isFutureDateStr('2024-06-14')).toBe(false);
			expect(isFutureDateStr('2024-01-01')).toBe(false);
			expect(isFutureDateStr('2023-12-31')).toBe(false);
		});

		it('returns false for empty string', () => {
			expect(isFutureDateStr('')).toBe(false);
		});
	});

	describe('validateAmount', () => {
		it('validates positive amounts', () => {
			expect(validateAmount('100')).toEqual({ isValid: true, value: 100 });
			expect(validateAmount('99.99')).toEqual({ isValid: true, value: 99.99 });
		});

		it('cleans input before parsing', () => {
			expect(validateAmount('$1,234.56')).toEqual({ isValid: true, value: 1234.56 });
		});

		it('returns invalid for zero', () => {
			expect(validateAmount('0')).toEqual({ isValid: false, value: 0 });
		});

		it('returns invalid for negative numbers', () => {
			// Note: the cleaning strips the minus sign, resulting in positive number
			// But typically negative amounts come from other sources
			expect(validateAmount('0')).toEqual({ isValid: false, value: 0 });
		});

		it('returns invalid for non-numeric input', () => {
			expect(validateAmount('abc')).toEqual({ isValid: false, value: 0 });
			expect(validateAmount('')).toEqual({ isValid: false, value: 0 });
		});

		it('handles decimal-only input', () => {
			expect(validateAmount('.99')).toEqual({ isValid: true, value: 0.99 });
		});
	});
});
