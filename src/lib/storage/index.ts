/**
 * Storage layer for Tauri desktop app
 *
 * Uses Dexie (IndexedDB) as an in-memory database with
 * JSON file persistence in the app data directory.
 */

import { dehydrateAll, hydrateAll } from './serialization';
import type { StoredData } from './types';
import { initializeDatabase } from '$lib/db';

export type { StoredData } from './types';

/**
 * Result of storage initialization (exposed for UI feedback)
 */
export type StorageInitResult =
	| { status: 'loaded' }
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
}

/**
 * Persist current database state to JSON file
 * Called after any data modification (no-op in tests)
 * Shows a toast notification on failure
 */
export async function persistData(): Promise<void> {
	if (!isTauri()) return;

	try {
		const { saveToFile } = await import('./tauri-adapter');
		await saveToFile();
	} catch (error) {
		console.error('Data persistence failed:', error);
		_onError?.('Failed to save data to disk. Your changes may not persist.');
	}
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
	return dehydrateAll();
}

/**
 * Replace all data (useful for import/restore)
 */
export async function replaceAllData(data: StoredData): Promise<void> {
	await hydrateAll(data);
	await persistData();
}
