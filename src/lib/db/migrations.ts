/**
 * Database migrations for the Ledger app
 * Each migration is idempotent - safe to run multiple times
 *
 * Optimized to use bulk operations for better performance with large datasets.
 */

import { db } from './index';
import {
	type Category,
	type Transaction,
	type SavingsAccount,
	CATEGORY_COLORS,
	CATEGORY_ESSENTIAL,
	DEFAULT_SAVINGS_ACCOUNTS
} from './constants';

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
		if (import.meta.env.DEV) console.log('Migration: Updated category colors to Warm Ledger palette');
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
		if (import.meta.env.DEV) console.log('Migration: Added isEssential field to categories');
	}
}

/**
 * Migration: Add dismissedRecurring field to settings
 */
async function migrateSettingsDismissedRecurring(): Promise<void> {
	const settings = await db.settings.get(1);
	if (settings && settings.dismissedRecurring === undefined) {
		await db.settings.update(1, { dismissedRecurring: [] });
		if (import.meta.env.DEV) console.log('Migration: Added dismissedRecurring field to settings');
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
	if (import.meta.env.DEV) console.log(`Migration: Added isEssential field to ${updates.length} transactions`);
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
	if (import.meta.env.DEV) console.log(`Migration: Added isSubscription field to ${updates.length} transactions`);
}

/**
 * Migration: Fix transaction dates corrupted by UTC midnight timezone shift.
 * When a date string like "2025-01-01T00:00:00.000Z" was parsed with
 * new Date(isoString), the resulting Date represents UTC midnight,
 * which in western timezones is the PREVIOUS day locally.
 * This migration detects that pattern and corrects to the intended local date.
 */
async function migrateTransactionDates(): Promise<void> {
	const allTransactions = await db.transactions.toArray();
	if (allTransactions.length === 0) return;

	const updates: Transaction[] = [];

	for (const tx of allTransactions) {
		const d = tx.date instanceof Date ? tx.date : new Date(tx.date);
		if (isNaN(d.getTime())) continue;

		// Detect UTC midnight corruption: the Date is at UTC midnight
		// but NOT at local midnight (meaning timezone shifted it)
		const isUtcMidnight =
			d.getUTCHours() === 0 &&
			d.getUTCMinutes() === 0 &&
			d.getUTCSeconds() === 0 &&
			d.getUTCMilliseconds() === 0;
		const isLocalMidnight =
			d.getHours() === 0 &&
			d.getMinutes() === 0 &&
			d.getSeconds() === 0 &&
			d.getMilliseconds() === 0;

		if (isUtcMidnight && !isLocalMidnight) {
			// The intended date is the UTC date, not the local date
			const fixed = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
			updates.push({ ...tx, date: fixed });
		}
	}

	if (updates.length > 0) {
		await db.transactions.bulkPut(updates);
		if (import.meta.env.DEV) console.log(`Migration: Fixed ${updates.length} transaction dates (UTC midnight shift)`);
	}
}

/**
 * Migration: Seed default savings accounts if table is empty
 * Only runs on first time after upgrade to v4 schema
 */
async function migrateSeedSavingsAccounts(): Promise<void> {
	const count = await db.savingsAccounts.count();
	if (count > 0) return; // Already has accounts

	const now = new Date();
	const accountsToAdd: SavingsAccount[] = DEFAULT_SAVINGS_ACCOUNTS.map((account) => ({
		...account,
		createdAt: now,
		updatedAt: now
	}));

	await db.savingsAccounts.bulkAdd(accountsToAdd);
	if (import.meta.env.DEV) console.log('Migration: Seeded default savings accounts');
}

/**
 * Migration: Add completedGoals field to settings
 */
async function migrateSettingsCompletedGoals(): Promise<void> {
	const settings = await db.settings.get(1);
	if (settings && (settings as { completedGoals?: unknown[] }).completedGoals === undefined) {
		await db.settings.update(1, { completedGoals: [] });
		if (import.meta.env.DEV) console.log('Migration: Added completedGoals field to settings');
	}
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
	await migrateTransactionDates();
	await migrateSeedSavingsAccounts();
	await migrateSettingsCompletedGoals();
}
