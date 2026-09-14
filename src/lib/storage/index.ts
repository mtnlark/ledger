/**
 * Storage layer for Tauri desktop app
 *
 * Uses Dexie (IndexedDB) as an in-memory database with
 * JSON file persistence in the app data directory.
 */

import Dexie from 'dexie';
import { saveStatus, PersistenceError, assertCanMutate } from './status';
export { saveStatus, PersistenceError, assertCanMutate } from './status';
import { dehydrateAll, hydrateAll } from './serialization';
import type { PersistedTableName, StoredData } from './types';
import { initializeDatabase } from '$lib/db';

export type { PersistedTableName, StoredData } from './types';

/**
 * Result of storage initialization (exposed for UI feedback)
 */
export type StorageInitResult =
	| { status: 'loaded'; warnings?: string[] }
	| { status: 'recovered'; backupName: string }
	| { status: 'initialized_fresh' }
	| { status: 'initialized_after_unrecoverable_corruption' };

let initialized = false;
let lastInitResult: StorageInitResult | null = null;
let initializationPromise: Promise<StorageInitResult> | null = null;

// UI feedback callbacks (registered by layout, keeps storage layer UI-agnostic)
let _onWarning: ((message: string, duration?: number) => void) | null = null;
let _onError: ((message: string, duration?: number) => void) | null = null;

/**
 * Register UI feedback callbacks for storage events.
 * Call once from the app layout to decouple storage from toast/UI imports.
 */
export function registerStorageCallbacks(callbacks: {
	onWarning: (message: string, duration?: number) => void;
	onError: (message: string, duration?: number) => void;
}): void {
	_onWarning = callbacks.onWarning;
	_onError = callbacks.onError;
}

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
 * Returns initialization result for UI feedback (recovery notifications, etc.)
 *
 * @throws StorageInitError if initialization fails
 */
export async function initializeStorage(): Promise<StorageInitResult> {
	if (initialized && lastInitResult) {
		return lastInitResult;
	}
	if (initializationPromise) {
		return initializationPromise;
	}

	initializationPromise = (async () => {
		try {
			let result: StorageInitResult;

			if (isTauri()) {
				const { initializeTauriStorage } = await import('./tauri-adapter');
				result = await initializeTauriStorage();
			} else {
				await initializeDatabase();
				result = { status: 'initialized_fresh' };
			}

			initialized = true;
			lastInitResult = result;

			showInitializationFeedback(result);

			return result;
		} catch (error) {
			initialized = false;
			lastInitResult = null;

			const message = error instanceof Error ? error.message : String(error);
			throw new StorageInitError(`Failed to initialize storage: ${message}`, error);
		} finally {
			initializationPromise = null;
		}
	})();

	return initializationPromise;
}

/**
 * Show UI feedback for recovery scenarios via registered callbacks.
 * Falls back silently if no callbacks registered (e.g. in tests).
 */
function showInitializationFeedback(result: StorageInitResult): void {
	if (result.status === 'loaded' && result.warnings?.length) {
		_onWarning?.(`Existing data needs review; all records were preserved. ${result.warnings.join('; ')}`, 15000);
	}
	// Only show feedback for recovery scenarios, not normal load
	if (result.status === 'loaded' || result.status === 'initialized_fresh') {
		return;
	}

	if (result.status === 'recovered') {
		_onWarning?.(
			`Data file was corrupted. Restored from backup (${result.backupName}).`,
			10000
		);
	} else if (result.status === 'initialized_after_unrecoverable_corruption') {
		_onError?.(
			'Data file was corrupted and no valid backup was found. Starting fresh.',
			15000
		);
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
	lastInitResult = null;
	initializationPromise = null;
	saveStatus.set('saved');
}

/**
 * Persist current database state to JSON file
 * Called after any data modification (no-op in tests)
 * Throws an applied PersistenceError and updates the persistent save banner on failure
 */
export async function persistData(
	tables?: PersistedTableName | readonly PersistedTableName[]
): Promise<void> {
	// Nested mutations persist only after their enclosing transaction commits.
	if (Dexie.currentTransaction) return;
	if (!isTauri()) return;
	saveStatus.set('saving');

	try {
		const { saveToFile } = await import('./tauri-adapter');
		await saveToFile(tables);
		saveStatus.set('saved');
	} catch (error) {
		console.error('Data persistence failed:', error);
		saveStatus.set('unsaved');
		throw new PersistenceError('Changes not saved to disk. Retry saving; do not repeat the operation.', true, error);
	}
}

/**
 * Create a backup of current data (no-op in tests)
 */
export async function createBackup(fresh = false): Promise<void> {
	if (!isTauri()) return;

	const { createBackup } = await import('./tauri-adapter');
	await createBackup(fresh);
}

/**
 * Wrap a database operation with persistence
 * Use this for any write operation
 */
export async function withPersistence<T>(
	operation: () => Promise<T>,
	tables?: PersistedTableName | readonly PersistedTableName[]
): Promise<T> {
	assertCanMutate();
	const result = await operation();
	await persistData(tables);
	return result;
}

/**
 * Get all current data (useful for export/backup)
 */
export async function getAllData(): Promise<StoredData> {
	return dehydrateAll();
}

/**
 * Replace all data (useful for import/restore)
 */
export async function replaceAllData(data: StoredData): Promise<void> {
	const { runExclusive } = await import('./mutation');
	return runExclusive(async () => {
		assertCanMutate();
		const { validateBackup } = await import('./backup');
		const validated = validateBackup(data).data;
		await createBackup(true);
		await hydrateAll(validated);
		await refreshDataCaches(true);
		await persistData();
	});
}

/** Retry the current database snapshot, never the mutation that produced it. */
export async function retryPersistence(): Promise<void> {
	const { runExclusive } = await import('./mutation');
	await runExclusive(async () => { await persistData(); await refreshDataCaches(true); });
}

export async function refreshDataCaches(replaceViews = false): Promise<void> {
	const [{ db }, { getTransactionCache }, { tagIndex }, { invalidateMerchantCache }, { invalidateRecurringCache }] = await Promise.all([
		import('$lib/db'), import('$lib/stores/transactionCache'), import('$lib/stores/tags.svelte'),
		import('$lib/stores/merchants'), import('$lib/stores/recurringCache')
	]);
	const cache = getTransactionCache();
	cache.initialize(await db.transactions.toArray());
	tagIndex.rebuild(cache.getAll());
	invalidateMerchantCache();
	invalidateRecurringCache();
	if (typeof window !== 'undefined') {
		if (replaceViews) window.dispatchEvent(new CustomEvent('ledger:data-replaced'));
		window.dispatchEvent(new CustomEvent('ledger:transactions-changed'));
		window.dispatchEvent(new CustomEvent('ledger:networth-changed'));
	}
}
