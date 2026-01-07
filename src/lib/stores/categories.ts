import { db, type Category } from '$lib/db';
import { liveQuery } from 'dexie';

// Reactive categories list
export const categories = liveQuery(() => db.categories.orderBy('sortOrder').toArray());

// Get all categories
export async function getAllCategories(): Promise<Category[]> {
	return db.categories.orderBy('sortOrder').toArray();
}

// Get active categories only
export async function getActiveCategories(): Promise<Category[]> {
	const all = await db.categories.orderBy('sortOrder').toArray();
	return all.filter((c) => c.isActive);
}

// Get category by ID
export async function getCategoryById(id: number): Promise<Category | undefined> {
	return db.categories.get(id);
}

// Get category by name
export async function getCategoryByName(name: string): Promise<Category | undefined> {
	return db.categories.where('name').equalsIgnoreCase(name).first();
}

// Add a new category
export async function addCategory(
	category: Omit<Category, 'id' | 'sortOrder'>
): Promise<number> {
	const maxOrder = await db.categories.orderBy('sortOrder').last();
	const sortOrder = (maxOrder?.sortOrder ?? 0) + 1;

	return db.categories.add({
		...category,
		sortOrder
	});
}

// Update a category
export async function updateCategory(
	id: number,
	updates: Partial<Omit<Category, 'id'>>
): Promise<void> {
	await db.categories.update(id, updates);
}

// Toggle category active status
export async function toggleCategoryActive(id: number): Promise<void> {
	const category = await db.categories.get(id);
	if (category) {
		await db.categories.update(id, { isActive: !category.isActive });
	}
}
