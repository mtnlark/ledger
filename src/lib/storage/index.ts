/**
 * Storage layer for Tauri desktop app
 *
 * Uses Dexie (IndexedDB) as an in-memory database with
 * JSON file persistence in the app data directory.
 */

import { dehydrateAll, hydrateAll } from './serialization';
import type { StoredData } from './types';

export type { StoredData } from './types';

/**
 * Result of storage initialization (exposed for UI feedback)
 */
export type StorageInitResult =
	| { status: 'loaded' }
	| { status: 'recovered'; backupName: string }
	| { status: 'initialized_fresh' }
	| { status: 'initialized_after_unrecoverable_corruption' };

// Track if storage has been initialized
let initialized = false;

// Store the most recent init result for UI access
let lastInitResult: StorageInitResult | null = null;

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

	try {
		let result: StorageInitResult;

		if (isTauri()) {
			const { initializeTauriStorage } = await import('./tauri-adapter');
			result = await initializeTauriStorage();
		} else {
			// Test/non-Tauri environment - just initialize Dexie defaults
			const { initializeDatabase } = await import('$lib/db');
			await initializeDatabase();
			result = { status: 'initialized_fresh' };
		}

		initialized = true;
		lastInitResult = result;

		// Show user-facing notifications for recovery scenarios
		showInitializationFeedback(result);

		return result;
	} catch (error) {
		// Reset flag so retry is possible
		initialized = false;
		lastInitResult = null;

		// Wrap and rethrow with context
		const message = error instanceof Error ? error.message : String(error);
		throw new StorageInitError(`Failed to initialize storage: ${message}`, error);
	}
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
