/**
 * Tauri file storage adapter
 *
 * Handles persisting data to JSON files in the app data directory.
 * Uses ~/Library/Application Support/app.ledger.desktop/ on macOS.
 */

import {
	db,
	DEFAULT_SETTINGS,
	DEFAULT_CATEGORIES,
	type Category
} from '$lib/db';
import type { StoredData } from './index';

// Tauri API modules - loaded once during initialization
let fs: typeof import('@tauri-apps/plugin-fs');
let path: typeof import('@tauri-apps/api/path');

// Cached paths - resolved once during initialization
let cachedAppDataDir: string;
let cachedBackupsDir: string;
let cachedDataPath: string;

// Track if APIs have been initialized
let apisInitialized = false;

const DATA_FILE = 'data.json';
const BACKUPS_DIR = 'backups';
const MAX_BACKUPS = 10;

// Backup debouncing - track last backup time
let lastBackupTime = 0;
const BACKUP_DEBOUNCE_MS = 60000; // 1 minute

/**
 * Load Tauri APIs and cache paths - called once during initialization
 */
async function initializeApis(): Promise<void> {
	if (apisInitialized) return;

	// Load API modules
	fs = await import('@tauri-apps/plugin-fs');
	path = await import('@tauri-apps/api/path');

	// Cache commonly used paths
	cachedAppDataDir = await path.appDataDir();
	cachedBackupsDir = await path.join(cachedAppDataDir, BACKUPS_DIR);
	cachedDataPath = await path.join(cachedAppDataDir, DATA_FILE);

	apisInitialized = true;
}

/**
 * Ensure APIs are initialized before use
 */
function ensureInitialized(): void {
	if (!apisInitialized) {
		throw new Error('Tauri APIs not initialized. Call initializeTauriStorage() first.');
	}
}

/**
 * Ensure the app data directory and backups subdirectory exist
 */
async function ensureDirectories(): Promise<void> {
	ensureInitialized();

	// Create app data dir if needed
	if (!(await fs.exists(cachedAppDataDir))) {
		await fs.mkdir(cachedAppDataDir, { recursive: true });
	}

	// Create backups dir if needed
	if (!(await fs.exists(cachedBackupsDir))) {
		await fs.mkdir(cachedBackupsDir, { recursive: true });
	}
}

/**
 * Read data from JSON file
 */
async function readDataFile(): Promise<StoredData | null> {
	ensureInitialized();

	if (!(await fs.exists(cachedDataPath))) {
		return null;
	}

	try {
		const content = await fs.readTextFile(cachedDataPath);
		return JSON.parse(content) as StoredData;
	} catch (error) {
		console.error('Failed to read data file:', error);
		return null;
	}
}

/**
 * Write data to JSON file
 */
async function writeDataFile(data: StoredData): Promise<void> {
	ensureInitialized();
	const content = JSON.stringify(data, null, 2);
	await fs.writeTextFile(cachedDataPath, content);
}

/**
 * Create a timestamped backup (debounced to max 1 per minute)
 */
export async function createBackup(): Promise<void> {
	ensureInitialized();

	// Debounce backups - don't create more than one per minute
	const now = Date.now();
	if (now - lastBackupTime < BACKUP_DEBOUNCE_MS) {
		return;
	}

	// Only backup if data file exists
	if (!(await fs.exists(cachedDataPath))) {
		return;
	}

	const content = await fs.readTextFile(cachedDataPath);
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const backupName = `data-${timestamp}.json`;
	const backupPath = await path.join(cachedBackupsDir, backupName);

	await fs.writeTextFile(backupPath, content);
	lastBackupTime = now;

	// Clean up old backups
	await pruneOldBackups();
}

/**
 * Remove old backups, keeping only the most recent MAX_BACKUPS
 */
