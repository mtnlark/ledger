import { describe, it, expect } from 'vitest';
import {
	validateAmount,
	validateMerchant,
	validateCategory,
	validateSplitValue,
	validateSplitLines,
	validateFutureDate,
	type SplitLine
} from './transaction-validation';

describe('transaction-validation', () => {
	describe('validateAmount', () => {
		it('returns valid for positive amount', () => {
			const result = validateAmount(100);
			expect(result.isValid).toBe(true);
			expect(result.error).toBeUndefined();
		});

		it('returns invalid for zero amount', () => {
			const result = validateAmount(0);
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Amount must be greater than 0');
		});

		it('returns invalid for negative amount', () => {
			const result = validateAmount(-50);
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Amount must be greater than 0');
		});

		it('handles very small positive amounts', () => {
			const result = validateAmount(0.01);
			expect(result.isValid).toBe(true);
		});
	});

	describe('validateMerchant', () => {
		it('returns valid for non-empty merchant', () => {
			const result = validateMerchant('Amazon');
			expect(result.isValid).toBe(true);
		});

		it('returns invalid for empty string', () => {
			const result = validateMerchant('');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Merchant is required');
		});

		it('returns invalid for whitespace-only string', () => {
			const result = validateMerchant('   ');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Merchant is required');
		});

		it('accepts merchant with surrounding whitespace (after trim)', () => {
			const result = validateMerchant('  Amazon  ');
			expect(result.isValid).toBe(true);
		});
	});

	describe('validateCategory', () => {
		it('returns valid for positive category ID', () => {
			const result = validateCategory(1);
			expect(result.isValid).toBe(true);
		});

		it('returns invalid for zero category ID', () => {
			const result = validateCategory(0);
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Category is required');
		});

		it('returns invalid for negative category ID', () => {
			const result = validateCategory(-1);
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Category is required');
		});
	});

	describe('validateSplitValue', () => {
		describe('percentage type', () => {
			it('returns valid for value between 0 and 1', () => {
				expect(validateSplitValue('percentage', 0.5, 100).isValid).toBe(true);
				expect(validateSplitValue('percentage', 0, 100).isValid).toBe(true);
				expect(validateSplitValue('percentage', 1, 100).isValid).toBe(true);
			});

			it('returns corrected value for value > 1', () => {
				const result = validateSplitValue('percentage', 1.5, 100);
				expect(result.isValid).toBe(false);
				expect(result.correctedValue).toBe(1);
			});

			it('returns corrected value for negative value', () => {
				const result = validateSplitValue('percentage', -0.5, 100);
				expect(result.isValid).toBe(false);
				expect(result.correctedValue).toBe(0);
			});
		});

		describe('fixed type', () => {
			it('returns valid for value between 0 and amount', () => {
				expect(validateSplitValue('fixed', 50, 100).isValid).toBe(true);
				expect(validateSplitValue('fixed', 0, 100).isValid).toBe(true);
				expect(validateSplitValue('fixed', 100, 100).isValid).toBe(true);
			});

			it('returns corrected value for value > amount', () => {
				const result = validateSplitValue('fixed', 150, 100);
				expect(result.isValid).toBe(false);
				expect(result.correctedValue).toBe(100);
			});

			it('returns corrected value for negative value', () => {
				const result = validateSplitValue('fixed', -50, 100);
				expect(result.isValid).toBe(false);
				expect(result.correctedValue).toBe(0);
			});
		});
	});

	describe('validateSplitLines', () => {
		it('returns valid when splits match amount exactly', () => {
			const splits: SplitLine[] = [
				{ categoryId: 1, amount: 60 },
				{ categoryId: 2, amount: 40 }
			];
			const result = validateSplitLines(splits, 100);
			expect(result.isValid).toBe(true);
			expect(result.total).toBe(100);
			expect(result.remaining).toBe(0);
		});

		it('returns invalid when fewer than 2 lines', () => {
			const splits: SplitLine[] = [{ categoryId: 1, amount: 100 }];
			const result = validateSplitLines(splits, 100);
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('At least 2 split lines are required');
		});

		it('returns invalid when total does not match', () => {
			const splits: SplitLine[] = [
				{ categoryId: 1, amount: 50 },
				{ categoryId: 2, amount: 30 }
			];
			const result = validateSplitLines(splits, 100);
			expect(result.isValid).toBe(false);
			expect(result.remaining).toBe(20);
		});

		it('returns invalid when category not selected', () => {
			const splits: SplitLine[] = [
				{ categoryId: 0, amount: 50 },
				{ categoryId: 2, amount: 50 }
			];
			const result = validateSplitLines(splits, 100);
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('All split lines must have a category selected');
		});

		it('returns invalid when amount is zero or negative', () => {
			const splits: SplitLine[] = [
				{ categoryId: 1, amount: 100 },
				{ categoryId: 2, amount: 0 }
			];
			const result = validateSplitLines(splits, 100);
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('All split lines must have an amount greater than 0');
		});

		it('allows small rounding differences', () => {
			const splits: SplitLine[] = [
				{ categoryId: 1, amount: 33.33 },
				{ categoryId: 2, amount: 33.33 },
				{ categoryId: 3, amount: 33.33 }
			];
			const result = validateSplitLines(splits, 99.99);
			expect(result.isValid).toBe(true);
		});
	});

	describe('validateFutureDate', () => {
		it('returns false for past date', () => {
			const pastDate = new Date();
			pastDate.setDate(pastDate.getDate() - 1);
			expect(validateFutureDate(pastDate)).toBe(false);
		});

		it('returns false for today', () => {
			const today = new Date();
			expect(validateFutureDate(today)).toBe(false);
		});

		it('returns true for future date', () => {
			const futureDate = new Date();
			futureDate.setDate(futureDate.getDate() + 1);
			expect(validateFutureDate(futureDate)).toBe(true);
		});
	});
});
