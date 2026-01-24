/**
 * Storage layer for Tauri desktop app
 *
 * Uses Dexie (IndexedDB) as an in-memory database with
 * JSON file persistence in the app data directory.
 */

import {
	db,
	type Transaction,
	type Category,
	type MonthlyBudget,
	type CategoryBudget,
	type Settings,
	DEFAULT_SETTINGS
} from '$lib/db';
import { parseStoredDate } from '$lib/utils/date-helpers';

// Data structure for file storage
export interface StoredData {
	version: string;
	exportedAt: string;
	transactions: Transaction[];
	categories: Category[];
	monthlyBudgets: MonthlyBudget[];
	categoryBudgets: CategoryBudget[];
	settings: Settings;
}

// Track if storage has been initialized
let initialized = false;

// Check if running in Tauri (has __TAURI__ global)
function isTauri(): boolean {
	return typeof window !== 'undefined' && '__TAURI__' in window;
}

/**
 * Storage initialization error with context
 */
export class StorageInitError extends Error {
	constructor(
		message: string,
		public readonly cause?: unknown
	) {
		super(message);
		this.name = 'StorageInitError';
	}
}

/**
 * Initialize storage - call this on app startup
 * In Tauri: Loads data from JSON file into Dexie
 * In tests: Just initializes Dexie with defaults
 *
 * @throws StorageInitError if initialization fails
 */
export async function initializeStorage(): Promise<void> {
	if (initialized) return;

	try {
		if (isTauri()) {
			const { initializeTauriStorage } = await import('./tauri-adapter');
			await initializeTauriStorage();
		} else {
			// Test/non-Tauri environment - just initialize Dexie defaults
			const { initializeDatabase } = await import('$lib/db');
			await initializeDatabase();
		}

		initialized = true;
	} catch (error) {
		// Reset flag so retry is possible
		initialized = false;

		// Wrap and rethrow with context
		const message = error instanceof Error ? error.message : String(error);
		throw new StorageInitError(`Failed to initialize storage: ${message}`, error);
	}
}

/**
 * Check if storage has been initialized
 */
export function isStorageInitialized(): boolean {
	return initialized;
}

/**
 * Reset initialization state (for testing or error recovery)
 */
export function resetStorageState(): void {
	initialized = false;
}

/**
 * Persist current database state to JSON file
 * Called after any data modification (no-op in tests)
 */
export async function persistData(): Promise<void> {
	if (!isTauri()) return;

	const { saveToFile } = await import('./tauri-adapter');
	await saveToFile();
}

/**
 * Create a backup of current data (no-op in tests)
 */
export async function createBackup(): Promise<void> {
	if (!isTauri()) return;

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
	const [transactions, categories, monthlyBudgets, categoryBudgets, settings] = await Promise.all([
		db.transactions.toArray(),
		db.categories.toArray(),
		db.monthlyBudgets.toArray(),
		db.categoryBudgets.toArray(),
		db.settings.get(1)
	]);

	return {
		version: '1.0',
		exportedAt: new Date().toISOString(),
		transactions,
		categories,
		monthlyBudgets,
		categoryBudgets,
		settings: settings ?? DEFAULT_SETTINGS
	};
}

/**
 * Replace all data (useful for import/restore)
 */
export async function replaceAllData(data: StoredData): Promise<void> {
	await db.transaction(
		'rw',
		[db.transactions, db.categories, db.monthlyBudgets, db.categoryBudgets, db.settings],
		async () => {
			await db.transactions.clear();
			await db.categories.clear();
			await db.monthlyBudgets.clear();
			await db.categoryBudgets.clear();

			if (data.categories.length > 0) {
				await db.categories.bulkPut(data.categories);
			}

			if (data.monthlyBudgets.length > 0) {
				await db.monthlyBudgets.bulkPut(data.monthlyBudgets);
			}

			if (data.categoryBudgets && data.categoryBudgets.length > 0) {
				// Convert date strings back to Date objects
				const categoryBudgets = data.categoryBudgets.map((cb) => ({
					...cb,
					createdAt: new Date(cb.createdAt),
					updatedAt: new Date(cb.updatedAt)
				}));
				await db.categoryBudgets.bulkPut(categoryBudgets);
			}

			if (data.transactions.length > 0) {
				// Convert date strings back to Date objects
				// Use parseStoredDate for transaction date to avoid timezone shift
				const transactions = data.transactions.map((t) => ({
					...t,
					date: parseStoredDate(t.date),
					createdAt: new Date(t.createdAt),
					updatedAt: new Date(t.updatedAt),
					settledDate: t.settledDate ? new Date(t.settledDate) : undefined
				}));
				await db.transactions.bulkPut(transactions);
			}

			if (data.settings) {
				await db.settings.put({ ...data.settings, id: 1 });
			}
		}
	);

	await persistData();
}
