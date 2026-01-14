import type { Category } from '$lib/db';
import { config } from '$lib/config';

/**
 * Get category name by ID
 */
export function getCategoryName(categories: Category[], categoryId: number): string {
	const category = categories.find((c) => c.id === categoryId);
	return category?.name ?? config.category.defaultName;
}

/**
 * Get category icon by ID
 */
export function getCategoryIcon(categories: Category[], categoryId: number): string {
	const category = categories.find((c) => c.id === categoryId);
	return category?.icon ?? config.category.defaultIcon;
}

/**
 * Get category color by ID
 */
export function getCategoryColor(categories: Category[], categoryId: number): string {
	const category = categories.find((c) => c.id === categoryId);
	return category?.color ?? config.category.defaultColor;
}

/**
 * Get full category display info (name, icon, color) in one lookup
 * More efficient when you need multiple properties
 */
export function getCategoryDisplay(
	categories: Category[],
	categoryId: number
): { name: string; icon: string; color: string } {
	const category = categories.find((c) => c.id === categoryId);
	return {
		name: category?.name ?? config.category.defaultName,
		icon: category?.icon ?? config.category.defaultIcon,
		color: category?.color ?? config.category.defaultColor
	};
}

/**
 * Create bound helper functions for a specific categories array
 * Useful when you need to call these repeatedly in a component
 */
export function createCategoryHelpers(categories: Category[]) {
	return {
		getName: (categoryId: number) => getCategoryName(categories, categoryId),
		getIcon: (categoryId: number) => getCategoryIcon(categories, categoryId),
		getColor: (categoryId: number) => getCategoryColor(categories, categoryId),
		getDisplay: (categoryId: number) => getCategoryDisplay(categories, categoryId)
	};
}

/**
 * Interface for the optimized category lookup
 */
export interface CategoryLookup {
	/** Get the full category object (undefined if not found) */
	get: (categoryId: number) => Category | undefined;
	/** Get category name with O(1) lookup */
	getName: (categoryId: number) => string;
	/** Get category icon with O(1) lookup */
	getIcon: (categoryId: number) => string;
	/** Get category color with O(1) lookup */
	getColor: (categoryId: number) => string;
	/** Get all display properties with O(1) lookup */
	getDisplay: (categoryId: number) => { name: string; icon: string; color: string };
	/** Number of categories in the lookup */
	size: number;
}

/**
 * Create a Map-based category lookup for O(1) access.
 * Use this instead of the array-based helpers when you need
 * to look up multiple categories efficiently.
 *
 * @example
 * const lookup = createCategoryLookup(categories);
 * const name = lookup.getName(categoryId); // O(1) instead of O(n)
 */
export function createCategoryLookup(categories: Category[]): CategoryLookup {
	const map = new Map<number, Category>();

	for (const category of categories) {
		if (category.id !== undefined) {
			map.set(category.id, category);
		}
	}

	return {
		get: (categoryId: number) => map.get(categoryId),

		getName: (categoryId: number) => {
			const category = map.get(categoryId);
			return category?.name ?? config.category.defaultName;
		},

		getIcon: (categoryId: number) => {
			const category = map.get(categoryId);
			return category?.icon ?? config.category.defaultIcon;
		},

		getColor: (categoryId: number) => {
			const category = map.get(categoryId);
			return category?.color ?? config.category.defaultColor;
		},

		getDisplay: (categoryId: number) => {
			const category = map.get(categoryId);
			return {
				name: category?.name ?? config.category.defaultName,
				icon: category?.icon ?? config.category.defaultIcon,
				color: category?.color ?? config.category.defaultColor
			};
		},

		size: map.size
	};
}
