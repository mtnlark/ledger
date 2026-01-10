/**
 * Database migrations for the Ledger app
 * Each migration is idempotent - safe to run multiple times
 *
 * Optimized to use bulk operations for better performance with large datasets.
 */

import {
	db,
	type Category,
	type Transaction,
	CATEGORY_COLORS,
	CATEGORY_ESSENTIAL
} from './index';

/**
 * Migration: Update category colors to Warm Ledger palette
 * Uses bulk update for efficiency
 */
async function migrateCategoryColors(): Promise<void> {
	// Check if migration is needed by looking at a known category color
	const groceriesCategory = await db.categories.where('name').equals('Groceries').first();
	if (!groceriesCategory || groceriesCategory.color === '#5B8C5A') {
		return; // Already migrated or no categories
	}

	const allCategories = await db.categories.toArray();
	const updates: Category[] = [];

	for (const category of allCategories) {
		const newColor = CATEGORY_COLORS[category.name];
		if (newColor && category.color !== newColor) {
			updates.push({ ...category, color: newColor });
		}
	}

	if (updates.length > 0) {
		await db.categories.bulkPut(updates);
		console.log('Migration: Updated category colors to Warm Ledger palette');
	}
}

/**
 * Migration: Add isEssential field to categories
 * Uses bulk update for efficiency
 */
async function migrateCategoryEssential(): Promise<void> {
	const allCategories = await db.categories.toArray();
	const updates: Category[] = [];

	for (const category of allCategories) {
		if (category.isEssential === undefined) {
			const isEssential = CATEGORY_ESSENTIAL[category.name] ?? false;
			updates.push({ ...category, isEssential });
		}
	}

	if (updates.length > 0) {
		await db.categories.bulkPut(updates);
		console.log('Migration: Added isEssential field to categories');
	}
}

/**
 * Migration: Add dismissedRecurring field to settings
 */
async function migrateSettingsDismissedRecurring(): Promise<void> {
	const settings = await db.settings.get(1);
	if (settings && settings.dismissedRecurring === undefined) {
		await db.settings.update(1, { dismissedRecurring: [] });
		console.log('Migration: Added dismissedRecurring field to settings');
	}
}

/**
 * Migration: Add isEssential field to transactions based on their category
 * Uses bulk update for efficiency with large datasets
 */
async function migrateTransactionEssential(): Promise<void> {
	const allTransactions = await db.transactions.toArray();
	if (allTransactions.length === 0) return;

	// Check if migration is needed
	const transactionsNeedingMigration = allTransactions.filter(
		(tx) => tx.isEssential === undefined
	);
	if (transactionsNeedingMigration.length === 0) return;

	// Build category essential lookup
	const categoryEssentialMap = new Map(
		(await db.categories.toArray()).map((c) => [c.id!, c.isEssential ?? false])
	);

	// Prepare bulk updates
	const updates: Transaction[] = transactionsNeedingMigration.map((tx) => ({
		...tx,
		isEssential: categoryEssentialMap.get(tx.categoryId) ?? false
	}));

	await db.transactions.bulkPut(updates);
	console.log(`Migration: Added isEssential field to ${updates.length} transactions`);
}

/**
 * Migration: Add isSubscription field to transactions (defaults to false)
 * Uses bulk update for efficiency with large datasets
 */
async function migrateTransactionSubscription(): Promise<void> {
	const allTransactions = await db.transactions.toArray();
	if (allTransactions.length === 0) return;

	// Check if migration is needed - filter transactions missing isSubscription
	const transactionsNeedingMigration = allTransactions.filter(
		(tx) => (tx as { isSubscription?: boolean }).isSubscription === undefined
	);
	if (transactionsNeedingMigration.length === 0) return;

	// Prepare bulk updates
	const updates: Transaction[] = transactionsNeedingMigration.map((tx) => ({
		...tx,
		isSubscription: false
	}));

	await db.transactions.bulkPut(updates);
	console.log(`Migration: Added isSubscription field to ${updates.length} transactions`);
}

/**
 * Run all database migrations
 * Each migration is idempotent and checks if it needs to run
 */
export async function runMigrations(): Promise<void> {
	await migrateCategoryColors();
	await migrateCategoryEssential();
	await migrateSettingsDismissedRecurring();
	await migrateTransactionEssential();
	await migrateTransactionSubscription();
}
