import type { Category } from '$lib/db';

// Default values when category is not found
const DEFAULT_ICON = '📝';
const DEFAULT_COLOR = '#8A847C';
const DEFAULT_NAME = 'Unknown';

/**
 * Get category name by ID
 */
export function getCategoryName(categories: Category[], categoryId: number): string {
	const category = categories.find((c) => c.id === categoryId);
	return category?.name ?? DEFAULT_NAME;
}

/**
 * Get category icon by ID
 */
export function getCategoryIcon(categories: Category[], categoryId: number): string {
	const category = categories.find((c) => c.id === categoryId);
	return category?.icon ?? DEFAULT_ICON;
}

/**
 * Get category color by ID
 */
export function getCategoryColor(categories: Category[], categoryId: number): string {
	const category = categories.find((c) => c.id === categoryId);
	return category?.color ?? DEFAULT_COLOR;
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
		name: category?.name ?? DEFAULT_NAME,
		icon: category?.icon ?? DEFAULT_ICON,
		color: category?.color ?? DEFAULT_COLOR
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