async function pruneOldBackups(): Promise<void> {
	ensureInitialized();

	const entries = await fs.readDir(cachedBackupsDir);
	const backupFiles = entries
		.filter((e) => e.isFile && e.name?.startsWith('data-') && e.name?.endsWith('.json'))
		.map((e) => e.name!)
		.sort()
		.reverse(); // Most recent first

	// Delete old backups
	if (backupFiles.length > MAX_BACKUPS) {
		const toDelete = backupFiles.slice(MAX_BACKUPS);
		for (const filename of toDelete) {
			const filepath = await path.join(cachedBackupsDir, filename);
			await fs.remove(filepath);
		}
	}
}

/**
 * Initialize storage from file on app startup
 * Clears any stale IndexedDB data and loads fresh from JSON file
 */
export async function initializeTauriStorage(): Promise<void> {
	// Load APIs and cache paths first
	await initializeApis();
	await ensureDirectories();

	// Clear any stale IndexedDB data first - JSON file is our source of truth
	try {
		await db.delete();
		await db.open();
	} catch (error) {
		console.error('Failed to reset IndexedDB:', error);
		throw new Error(`Failed to initialize database: ${error}`);
	}

	const storedData = await readDataFile();

	if (storedData) {
		// Load data from file into Dexie
		await loadDataIntoDexie(storedData);
	} else {
		// First run - initialize with defaults
		await initializeDefaults();
		// Save initial state
		await saveToFile();
	}
}

/**
 * Load stored data into Dexie database
 */
async function loadDataIntoDexie(data: StoredData): Promise<void> {
	await db.transaction(
		'rw',
		[db.transactions, db.categories, db.monthlyBudgets, db.settings],
		async () => {
			// Clear existing data
			await db.transactions.clear();
			await db.categories.clear();
			await db.monthlyBudgets.clear();

			// Load categories
			if (data.categories && data.categories.length > 0) {
				await db.categories.bulkPut(data.categories);
			} else {
				// Seed with defaults
				await db.categories.bulkAdd(DEFAULT_CATEGORIES as Category[]);
			}

			// Load monthly budgets
			if (data.monthlyBudgets && data.monthlyBudgets.length > 0) {
				await db.monthlyBudgets.bulkPut(data.monthlyBudgets);
			}

			// Load transactions (convert date strings to Date objects)
			if (data.transactions && data.transactions.length > 0) {
				const transactions = data.transactions.map((t) => ({
					...t,
					date: new Date(t.date),
					createdAt: new Date(t.createdAt),
					updatedAt: new Date(t.updatedAt),
					settledDate: t.settledDate ? new Date(t.settledDate) : undefined
				}));
				await db.transactions.bulkPut(transactions);
			}

			// Load settings
			if (data.settings) {
				await db.settings.put({ ...data.settings, id: 1 });
			} else {
				await db.settings.put(DEFAULT_SETTINGS);
			}
		}
	);
}

/**
 * Initialize Dexie with default data
 */
async function initializeDefaults(): Promise<void> {
	const categoryCount = await db.categories.count();
	if (categoryCount === 0) {
		await db.categories.bulkAdd(DEFAULT_CATEGORIES as Category[]);
	}

	const settings = await db.settings.get(1);
	if (!settings) {
		await db.settings.add(DEFAULT_SETTINGS);
	}
}

/**
 * Save current Dexie state to JSON file
 * Called after every data modification
 */
export async function saveToFile(): Promise<void> {
	ensureInitialized();

	// Create backup before saving (debounced)
	await createBackup();

	// Get all data from Dexie
	const [transactions, categories, monthlyBudgets, settings] = await Promise.all([
		db.transactions.toArray(),
		db.categories.toArray(),
		db.monthlyBudgets.toArray(),
		db.settings.get(1)
	]);

	const data: StoredData = {
		version: '1.0',
		exportedAt: new Date().toISOString(),
		transactions,
		categories,
		monthlyBudgets,
		settings: settings ?? DEFAULT_SETTINGS
	};

	await writeDataFile(data);
}

/**
 * Reset backup debounce timer (for testing)
 */
export function resetBackupDebounce(): void {
	lastBackupTime = 0;
}
