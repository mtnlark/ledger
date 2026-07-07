/**
 * Shared (de)serialization between Dexie and StoredData.
 *
 * This is the single place that knows every persisted table and how to revive
 * JSON date strings back into Date objects. saveToFile/getAllData use
 * dehydrateAll; startup load and import/restore use hydrateAll.
 */

import { db, DEFAULT_CATEGORIES, DEFAULT_SETTINGS, type Category } from '$lib/db';
import { parseStoredDate } from '$lib/utils/date-helpers';
import type { StoredData } from './types';

/** Every table that participates in StoredData persistence. */
const PERSISTED_TABLES = [
	db.transactions,
	db.categories,
	db.monthlyBudgets,
	db.categoryBudgets,
	db.settings,
	db.savingsAccounts,
	db.savingsContributions,
	db.linkedAccounts,
	db.balanceSnapshots
];

/**
 * Read the full Dexie state into a StoredData snapshot.
 */
export async function dehydrateAll(): Promise<StoredData> {
	const [
		transactions,
		categories,
		monthlyBudgets,
		categoryBudgets,
		settings,
		savingsAccounts,
		savingsContributions,
		linkedAccounts,
		balanceSnapshots
	] = await Promise.all([
		db.transactions.toArray(),
		db.categories.toArray(),
		db.monthlyBudgets.toArray(),
		db.categoryBudgets.toArray(),
		db.settings.get(1),
		db.savingsAccounts.toArray(),
		db.savingsContributions.toArray(),
		db.linkedAccounts.toArray(),
		db.balanceSnapshots.toArray()
	]);

	return {
		version: '1.0',
		exportedAt: new Date().toISOString(),
		transactions,
		categories,
		monthlyBudgets,
		categoryBudgets,
		settings: settings ?? DEFAULT_SETTINGS,
		savingsAccounts,
		savingsContributions,
		linkedAccounts,
		balanceSnapshots
	};
}

/**
 * Replace the full Dexie state with a StoredData snapshot, reviving stored
 * date strings into Date objects. Runs in one rw transaction.
 *
 * `useDefaultsWhenMissing` seeds default categories/settings when the
 * snapshot has none (startup load); import/restore leaves them empty.
 */
export async function hydrateAll(
	data: StoredData,
	options: { useDefaultsWhenMissing?: boolean } = {}
): Promise<void> {
	const { useDefaultsWhenMissing = false } = options;

	await db.transaction('rw', PERSISTED_TABLES, async () => {
		await db.transactions.clear();
		await db.categories.clear();
		await db.monthlyBudgets.clear();
		await db.categoryBudgets.clear();
		await db.savingsAccounts.clear();
		await db.savingsContributions.clear();
		await db.linkedAccounts.clear();
		await db.balanceSnapshots.clear();

		if (data.categories && data.categories.length > 0) {
			await db.categories.bulkPut(data.categories);
		} else if (useDefaultsWhenMissing) {
			await db.categories.bulkAdd(DEFAULT_CATEGORIES as Category[]);
		}

		if (data.monthlyBudgets && data.monthlyBudgets.length > 0) {
			await db.monthlyBudgets.bulkPut(data.monthlyBudgets);
		}

		if (data.categoryBudgets && data.categoryBudgets.length > 0) {
			const categoryBudgets = data.categoryBudgets.map((cb) => ({
				...cb,
				createdAt: new Date(cb.createdAt),
				updatedAt: new Date(cb.updatedAt)
			}));
			await db.categoryBudgets.bulkPut(categoryBudgets);
		}

		// parseStoredDate for user-facing dates avoids UTC-midnight timezone shift
		if (data.transactions && data.transactions.length > 0) {
			const transactions = data.transactions.map((t) => ({
				...t,
				date: parseStoredDate(t.date),
				createdAt: new Date(t.createdAt),
				updatedAt: new Date(t.updatedAt),
				settledDate: t.settledDate ? new Date(t.settledDate) : undefined
			}));
			await db.transactions.bulkPut(transactions);
		}

		if (data.savingsAccounts && data.savingsAccounts.length > 0) {
			const savingsAccounts = data.savingsAccounts.map((sa) => ({
				...sa,
				targetDate: sa.targetDate ? new Date(sa.targetDate) : undefined,
				createdAt: new Date(sa.createdAt),
				updatedAt: new Date(sa.updatedAt)
			}));
			await db.savingsAccounts.bulkPut(savingsAccounts);
		}

		if (data.savingsContributions && data.savingsContributions.length > 0) {
			const savingsContributions = data.savingsContributions.map((sc) => ({
				...sc,
				date: parseStoredDate(sc.date),
				createdAt: new Date(sc.createdAt),
				updatedAt: new Date(sc.updatedAt)
			}));
			await db.savingsContributions.bulkPut(savingsContributions);
		}

		if (data.linkedAccounts && data.linkedAccounts.length > 0) {
			const linkedAccounts = data.linkedAccounts.map((la) => ({
				...la,
				lastSyncedAt: la.lastSyncedAt ? new Date(la.lastSyncedAt) : undefined,
				createdAt: new Date(la.createdAt),
				updatedAt: new Date(la.updatedAt)
			}));
			await db.linkedAccounts.bulkPut(linkedAccounts);
		}

		if (data.balanceSnapshots && data.balanceSnapshots.length > 0) {
			const balanceSnapshots = data.balanceSnapshots.map((bs) => ({
				...bs,
				capturedAt: new Date(bs.capturedAt)
			}));
			await db.balanceSnapshots.bulkPut(balanceSnapshots);
		}

		if (data.settings) {
			await db.settings.put({ ...data.settings, id: 1 });
		} else if (useDefaultsWhenMissing) {
			await db.settings.put(DEFAULT_SETTINGS);
		}
	});
}
