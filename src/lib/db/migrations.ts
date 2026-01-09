/**
 * Database migrations for the Ledger app
 * Each migration is idempotent - safe to run multiple times
 */

import { db } from './index';

// Warm Ledger color palette for categories
const CATEGORY_COLORS: Record<string, string> = {
	'Car': '#7C8B99',
	'Cash withdrawals': '#6B8E6B',
	'Clothes & accessories': '#C49BA0',
	'Coffee & snacks': '#A67B5B',
	'Donations': '#D4A59A',
	'Electronics': '#6B7B8C',
	'Fitness & wellness': '#5B8A8A',
	'Fun & hobbies': '#9B8AA6',
	'Gas': '#D4915D',
	'Gifts': '#C9A9A9',
	'Groceries': '#5B8C5A',
	'Grooming': '#7BA3A3',
	'Health': '#B87070',
	'Home': '#8B7B99',
	'Household supplies': '#8A847C',
	'Insurance': '#6B8299',
	'Parking & tolls': '#9C9588',
	'Pet': '#C4956A',
	'Rent': '#7B6B8C',
	'Restaurants': '#C45D3A',
	'Subscriptions': '#6B8399',
	'Travel': '#5B8B8B',
	'Utilities': '#C9A855'
};

// Essential (needs) vs non-essential (wants) categories
const CATEGORY_ESSENTIAL: Record<string, boolean> = {
	'Car': true,
	'Cash withdrawals': false,
	'Clothes & accessories': false,
	'Coffee & snacks': false,
	'Donations': false,
	'Electronics': false,
	'Fitness & wellness': false,
	'Fun & hobbies': false,
	'Gas': true,
	'Gifts': false,
	'Groceries': true,
	'Grooming': false,
	'Health': true,
	'Home': false,
	'Household supplies': true,
	'Insurance': true,
	'Parking & tolls': true,
	'Pet': true,
	'Rent': true,
	'Restaurants': false,
	'Subscriptions': false,
	'Travel': false,
	'Utilities': true
};

/**
 * Migration: Update category colors to Warm Ledger palette
 */
async function migrateCategoryColors(): Promise<void> {
	// Check if migration is needed by looking at a known category color
	const groceriesCategory = await db.categories.where('name').equals('Groceries').first();
	if (!groceriesCategory || groceriesCategory.color === '#5B8C5A') {
		return; // Already migrated or no categories
	}

	const allCategories = await db.categories.toArray();
	for (const category of allCategories) {
		const newColor = CATEGORY_COLORS[category.name];
		if (newColor && category.color !== newColor) {
			await db.categories.update(category.id!, { color: newColor });
		}
	}
	console.log('Migration: Updated category colors to Warm Ledger palette');
}

/**
 * Migration: Add isEssential field to categories
 */
async function migrateCategoryEssential(): Promise<void> {
	const allCategories = await db.categories.toArray();
	let migrated = false;

	for (const category of allCategories) {
		if (category.isEssential === undefined) {
			const isEssential = CATEGORY_ESSENTIAL[category.name] ?? false;
			await db.categories.update(category.id!, { isEssential });
			migrated = true;
		}
	}

	if (migrated) {
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
 */
async function migrateTransactionEssential(): Promise<void> {
	const allTransactions = await db.transactions.toArray();
	if (allTransactions.length === 0) return;

	// Check if migration is needed
	const needsMigration = allTransactions.some((tx) => tx.isEssential === undefined);
	if (!needsMigration) return;

	// Build category essential lookup
	const categoryEssentialMap = new Map(
		(await db.categories.toArray()).map((c) => [c.id!, c.isEssential ?? false])
	);

	// Update transactions missing isEssential
	for (const tx of allTransactions) {
		if (tx.isEssential === undefined) {
			const isEssential = categoryEssentialMap.get(tx.categoryId) ?? false;
			await db.transactions.update(tx.id!, { isEssential });
		}
	}
	console.log('Migration: Added isEssential field to transactions');
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
}
