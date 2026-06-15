import { db, type Category } from '$lib/db';
import { liveQuery } from 'dexie';
import { persistData } from '$lib/storage';

export const categories = liveQuery(() => db.categories.orderBy('sortOrder').toArray());

export async function getAllCategories(): Promise<Category[]> {
	return db.categories.orderBy('sortOrder').toArray();
}

export async function getActiveCategories(): Promise<Category[]> {
	const all = await db.categories.orderBy('sortOrder').toArray();
	return all.filter((c) => c.isActive);
}

export async function getCategoryById(id: number): Promise<Category | undefined> {
	return db.categories.get(id);
}

export async function getCategoryByName(name: string): Promise<Category | undefined> {
	return db.categories.where('name').equalsIgnoreCase(name).first();
}

export async function addCategory(
	category: Omit<Category, 'id' | 'sortOrder'>
): Promise<number> {
	const maxOrder = await db.categories.orderBy('sortOrder').last();
	const sortOrder = (maxOrder?.sortOrder ?? 0) + 1;

	const id = await db.categories.add({
		...category,
		sortOrder
	}) as number;

	await persistData();
	return id;
}

export async function updateCategory(
	id: number,
	updates: Partial<Omit<Category, 'id'>>
): Promise<void> {
	await db.categories.update(id, updates);
	await persistData();
}

export async function toggleCategoryActive(id: number): Promise<void> {
	const category = await db.categories.get(id);
	if (category) {
		await db.categories.update(id, { isActive: !category.isActive });
		await persistData();
	}
}

export async function reorderCategories(orderedIds: number[]): Promise<void> {
	// Update sortOrder for each category based on its position in the array
	await db.transaction('rw', db.categories, async () => {
		for (let i = 0; i < orderedIds.length; i++) {
			await db.categories.update(orderedIds[i], { sortOrder: i + 1 });
		}
	});
	await persistData();
}

export async function moveCategoryUp(id: number): Promise<void> {
	const categories = await db.categories.orderBy('sortOrder').toArray();
	const index = categories.findIndex((c) => c.id === id);

	// Can't move up if already at top
	if (index <= 0) return;

	const current = categories[index];
	const above = categories[index - 1];

	// Swap sort orders
	await db.transaction('rw', db.categories, async () => {
		await db.categories.update(current.id!, { sortOrder: above.sortOrder });
		await db.categories.update(above.id!, { sortOrder: current.sortOrder });
	});
	await persistData();
}

export async function moveCategoryDown(id: number): Promise<void> {
	const categories = await db.categories.orderBy('sortOrder').toArray();
	const index = categories.findIndex((c) => c.id === id);

	// Can't move down if already at bottom
	if (index < 0 || index >= categories.length - 1) return;

	const current = categories[index];
	const below = categories[index + 1];

	// Swap sort orders
	await db.transaction('rw', db.categories, async () => {
		await db.categories.update(current.id!, { sortOrder: below.sortOrder });
		await db.categories.update(below.id!, { sortOrder: current.sortOrder });
	});
	await persistData();
}

export async function deleteCategory(id: number): Promise<void> {
	await db.categories.delete(id);
	await persistData();
}

export async function getCategoryUsageCount(id: number): Promise<number> {
	return db.transactions.where('categoryId').equals(id).count();
}
