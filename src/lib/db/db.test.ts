import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	db,
	calculatePartnerShare,
	getMonthKey,
	parseMonthKey,
	navigateMonth,
	initializeDatabase,
	DEFAULT_CATEGORIES,
	DEFAULT_SETTINGS
} from './index';

describe('Database Helper Functions', () => {
	describe('calculatePartnerShare', () => {
		it('calculates percentage split correctly', () => {
			// 50% of $100 = $50
			expect(calculatePartnerShare(100, 'percentage', 0.5)).toBe(50);
		});

		it('calculates percentage split with decimal amounts', () => {
			// 50% of $45.99 = $22.995, rounded to $23.00
			expect(calculatePartnerShare(45.99, 'percentage', 0.5)).toBe(23);
		});

		it('calculates different percentage splits', () => {
			// 30% of $100 = $30
			expect(calculatePartnerShare(100, 'percentage', 0.3)).toBe(30);
			// 75% of $80 = $60
			expect(calculatePartnerShare(80, 'percentage', 0.75)).toBe(60);
		});

		it('returns fixed amount directly', () => {
			// Fixed amount of $25 regardless of total
			expect(calculatePartnerShare(100, 'fixed', 25)).toBe(25);
			expect(calculatePartnerShare(50, 'fixed', 25)).toBe(25);
		});

		it('handles zero amounts', () => {
			expect(calculatePartnerShare(0, 'percentage', 0.5)).toBe(0);
			expect(calculatePartnerShare(100, 'fixed', 0)).toBe(0);
		});

		it('handles edge case percentages', () => {
			// 0% split
			expect(calculatePartnerShare(100, 'percentage', 0)).toBe(0);
			// 100% split
			expect(calculatePartnerShare(100, 'percentage', 1)).toBe(100);
		});
	});

	describe('getMonthKey', () => {
		it('formats date as YYYY-MM string', () => {
			// Use explicit local date to avoid timezone issues
			const date = new Date(2025, 11, 15); // Month is 0-indexed, so 11 = December
			expect(getMonthKey(date)).toBe('2025-12');
		});

		it('pads single-digit months with zero', () => {
			const january = new Date(2025, 0, 5); // January
			expect(getMonthKey(january)).toBe('2025-01');

			const september = new Date(2025, 8, 20); // September
			expect(getMonthKey(september)).toBe('2025-09');
		});

		it('handles year boundaries correctly', () => {
			const december = new Date(2025, 11, 31); // December 31
			expect(getMonthKey(december)).toBe('2025-12');

			const january = new Date(2026, 0, 1); // January 1
			expect(getMonthKey(january)).toBe('2026-01');
		});
	});

	describe('parseMonthKey', () => {
		it('parses month key to local date', () => {
			const date = parseMonthKey('2025-12');
			expect(date.getFullYear()).toBe(2025);
			expect(date.getMonth()).toBe(11); // December is month 11
			expect(date.getDate()).toBe(1);
		});

		it('handles January correctly', () => {
			const date = parseMonthKey('2026-01');
			expect(date.getFullYear()).toBe(2026);
			expect(date.getMonth()).toBe(0); // January is month 0
		});

		it('works with getMonthKey for round-trip', () => {
			const original = '2025-06';
			const date = parseMonthKey(original);
			expect(getMonthKey(date)).toBe(original);
		});
	});

	describe('navigateMonth', () => {
		it('goes to previous month', () => {
			expect(navigateMonth('2025-12', -1)).toBe('2025-11');
			expect(navigateMonth('2025-01', -1)).toBe('2024-12');
		});

		it('goes to next month', () => {
			expect(navigateMonth('2025-11', 1)).toBe('2025-12');
			expect(navigateMonth('2025-12', 1)).toBe('2026-01');
		});

		it('handles multiple month jumps', () => {
			expect(navigateMonth('2025-06', -3)).toBe('2025-03');
			expect(navigateMonth('2025-06', 3)).toBe('2025-09');
		});
	});

	describe('DEFAULT_CATEGORIES', () => {
		it('contains exactly 22 categories', () => {
			expect(DEFAULT_CATEGORIES).toHaveLength(22);
		});

		it('has unique category names', () => {
			const names = DEFAULT_CATEGORIES.map((c) => c.name);
			const uniqueNames = new Set(names);
			expect(uniqueNames.size).toBe(names.length);
		});

		it('includes expected categories from spreadsheet', () => {
			const names = DEFAULT_CATEGORIES.map((c) => c.name);
			expect(names).toContain('Groceries');
			expect(names).toContain('Gas');
			expect(names).toContain('Restaurants');
			expect(names).toContain('Fitness & wellness');
		});

		it('all categories have required fields', () => {
			DEFAULT_CATEGORIES.forEach((category) => {
				expect(category.name).toBeTruthy();
				expect(category.isActive).toBe(true);
				expect(typeof category.sortOrder).toBe('number');
			});
		});

		it('all categories have icons', () => {
			DEFAULT_CATEGORIES.forEach((category) => {
				expect(category.icon).toBeTruthy();
			});
		});

		it('all categories have colors', () => {
			DEFAULT_CATEGORIES.forEach((category) => {
				expect(category.color).toMatch(/^#[0-9a-f]{6}$/i);
			});
		});
	});

	describe('DEFAULT_SETTINGS', () => {
		it('has correct partner name', () => {
			expect(DEFAULT_SETTINGS.partnerName).toBe('Partner');
		});

		it('has 50% default split', () => {
			expect(DEFAULT_SETTINGS.defaultSplitType).toBe('percentage');
			expect(DEFAULT_SETTINGS.defaultSplitValue).toBe(0.5);
		});

		it('has USD currency', () => {
			expect(DEFAULT_SETTINGS.currency).toBe('USD');
		});

		it('has system theme default', () => {
			expect(DEFAULT_SETTINGS.theme).toBe('system');
		});

		it('has singleton id of 1', () => {
			expect(DEFAULT_SETTINGS.id).toBe(1);
		});
	});
});

describe('Database Initialization', () => {
	beforeEach(async () => {
		// Clear database before each test
		await db.delete();
		await db.open();
	});

	afterEach(async () => {
		await db.delete();
	});

	it('seeds categories on first initialization', async () => {
		expect(await db.categories.count()).toBe(0);

		await initializeDatabase();

		expect(await db.categories.count()).toBe(22);
	});

	it('seeds settings on first initialization', async () => {
		expect(await db.settings.count()).toBe(0);

		await initializeDatabase();

		const settings = await db.settings.get(1);
		expect(settings).toBeDefined();
		expect(settings?.partnerName).toBe('Partner');
	});

	it('does not duplicate categories on multiple initializations', async () => {
		await initializeDatabase();
		await initializeDatabase();
		await initializeDatabase();

		expect(await db.categories.count()).toBe(22);
	});

	it('does not duplicate settings on multiple initializations', async () => {
		await initializeDatabase();
		await initializeDatabase();

		expect(await db.settings.count()).toBe(1);
	});
});
