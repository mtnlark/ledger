import { describe, it, expect } from 'vitest';
import type { Category } from '$lib/db';
import {
	getCategoryName,
	getCategoryIcon,
	getCategoryColor,
	getCategoryDisplay,
	createCategoryHelpers
} from './category-helpers';

// Mock category data for testing
const mockCategories: Category[] = [
	{ id: 1, name: 'Groceries', icon: '🛒', color: '#5B8C5A', isActive: true, sortOrder: 1, isEssential: true },
	{ id: 2, name: 'Gas', icon: '⛽', color: '#D4915D', isActive: true, sortOrder: 2, isEssential: true },
	{ id: 3, name: 'Restaurants', icon: '🍽️', color: '#C45D3A', isActive: true, sortOrder: 3, isEssential: false },
	{ id: 4, name: 'No Icon', color: '#123456', isActive: true, sortOrder: 4, isEssential: false },
	{ id: 5, name: 'No Color', icon: '❓', isActive: true, sortOrder: 5, isEssential: false }
] as Category[];

describe('Category Helpers', () => {
	describe('getCategoryName', () => {
		it('returns category name for valid ID', () => {
			expect(getCategoryName(mockCategories, 1)).toBe('Groceries');
			expect(getCategoryName(mockCategories, 2)).toBe('Gas');
			expect(getCategoryName(mockCategories, 3)).toBe('Restaurants');
		});

		it('returns "Unknown" for non-existent ID', () => {
			expect(getCategoryName(mockCategories, 999)).toBe('Unknown');
		});

		it('returns "Unknown" when categories array is empty', () => {
			expect(getCategoryName([], 1)).toBe('Unknown');
		});
	});

	describe('getCategoryIcon', () => {
		it('returns category icon for valid ID', () => {
			expect(getCategoryIcon(mockCategories, 1)).toBe('🛒');
			expect(getCategoryIcon(mockCategories, 2)).toBe('⛽');
		});

		it('returns default icon for non-existent ID', () => {
			expect(getCategoryIcon(mockCategories, 999)).toBe('📝');
		});

		it('returns default icon when category has no icon', () => {
			expect(getCategoryIcon(mockCategories, 4)).toBe('📝');
		});
	});

	describe('getCategoryColor', () => {
		it('returns category color for valid ID', () => {
			expect(getCategoryColor(mockCategories, 1)).toBe('#5B8C5A');
			expect(getCategoryColor(mockCategories, 2)).toBe('#D4915D');
		});

		it('returns default color for non-existent ID', () => {
			expect(getCategoryColor(mockCategories, 999)).toBe('#8A847C');
		});

		it('returns default color when category has no color', () => {
			expect(getCategoryColor(mockCategories, 5)).toBe('#8A847C');
		});
	});

	describe('getCategoryDisplay', () => {
		it('returns all display properties for valid ID', () => {
			const display = getCategoryDisplay(mockCategories, 1);

			expect(display.name).toBe('Groceries');
			expect(display.icon).toBe('🛒');
			expect(display.color).toBe('#5B8C5A');
		});

		it('returns defaults for non-existent ID', () => {
			const display = getCategoryDisplay(mockCategories, 999);

			expect(display.name).toBe('Unknown');
			expect(display.icon).toBe('📝');
			expect(display.color).toBe('#8A847C');
		});

		it('returns mixed defaults when some properties missing', () => {
			const display = getCategoryDisplay(mockCategories, 4); // No icon

			expect(display.name).toBe('No Icon');
			expect(display.icon).toBe('📝'); // Default
			expect(display.color).toBe('#123456');
		});
	});

	describe('createCategoryHelpers', () => {
		it('creates bound helper functions', () => {
			const helpers = createCategoryHelpers(mockCategories);

			expect(typeof helpers.getName).toBe('function');
			expect(typeof helpers.getIcon).toBe('function');
			expect(typeof helpers.getColor).toBe('function');
			expect(typeof helpers.getDisplay).toBe('function');
		});

		it('getName works without passing categories', () => {
			const helpers = createCategoryHelpers(mockCategories);

			expect(helpers.getName(1)).toBe('Groceries');
			expect(helpers.getName(2)).toBe('Gas');
			expect(helpers.getName(999)).toBe('Unknown');
		});

		it('getIcon works without passing categories', () => {
			const helpers = createCategoryHelpers(mockCategories);

			expect(helpers.getIcon(1)).toBe('🛒');
			expect(helpers.getIcon(999)).toBe('📝');
		});

		it('getColor works without passing categories', () => {
			const helpers = createCategoryHelpers(mockCategories);

			expect(helpers.getColor(1)).toBe('#5B8C5A');
			expect(helpers.getColor(999)).toBe('#8A847C');
		});

		it('getDisplay works without passing categories', () => {
			const helpers = createCategoryHelpers(mockCategories);
			const display = helpers.getDisplay(1);

			expect(display.name).toBe('Groceries');
			expect(display.icon).toBe('🛒');
			expect(display.color).toBe('#5B8C5A');
		});
	});
});
