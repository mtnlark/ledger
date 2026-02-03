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
	DEFAULT_SAVINGS_ACCOUNTS,
	type Category,
	type SavingsAccount
} from '$lib/db';
import { parseStoredDate } from '$lib/utils/date-helpers';
import type { StoredData, ReadDataResult, RecoveryResult } from './types';

// Tauri API modules - loaded once during initialization
let fs: typeof import('@tauri-apps/plugin-fs');
let path: typeof import('@tauri-apps/api/path');

// Cached paths - resolved once during initialization
let cachedAppDataDir: string;
let cachedBackupsDir: string;
let cachedDataPath: string;
let cachedICloudDir: string;

// Track if APIs have been initialized
let apisInitialized = false;

const DATA_FILE = 'data.json';
const BACKUPS_DIR = 'backups';
const MAX_BACKUPS = 10;
const ICLOUD_APP_FOLDER = 'Ledger';

// Backup debouncing - track last backup time
let lastBackupTime = 0;
const BACKUP_DEBOUNCE_MS = 60000; // 1 minute

// Temp file suffix for atomic writes
const TEMP_SUFFIX = '.tmp';

/**
 * Calculate SHA-256 checksum of data content (excluding checksum field)
 */
async function calculateChecksum(data: StoredData): Promise<string> {
	// Create a copy without the checksum field for hashing
	const { checksum: _, ...dataWithoutChecksum } = data;
	const content = JSON.stringify(dataWithoutChecksum);

	// Use Web Crypto API (available in Tauri/WebView)
	const encoder = new TextEncoder();
	const dataBuffer = encoder.encode(content);
	const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);

	// Convert to hex string
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify that data checksum matches (if checksum field is present)
 * Returns true if checksum is valid or not present (for backwards compatibility)
 */
async function verifyChecksum(data: StoredData): Promise<boolean> {
	if (!data.checksum) {
		// No checksum = legacy data, accept it
		return true;
	}
	const calculated = await calculateChecksum(data);
	return calculated === data.checksum;
}

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

	// Cache iCloud path (~/Library/Mobile Documents/com~apple~CloudDocs/Ledger/)
	const homeDir = await path.homeDir();
	cachedICloudDir = await path.join(
		homeDir,
		'Library/Mobile Documents/com~apple~CloudDocs',
		ICLOUD_APP_FOLDER
	);

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
 * Read data from JSON file with validation
 */
async function readDataFile(): Promise<ReadDataResult> {
	ensureInitialized();

	if (!(await fs.exists(cachedDataPath))) {
		return { status: 'not_found' };
	}

	let content: string;
	try {
		content = await fs.readTextFile(cachedDataPath);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('Failed to read data file:', error);
		return { status: 'corrupted', error: `File read error: ${message}` };
	}

	let data: StoredData;
	try {
		data = JSON.parse(content) as StoredData;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('Failed to parse data file JSON:', error);
		return { status: 'corrupted', error: `JSON parse error: ${message}` };
	}

	// Verify checksum if present
	const checksumValid = await verifyChecksum(data);
	if (!checksumValid) {
		console.error('Data file checksum mismatch - possible corruption');
		return { status: 'checksum_mismatch', data };
	}

	return { status: 'success', data };
}

/**
 * Attempt to recover data from backups
 * Tries each backup from newest to oldest until one parses successfully
 */
async function recoverFromBackups(): Promise<RecoveryResult> {
	ensureInitialized();

	if (!(await fs.exists(cachedBackupsDir))) {
		return { status: 'no_valid_backup' };
	}

	const entries = await fs.readDir(cachedBackupsDir);
	const backupFiles = entries
		.filter((e) => e.isFile && e.name?.startsWith('data-') && e.name?.endsWith('.json'))
		.map((e) => e.name!)
		.sort()
		.reverse(); // Most recent first

	for (const backupName of backupFiles) {
		try {
			const backupPath = await path.join(cachedBackupsDir, backupName);
			const content = await fs.readTextFile(backupPath);
			const data = JSON.parse(content) as StoredData;

			// Verify checksum if present (but don't reject legacy backups without checksums)
			if (data.checksum) {
				const valid = await verifyChecksum(data);
				if (!valid) {
					console.warn(`Backup ${backupName} has invalid checksum, trying next...`);
					continue;
				}
			}

			console.log(`Successfully recovered from backup: ${backupName}`);
			return { status: 'recovered', data, backupName };
		} catch (error) {
			console.warn(`Backup ${backupName} is invalid, trying next...`, error);
			continue;
		}
	}

	return { status: 'no_valid_backup' };
}

