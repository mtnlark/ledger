import { describe, it, expect } from 'vitest';
import { normalizeMerchant } from './string-helpers';

describe('String Helpers', () => {
	describe('normalizeMerchant', () => {
		it('converts to lowercase', () => {
			expect(normalizeMerchant('AMAZON')).toBe('amazon');
			expect(normalizeMerchant('Whole Foods')).toBe('whole foods');
			expect(normalizeMerchant('MOM\'s Organic')).toBe('mom\'s organic');
		});

		it('trims whitespace', () => {
			expect(normalizeMerchant('  Amazon  ')).toBe('amazon');
			expect(normalizeMerchant('\tShell\n')).toBe('shell');
		});

		it('handles already normalized strings', () => {
			expect(normalizeMerchant('amazon')).toBe('amazon');
		});

		it('handles empty string', () => {
			expect(normalizeMerchant('')).toBe('');
		});

		it('handles strings with special characters', () => {
			expect(normalizeMerchant("Trader Joe's")).toBe("trader joe's");
			expect(normalizeMerchant('7-Eleven')).toBe('7-eleven');
			expect(normalizeMerchant('Chick-fil-A')).toBe('chick-fil-a');
		});

		it('preserves internal whitespace', () => {
			expect(normalizeMerchant('Whole Foods Market')).toBe('whole foods market');
		});

		it('handles unicode characters', () => {
			expect(normalizeMerchant('Café')).toBe('café');
		});
	});
});
