import { describe, it, expect } from 'vitest';
import {
	parseLocalDate,
	parseDateString,
	excelDateToJS,
	formatDateForInput,
	getMonthDateRange
} from './date-helpers';

describe('Date Helpers', () => {
	describe('parseLocalDate', () => {
		it('parses ISO date string to local date', () => {
			const date = parseLocalDate('2025-12-15');
			expect(date.getFullYear()).toBe(2025);
			expect(date.getMonth()).toBe(11); // December is month 11
			expect(date.getDate()).toBe(15);
		});

		it('handles January correctly (month boundary)', () => {
			const date = parseLocalDate('2026-01-01');
			expect(date.getFullYear()).toBe(2026);
			expect(date.getMonth()).toBe(0); // January is month 0
			expect(date.getDate()).toBe(1);
		});

		it('handles single-digit months and days', () => {
			const date = parseLocalDate('2025-03-05');
			expect(date.getMonth()).toBe(2); // March
			expect(date.getDate()).toBe(5);
		});

		it('avoids UTC timezone issues', () => {
			// This tests that we don't get shifted to previous day
			// which happens with new Date('2025-01-01') in negative UTC offsets
			const date = parseLocalDate('2025-01-01');
			expect(date.getDate()).toBe(1); // Should always be 1, not 31
		});
	});

	describe('parseDateString', () => {
		it('parses ISO format (YYYY-MM-DD)', () => {
			const date = parseDateString('2025-12-15');
			expect(date).not.toBeNull();
			expect(date?.getFullYear()).toBe(2025);
			expect(date?.getMonth()).toBe(11);
			expect(date?.getDate()).toBe(15);
		});

		it('parses US format with single digits (M/D/YYYY)', () => {
			const date = parseDateString('1/5/2026');
			expect(date).not.toBeNull();
			expect(date?.getFullYear()).toBe(2026);
			expect(date?.getMonth()).toBe(0); // January
			expect(date?.getDate()).toBe(5);
		});

		it('parses US format with double digits (MM/DD/YYYY)', () => {
			const date = parseDateString('12/25/2025');
			expect(date).not.toBeNull();
			expect(date?.getFullYear()).toBe(2025);
			expect(date?.getMonth()).toBe(11);
			expect(date?.getDate()).toBe(25);
		});

		it('handles 2-digit year in 2000s', () => {
			const date = parseDateString('1/15/25');
			expect(date).not.toBeNull();
			expect(date?.getFullYear()).toBe(2025);
		});

		it('handles 2-digit year in 1900s', () => {
			const date = parseDateString('1/15/99');
			expect(date).not.toBeNull();
			expect(date?.getFullYear()).toBe(1999);
		});

		it('returns null for empty string', () => {
			expect(parseDateString('')).toBeNull();
		});

		it('returns null for invalid input', () => {
			expect(parseDateString('not a date')).toBeNull();
		});

		it('returns null for null/undefined', () => {
			expect(parseDateString(null as unknown as string)).toBeNull();
			expect(parseDateString(undefined as unknown as string)).toBeNull();
		});

		it('trims whitespace', () => {
			const date = parseDateString('  2025-12-15  ');
			expect(date).not.toBeNull();
			expect(date?.getDate()).toBe(15);
		});
	});

	describe('excelDateToJS', () => {
		it('converts Excel date number to JS Date', () => {
			// Excel date 44197 = 2021-01-01
			// Excel epoch is Dec 30, 1899, so day 44197 lands on Jan 1, 2021
			const date = excelDateToJS(44197);
			expect(date.getFullYear()).toBe(2021);
			expect(date.getMonth()).toBe(0); // January
			expect(date.getDate()).toBe(1);
		});

		it('handles date 1 (Dec 31, 1899)', () => {
			const date = excelDateToJS(1);
			expect(date.getFullYear()).toBe(1899);
			expect(date.getMonth()).toBe(11);
			expect(date.getDate()).toBe(31);
		});

		it('handles recent dates', () => {
			// Excel date 45658 = 2025-01-01
			const date = excelDateToJS(45658);
			expect(date.getFullYear()).toBe(2025);
			expect(date.getMonth()).toBe(0); // January
			expect(date.getDate()).toBe(1);
		});
	});

	describe('formatDateForInput', () => {
		it('formats date as YYYY-MM-DD', () => {
			const date = new Date(2025, 11, 15); // Dec 15, 2025
			expect(formatDateForInput(date)).toBe('2025-12-15');
		});

		it('pads single-digit months with zero', () => {
			const date = new Date(2025, 2, 15); // March 15, 2025
			expect(formatDateForInput(date)).toBe('2025-03-15');
		});

		it('pads single-digit days with zero', () => {
			const date = new Date(2025, 11, 5); // Dec 5, 2025
			expect(formatDateForInput(date)).toBe('2025-12-05');
		});

		it('round-trips with parseLocalDate', () => {
			const original = new Date(2025, 5, 15);
			const formatted = formatDateForInput(original);
			const parsed = parseLocalDate(formatted);

			expect(parsed.getFullYear()).toBe(original.getFullYear());
			expect(parsed.getMonth()).toBe(original.getMonth());
			expect(parsed.getDate()).toBe(original.getDate());
		});
	});

	describe('getMonthDateRange', () => {
		it('returns start and end of month', () => {
			const { start, end } = getMonthDateRange('2025-12');

			expect(start.getFullYear()).toBe(2025);
			expect(start.getMonth()).toBe(11);
			expect(start.getDate()).toBe(1);
			expect(start.getHours()).toBe(0);
			expect(start.getMinutes()).toBe(0);

			expect(end.getFullYear()).toBe(2025);
			expect(end.getMonth()).toBe(11);
			expect(end.getDate()).toBe(31);
			expect(end.getHours()).toBe(23);
			expect(end.getMinutes()).toBe(59);
		});

		it('handles February correctly', () => {
			const { start, end } = getMonthDateRange('2025-02');

			expect(start.getDate()).toBe(1);
			expect(end.getDate()).toBe(28); // 2025 is not a leap year
		});

		it('handles February in leap year', () => {
			const { start, end } = getMonthDateRange('2024-02');

			expect(end.getDate()).toBe(29); // 2024 is a leap year
		});

		it('handles month with 30 days', () => {
			const { start, end } = getMonthDateRange('2025-11'); // November

			expect(end.getDate()).toBe(30);
		});

		it('handles January (year boundary)', () => {
			const { start, end } = getMonthDateRange('2026-01');

			expect(start.getFullYear()).toBe(2026);
			expect(start.getMonth()).toBe(0);
			expect(end.getFullYear()).toBe(2026);
			expect(end.getMonth()).toBe(0);
			expect(end.getDate()).toBe(31);
		});
	});
});