/**
 * Write data to JSON file using atomic write pattern
 *
 * 1. Calculate checksum and add to data
 * 2. Write to temp file (.tmp)
 * 3. Rename existing file to .bak (immediate backup)
 * 4. Rename temp file to final name
 *
 * This ensures data.json is always in a complete, valid state.
 */
async function writeDataFile(data: StoredData): Promise<void> {
	ensureInitialized();

	// Calculate and add checksum
	const checksum = await calculateChecksum(data);
	const dataWithChecksum: StoredData = { ...data, checksum };

	const content = JSON.stringify(dataWithChecksum, null, 2);
	const tempPath = cachedDataPath + TEMP_SUFFIX;
	const backupPath = cachedDataPath + '.bak';

	// Step 1: Write to temp file
	await fs.writeTextFile(tempPath, content);

	// Step 2: If main file exists, rename to .bak (overwrites any existing .bak)
	if (await fs.exists(cachedDataPath)) {
		try {
			// Remove existing .bak if present
			if (await fs.exists(backupPath)) {
				await fs.remove(backupPath);
			}
			await fs.rename(cachedDataPath, backupPath);
		} catch (error) {
			// If backup rename fails, still try to complete the write
			console.error('Failed to create .bak file:', error);
		}
	}

	// Step 3: Rename temp to final (atomic on most filesystems)
	await fs.rename(tempPath, cachedDataPath);
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

	// Copy to iCloud if enabled
	try {
		const settings = await db.settings.get(1);
		if (settings?.iCloudBackupEnabled) {
			await copyBackupToICloud(content, backupName);
		}
	} catch (error) {
		// Don't block on iCloud backup errors
		console.error('iCloud backup check failed:', error);
	}
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
 * Check if iCloud Drive is available on this system
 */
export async function isICloudAvailable(): Promise<boolean> {
	ensureInitialized();

	try {
		// Check if the iCloud Drive base directory exists
		const homeDir = await path.homeDir();
		const iCloudBase = await path.join(homeDir, 'Library/Mobile Documents/com~apple~CloudDocs');
		return await fs.exists(iCloudBase);
	} catch {
		return false;
	}
}

/**
 * Get the iCloud backup directory path
 */
export function getICloudBackupDir(): string {
	ensureInitialized();
	return cachedICloudDir;
}

/**
 * Copy a backup file to iCloud Drive
 */
async function copyBackupToICloud(backupContent: string, backupName: string): Promise<void> {
	ensureInitialized();

	try {
		// Check if iCloud is available
		if (!(await isICloudAvailable())) {
			console.log('iCloud Drive not available, skipping cloud backup');
			return;
		}

		// Ensure iCloud app directory exists
		if (!(await fs.exists(cachedICloudDir))) {
			await fs.mkdir(cachedICloudDir, { recursive: true });
		}

		// Write backup to iCloud (overwrite the single backup file)
		const iCloudBackupPath = await path.join(cachedICloudDir, 'ledger-backup.json');
		await fs.writeTextFile(iCloudBackupPath, backupContent);
		console.log('Backup copied to iCloud:', iCloudBackupPath);
	} catch (error) {
		// Don't throw - iCloud backup failure shouldn't block the app
		console.error('Failed to copy backup to iCloud:', error);
	}
}

/**
 * Result of storage initialization
 */
export type InitializationResult =
	| { status: 'loaded' }
	| { status: 'recovered'; backupName: string }
	| { status: 'initialized_fresh' }
	| { status: 'initialized_after_unrecoverable_corruption' };

/**
 * Initialize storage from file on app startup
 * Clears any stale IndexedDB data and loads fresh from JSON file
 *
 * Recovery behavior:
 * - If data.json is valid: load it
 * - If data.json is corrupted/invalid: try to recover from backups
 * - If recovery succeeds: load recovered data, notify user
 * - If recovery fails: initialize with defaults, warn user about data loss
 */
export async function initializeTauriStorage(): Promise<InitializationResult> {
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

	const readResult = await readDataFile();

	// Handle successful read
	if (readResult.status === 'success') {
		await loadDataIntoDexie(readResult.data);
		await runMigrationsIfNeeded();
		return { status: 'loaded' };
	}

	// Handle first run (no data file)
	if (readResult.status === 'not_found') {
		await initializeDefaults();
		await saveToFile();
		await runMigrationsIfNeeded();
		return { status: 'initialized_fresh' };
	}

	// Handle corruption or checksum mismatch - attempt recovery
	console.error(`Data file issue: ${readResult.status}`);
	if (readResult.status === 'corrupted') {
		console.error(`Corruption details: ${readResult.error}`);
	}

	const recoveryResult = await recoverFromBackups();

	if (recoveryResult.status === 'recovered') {
		console.log(`Recovered from backup: ${recoveryResult.backupName}`);
		await loadDataIntoDexie(recoveryResult.data);
		// Save recovered data as new main file
		await saveToFile();
		await runMigrationsIfNeeded();
		return { status: 'recovered', backupName: recoveryResult.backupName };
	}

	// No valid backup - must initialize fresh (data loss)
	console.error('No valid backup found. Initializing with defaults. DATA HAS BEEN LOST.');
	await initializeDefaults();
	await saveToFile();
	await runMigrationsIfNeeded();
	return { status: 'initialized_after_unrecoverable_corruption' };
}

/**
 * Run migrations if needed (extracted for clarity)
 */
async function runMigrationsIfNeeded(): Promise<void> {
	const { runMigrations } = await import('$lib/db/migrations');
	await runMigrations();
}

/**
 * Load stored data into Dexie database
 */
async function loadDataIntoDexie(data: StoredData): Promise<void> {
	await db.transaction(
		'rw',
		[db.transactions, db.categories, db.monthlyBudgets, db.categoryBudgets, db.settings, db.savingsAccounts, db.savingsContributions],
		async () => {
			// Clear existing data
			await db.transactions.clear();
			await db.categories.clear();
			await db.monthlyBudgets.clear();
			await db.categoryBudgets.clear();
			await db.savingsAccounts.clear();
			await db.savingsContributions.clear();

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

			// Load category budgets (convert date strings to Date objects)
			if (data.categoryBudgets && data.categoryBudgets.length > 0) {
				const categoryBudgets = data.categoryBudgets.map((cb) => ({
					...cb,
					createdAt: new Date(cb.createdAt),
					updatedAt: new Date(cb.updatedAt)
				}));
				await db.categoryBudgets.bulkPut(categoryBudgets);
			}

			// Load transactions (convert date strings to Date objects)
			// Use parseStoredDate for transaction date to avoid timezone shift
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

			// Load savings accounts (convert date strings to Date objects)
			if (data.savingsAccounts && data.savingsAccounts.length > 0) {
				const savingsAccounts = data.savingsAccounts.map((sa) => ({
					...sa,
					targetDate: sa.targetDate ? new Date(sa.targetDate) : undefined,
					createdAt: new Date(sa.createdAt),
					updatedAt: new Date(sa.updatedAt)
				}));
				await db.savingsAccounts.bulkPut(savingsAccounts);
			}
			// Note: Default savings accounts are seeded by migration, not here

			// Load savings contributions (convert date strings to Date objects)
			if (data.savingsContributions && data.savingsContributions.length > 0) {
				const savingsContributions = data.savingsContributions.map((sc) => ({
					...sc,
					date: parseStoredDate(sc.date),
					createdAt: new Date(sc.createdAt),
					updatedAt: new Date(sc.updatedAt)
				}));
				await db.savingsContributions.bulkPut(savingsContributions);
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
 * Error thrown when data persistence fails
 */
export class PersistenceError extends Error {
	constructor(
		message: string,
		public readonly cause?: unknown
	) {
		super(message);
		this.name = 'PersistenceError';
	}
}

/**
 * Save current Dexie state to JSON file
 * Called after every data modification
 * @throws PersistenceError if saving fails
 */
export async function saveToFile(): Promise<void> {
	ensureInitialized();

	// Create backup before saving (debounced)
	try {
		await createBackup();
	} catch (error) {
		// Log backup failure but continue with save
		console.error('Backup creation failed:', error);
	}

	// Get all data from Dexie
	const [transactions, categories, monthlyBudgets, categoryBudgets, settings, savingsAccounts, savingsContributions] = await Promise.all([
		db.transactions.toArray(),
		db.categories.toArray(),
		db.monthlyBudgets.toArray(),
		db.categoryBudgets.toArray(),
		db.settings.get(1),
		db.savingsAccounts.toArray(),
		db.savingsContributions.toArray()
	]);

	const data: StoredData = {
		version: '1.0',
		exportedAt: new Date().toISOString(),
		transactions,
		categories,
		monthlyBudgets,
		categoryBudgets,
		settings: settings ?? DEFAULT_SETTINGS,
		savingsAccounts,
		savingsContributions
	};

	try {
		await writeDataFile(data);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new PersistenceError(`Failed to save data: ${message}`, error);
	}
}

/**
 * Reset backup debounce timer (for testing)
 */
export function resetBackupDebounce(): void {
	lastBackupTime = 0;
}
