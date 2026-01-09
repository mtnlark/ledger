/**
 * Storage abstraction layer
 *
 * In Tauri: Persists data to JSON files in app data directory
 * In browser: Uses IndexedDB via Dexie (existing behavior)
 *
 * This layer wraps database operations to add file persistence in Tauri mode.
 */

import { db, type Transaction, type Category, type MonthlyBudget, type Settings, DEFAULT_SETTINGS, DEFAULT_CATEGORIES } from '$lib/db';

// Check if running in browser (works in both SvelteKit and test environments)
function isBrowser(): boolean {
	return typeof window !== 'undefined';
}

// Check if running in Tauri
export function isTauri(): boolean {
	return isBrowser() && '__TAURI__' in window;
}

// Data structure for file storage
export interface StoredData {
	version: string;
	exportedAt: string;
	transactions: Transaction[];
	categories: Category[];
	monthlyBudgets: MonthlyBudget[];
	settings: Settings;
}

// Track if storage has been initialized
let initialized = false;
let persistenceEnabled = false;

/**
 * Initialize storage - call this on app startup
 * In Tauri mode, loads data from file into Dexie
 */
export async function initializeStorage(): Promise<void> {
	if (initialized) return;

	if (isTauri()) {
		const { initializeTauriStorage } = await import('./tauri-adapter');
		await initializeTauriStorage();
		persistenceEnabled = true;
	} else {
		// Web mode - just initialize Dexie defaults
		const { initializeDatabase } = await import('$lib/db');
		await initializeDatabase();
	}

	initialized = true;
}

/**
 * Persist current database state to file (Tauri only)
 * Called after any data modification
 */
export async function persistData(): Promise<void> {
	if (!persistenceEnabled) return;

	const { saveToFile } = await import('./tauri-adapter');
	await saveToFile();
}

/**
 * Create a backup of current data (Tauri only)
 */
export async function createBackup(): Promise<void> {
	if (!persistenceEnabled) return;

	const { createBackup } = await import('./tauri-adapter');
	await createBackup();
}

/**
 * Wrap a database operation with persistence
 * Use this for any write operation
 */
export async function withPersistence<T>(operation: () => Promise<T>): Promise<T> {
	const result = await operation();
	await persistData();
	return result;
}

/**
 * Get all current data (useful for export/backup)
 */
export async function getAllData(): Promise<StoredData> {
	const [transactions, categories, monthlyBudgets, settings] = await Promise.all([
		db.transactions.toArray(),
		db.categories.toArray(),
		db.monthlyBudgets.toArray(),
		db.settings.get(1)
	]);

	return {
		version: '1.0',
		exportedAt: new Date().toISOString(),
		transactions,
		categories,
		monthlyBudgets,
		settings: settings ?? DEFAULT_SETTINGS
	};
}

/**
 * Replace all data (useful for import/restore)
 */
export async function replaceAllData(data: StoredData): Promise<void> {
	await db.transaction('rw', [db.transactions, db.categories, db.monthlyBudgets, db.settings], async () => {
		await db.transactions.clear();
		await db.categories.clear();
		await db.monthlyBudgets.clear();

		if (data.categories.length > 0) {
			await db.categories.bulkPut(data.categories);
		}

		if (data.monthlyBudgets.length > 0) {
			await db.monthlyBudgets.bulkPut(data.monthlyBudgets);
		}

		if (data.transactions.length > 0) {
			// Convert date strings back to Date objects
			const transactions = data.transactions.map(t => ({
				...t,
				date: new Date(t.date),
				createdAt: new Date(t.createdAt),
				updatedAt: new Date(t.updatedAt),
				settledDate: t.settledDate ? new Date(t.settledDate) : undefined
			}));
			await db.transactions.bulkPut(transactions);
		}

		if (data.settings) {
			await db.settings.put({ ...data.settings, id: 1 });
		}
	});

	await persistData();
}
