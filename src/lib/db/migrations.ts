/**
 * Database migrations for the Ledger app
 * Each migration is idempotent - safe to run multiple times
 *
 * Optimized to use bulk operations for better performance with large datasets.
 */

import { db, calculatePartnerShare } from './index';
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
 * Migration: Add notification settings fields to settings
 */
async function migrateSettingsNotifications(): Promise<void> {
	const settings = await db.settings.get(1);
	if (settings && (settings as { notificationsEnabled?: boolean }).notificationsEnabled === undefined) {
		await db.settings.update(1, {
			notificationsEnabled: false,
			dailyReminderEnabled: true,
			dailyReminderTime: '20:00',
			weeklyReviewEnabled: true,
			monthlyBudgetSetupEnabled: true
		});
		if (import.meta.env.DEV) console.log('Migration: Added notification settings fields');
	}
}

/**
 * Migration: Link form-split transactions that were created as independent records.
 *
 * The old addSplitTransactions() created N unlinked transactions via Promise.allSettled.
 * This migration detects those groups by matching (merchant, date) with near-identical
 * createdAt timestamps (<1 second apart), creates a hidden parent for each group,
 * and links the children via parentTransactionId.
 */
async function migrateFormSplitLinkage(): Promise<void> {
	const allTransactions = await db.transactions.toArray();
	if (allTransactions.length === 0) return;

	// Only process transactions that aren't already linked or marked as split parents
	const candidates = allTransactions.filter(
		(t) => !t.parentTransactionId && !t.isSplitParent && !t.isDeleted
	);
	if (candidates.length === 0) return;

	// Group by (merchant, date YYYY-MM-DD)
	const groups = new Map<string, Transaction[]>();
	for (const t of candidates) {
		const d = t.date instanceof Date ? t.date : new Date(t.date);
		const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		const key = `${t.merchant}\0${dateKey}`;
		let group = groups.get(key);
		if (!group) {
			group = [];
			groups.set(key, group);
		}
		group.push(t);
	}

	// For each group with 2+ transactions, check createdAt proximity
	const TIMESTAMP_WINDOW_MS = 1000; // 1 second
	let migrated = 0;
	const now = new Date();

	for (const [, group] of groups) {
		if (group.length < 2) continue;

		// Sort by createdAt
		group.sort(
			(a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
		);

		const firstTime = new Date(group[0].createdAt).getTime();
		const lastTime = new Date(group[group.length - 1].createdAt).getTime();

		if (lastTime - firstTime > TIMESTAMP_WINDOW_MS) continue;

		// This is a form-split group — create parent and link children
		const template = group[0];
		const totalAmount = group.reduce((sum, t) => sum + t.amount, 0);
		const partnerShare = template.isShared
			? calculatePartnerShare(totalAmount, template.splitType, template.splitValue)
			: 0;

		// Create hidden parent transaction
		const parentId = (await db.transactions.add({
			date: template.date,
			merchant: template.merchant,
			amount: totalAmount,
			categoryId: template.categoryId,
			isShared: template.isShared,
			splitType: template.splitType,
			splitValue: template.splitValue,
			partnerShare,
			isSettled: template.isSettled,
			settledDate: template.settledDate,
			isEssential: template.isEssential,
			isSubscription: false,
			isSplitParent: true,
			createdAt: template.createdAt,
			updatedAt: now
		})) as number;

		// Link children to parent
		for (const child of group) {
			await db.transactions.update(child.id!, {
				parentTransactionId: parentId,
				updatedAt: now
			});
		}

		migrated += group.length;
	}

	if (migrated > 0 && import.meta.env.DEV) {
		console.log(
			`Migration: Linked ${migrated} form-split transactions to new parent records`
		);
	}
}

/**
 * Migration: Unmark orphaned split parents that have no children.
 * These can occur when split creation partially failed or children were deleted.
 */
async function migrateOrphanedSplitParents(): Promise<void> {
	const splitParents = await db.transactions
		.filter((t) => t.isSplitParent === true)
		.toArray();
	if (splitParents.length === 0) return;

	const orphanIds: number[] = [];
	for (const parent of splitParents) {
		const childCount = await db.transactions
			.where('parentTransactionId')
			.equals(parent.id!)
			.count();
		if (childCount === 0) {
			orphanIds.push(parent.id!);
		}
	}

	if (orphanIds.length > 0) {
		const now = new Date();
		for (const id of orphanIds) {
			await db.transactions.update(id, {
				isSplitParent: false,
				updatedAt: now
			});
		}
		if (import.meta.env.DEV) {
			console.log(
				`Migration: Unmarked ${orphanIds.length} orphaned split parent(s)`
			);
		}
	}
}

/**
 * Current migration version. Increment this when adding a new migration.
 * When the stored version matches, all migrations are skipped.
 */
const CURRENT_MIGRATION_VERSION = 11;

/**
 * Run all database migrations
 * Skips entirely if the stored migration version is current.
 * Each migration is idempotent and checks if it needs to run.
 * Returns true if any migrations were applied (caller should persist).
 */
export async function runMigrations(): Promise<boolean> {
	const settings = await db.settings.get(1);
	if (settings?.migrationVersion === CURRENT_MIGRATION_VERSION) {
		return false; // All migrations already applied
	}

	await migrateCategoryColors();
	await migrateCategoryEssential();
	await migrateSettingsDismissedRecurring();
	await migrateTransactionEssential();
	await migrateTransactionSubscription();
	await migrateTransactionDates();
	await migrateSeedSavingsAccounts();
	await migrateSettingsCompletedGoals();
	await migrateSettingsNotifications();
	await migrateFormSplitLinkage();
	await migrateOrphanedSplitParents();

	// Stamp the version so subsequent startups skip all checks
	await db.settings.update(1, { migrationVersion: CURRENT_MIGRATION_VERSION });
	return true;
}
