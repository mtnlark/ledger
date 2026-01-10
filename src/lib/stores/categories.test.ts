import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, initializeDatabase } from '$lib/db';
import {
	getAllCategories,
	getActiveCategories,
	getCategoryById,
	getCategoryByName,
	addCategory,
	updateCategory,
	toggleCategoryActive,
	reorderCategories,
	moveCategoryUp,
	moveCategoryDown
} from './categories';

describe('Category Operations', () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
		await initializeDatabase();
	});

	afterEach(async () => {
		await db.delete();
	});

	describe('getAllCategories', () => {
		it('returns all 22 default categories', async () => {
			const categories = await getAllCategories();
			expect(categories).toHaveLength(22);
		});

		it('returns categories sorted by sortOrder', async () => {
			const categories = await getAllCategories();
			for (let i = 1; i < categories.length; i++) {
				expect(categories[i].sortOrder).toBeGreaterThanOrEqual(categories[i - 1].sortOrder);
			}
		});
	});

	describe('getActiveCategories', () => {
		it('returns only active categories', async () => {
			// Deactivate one category
			const categories = await getAllCategories();
			await updateCategory(categories[0].id!, { isActive: false });

			const active = await getActiveCategories();
			expect(active).toHaveLength(21);
		});

		it('returns all categories when all are active', async () => {
			const active = await getActiveCategories();
			expect(active).toHaveLength(22);
		});
	});

	describe('getCategoryById', () => {
		it('returns category by ID', async () => {
			const categories = await getAllCategories();
			const firstCategory = categories[0];

			const found = await getCategoryById(firstCategory.id!);
			expect(found).toBeDefined();
			expect(found?.name).toBe(firstCategory.name);
		});

		it('returns undefined for non-existent ID', async () => {
			const found = await getCategoryById(99999);
			expect(found).toBeUndefined();
		});
	});

	describe('getCategoryByName', () => {
		it('finds category by exact name', async () => {
			const found = await getCategoryByName('Groceries');
			expect(found).toBeDefined();
			expect(found?.name).toBe('Groceries');
		});

		it('is case-insensitive', async () => {
			const found = await getCategoryByName('groceries');
			expect(found).toBeDefined();
			expect(found?.name).toBe('Groceries');
		});

		it('returns undefined for non-existent name', async () => {
			const found = await getCategoryByName('Non-existent Category');
			expect(found).toBeUndefined();
		});
	});

	describe('addCategory', () => {
		it('adds new category with auto-incrementing sortOrder', async () => {
			const initialCount = await db.categories.count();

			const id = await addCategory({
				name: 'New Category',
				icon: '🆕',
				color: '#ff0000',
				isActive: true,
				isEssential: false
			});

			expect(id).toBeGreaterThan(0);

			const newCount = await db.categories.count();
			expect(newCount).toBe(initialCount + 1);

			const category = await db.categories.get(id);
			expect(category?.sortOrder).toBe(23); // After the 22 defaults
		});

		it('sets provided properties', async () => {
			const id = await addCategory({
				name: 'Test Category',
				icon: '🧪',
				color: '#123456',
				isActive: false,
				isEssential: false
			});

			const category = await db.categories.get(id);
			expect(category?.name).toBe('Test Category');
			expect(category?.icon).toBe('🧪');
			expect(category?.color).toBe('#123456');
			expect(category?.isActive).toBe(false);
		});
	});

	describe('updateCategory', () => {
		it('updates category name', async () => {
			const categories = await getAllCategories();
			const category = categories[0];

			await updateCategory(category.id!, { name: 'Updated Name' });

			const updated = await getCategoryById(category.id!);
			expect(updated?.name).toBe('Updated Name');
		});

		it('updates category icon', async () => {
			const categories = await getAllCategories();
			const category = categories[0];

			await updateCategory(category.id!, { icon: '✨' });

			const updated = await getCategoryById(category.id!);
			expect(updated?.icon).toBe('✨');
		});

		it('updates category color', async () => {
			const categories = await getAllCategories();
			const category = categories[0];

			await updateCategory(category.id!, { color: '#ffffff' });

			const updated = await getCategoryById(category.id!);
			expect(updated?.color).toBe('#ffffff');
		});
	});

	describe('toggleCategoryActive', () => {
		it('deactivates an active category', async () => {
			const categories = await getAllCategories();
			const category = categories[0];
			expect(category.isActive).toBe(true);

			await toggleCategoryActive(category.id!);

			const updated = await getCategoryById(category.id!);
			expect(updated?.isActive).toBe(false);
		});

		it('activates an inactive category', async () => {
			const categories = await getAllCategories();
			const category = categories[0];

			// First deactivate
			await toggleCategoryActive(category.id!);
			let updated = await getCategoryById(category.id!);
			expect(updated?.isActive).toBe(false);

			// Then reactivate
			await toggleCategoryActive(category.id!);
			updated = await getCategoryById(category.id!);
			expect(updated?.isActive).toBe(true);
		});
	});

	describe('reorderCategories', () => {
		it('reorders categories based on provided ID array', async () => {
			const categories = await getAllCategories();
			const first = categories[0];
			const second = categories[1];
			const third = categories[2];

			// Reverse the order of first three
			await reorderCategories([third.id!, second.id!, first.id!]);

			const reordered = await getAllCategories();
			expect(reordered[0].id).toBe(third.id);
			expect(reordered[1].id).toBe(second.id);
			expect(reordered[2].id).toBe(first.id);
		});

		it('maintains sortOrder sequence starting from 1', async () => {
			const categories = await getAllCategories();
			const ids = categories.map((c) => c.id!).reverse(); // Reverse all

			await reorderCategories(ids);

			const reordered = await getAllCategories();
			reordered.forEach((cat, index) => {
				expect(cat.sortOrder).toBe(index + 1);
			});
		});
	});

	describe('moveCategoryUp', () => {
		it('moves category up one position', async () => {
			const categories = await getAllCategories();
			const second = categories[1];
			const first = categories[0];

			await moveCategoryUp(second.id!);

			const reordered = await getAllCategories();
			expect(reordered[0].id).toBe(second.id);
			expect(reordered[1].id).toBe(first.id);
		});

		it('does nothing if category is already at top', async () => {
			const categories = await getAllCategories();
			const first = categories[0];

			await moveCategoryUp(first.id!);

			const reordered = await getAllCategories();
			expect(reordered[0].id).toBe(first.id);
		});
	});

	describe('moveCategoryDown', () => {
		it('moves category down one position', async () => {
			const categories = await getAllCategories();
			const first = categories[0];
			const second = categories[1];

			await moveCategoryDown(first.id!);

			const reordered = await getAllCategories();
			expect(reordered[0].id).toBe(second.id);
			expect(reordered[1].id).toBe(first.id);
		});

		it('does nothing if category is already at bottom', async () => {
			const categories = await getAllCategories();
			const last = categories[categories.length - 1];

			await moveCategoryDown(last.id!);

			const reordered = await getAllCategories();
			expect(reordered[reordered.length - 1].id).toBe(last.id);
		});
	});
});
