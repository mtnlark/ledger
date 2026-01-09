/**
 * Tauri file storage adapter
 *
 * Handles persisting data to JSON files in the app data directory.
 * Uses ~/Library/Application Support/BudgetTracker/ on macOS.
 */

import { db, DEFAULT_SETTINGS, DEFAULT_CATEGORIES, type Transaction, type Category, type MonthlyBudget, type Settings } from '$lib/db';
import type { StoredData } from './index';

// Tauri API imports - dynamically loaded only in Tauri environment
let fs: typeof import('@tauri-apps/plugin-fs');
let path: typeof import('@tauri-apps/api/path');

const DATA_FILE = 'data.json';
const BACKUPS_DIR = 'backups';
const MAX_BACKUPS = 10;

/**
 * Load Tauri APIs
 */
async function loadTauriApis(): Promise<void> {
	if (!fs) {
		fs = await import('@tauri-apps/plugin-fs');
	}
	if (!path) {
		path = await import('@tauri-apps/api/path');
	}
}

/**
 * Get the app data directory path
 */
async function getAppDataDir(): Promise<string> {
	await loadTauriApis();
	return await path.appDataDir();
}

/**
 * Ensure the app data directory and backups subdirectory exist
 */
async function ensureDirectories(): Promise<void> {
	await loadTauriApis();
	const appDataDir = await getAppDataDir();

	// Create app data dir if needed
	if (!(await fs.exists(appDataDir))) {
		await fs.mkdir(appDataDir, { recursive: true });
	}

	// Create backups dir if needed
	const backupsDir = await path.join(appDataDir, BACKUPS_DIR);
	if (!(await fs.exists(backupsDir))) {
		await fs.mkdir(backupsDir, { recursive: true });
	}
}

/**
 * Read data from JSON file
 */
async function readDataFile(): Promise<StoredData | null> {
	await loadTauriApis();
	const appDataDir = await getAppDataDir();
	const dataPath = await path.join(appDataDir, DATA_FILE);

	if (!(await fs.exists(dataPath))) {
		return null;
	}

	try {
		const content = await fs.readTextFile(dataPath);
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
	await loadTauriApis();
	const appDataDir = await getAppDataDir();
	const dataPath = await path.join(appDataDir, DATA_FILE);

	const content = JSON.stringify(data, null, 2);
	await fs.writeTextFile(dataPath, content);
}

/**
 * Create a timestamped backup
 */
export async function createBackup(): Promise<void> {
	await loadTauriApis();
	await ensureDirectories();

	const appDataDir = await getAppDataDir();
	const dataPath = await path.join(appDataDir, DATA_FILE);

	// Only backup if data file exists
	if (!(await fs.exists(dataPath))) {
		return;
	}

	const content = await fs.readTextFile(dataPath);
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const backupName = `data-${timestamp}.json`;
	const backupsDir = await path.join(appDataDir, BACKUPS_DIR);
	const backupPath = await path.join(backupsDir, backupName);

	await fs.writeTextFile(backupPath, content);

	// Clean up old backups
	await pruneOldBackups();
}

/**
 * Remove old backups, keeping only the most recent MAX_BACKUPS
 */
async function pruneOldBackups(): Promise<void> {
	await loadTauriApis();
	const appDataDir = await getAppDataDir();
	const backupsDir = await path.join(appDataDir, BACKUPS_DIR);

	const entries = await fs.readDir(backupsDir);
	const backupFiles = entries
		.filter(e => e.isFile && e.name?.startsWith('data-') && e.name?.endsWith('.json'))
		.map(e => e.name!)
		.sort()
		.reverse(); // Most recent first

	// Delete old backups
	if (backupFiles.length > MAX_BACKUPS) {
		const toDelete = backupFiles.slice(MAX_BACKUPS);
		for (const filename of toDelete) {
			const filepath = await path.join(backupsDir, filename);
			await fs.remove(filepath);
		}
	}
}

/**
 * Initialize storage from file on app startup
 * Loads data from JSON file into Dexie
 */
export async function initializeTauriStorage(): Promise<void> {
	await ensureDirectories();

	const storedData = await readDataFile();

	if (storedData) {
		// Load data from file into Dexie
		await loadDataIntoDexie(storedData);
		console.log('Loaded data from file storage');
	} else {
		// First run - initialize with defaults
		await initializeDefaults();
		// Save initial state
		await saveToFile();
		console.log('Initialized with default data');
	}
}

/**
 * Load stored data into Dexie database
 */
async function loadDataIntoDexie(data: StoredData): Promise<void> {
	await db.transaction('rw', [db.transactions, db.categories, db.monthlyBudgets, db.settings], async () => {
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
			const transactions = data.transactions.map(t => ({
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
	});
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
	// Create backup before saving
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
