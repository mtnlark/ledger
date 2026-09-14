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
import { validatePrimaryData, parseBackup, encodeBackup } from './backup';
import { dehydrateAll, dehydrateChanged, hydrateAll } from './serialization';
import type { PersistedTableName, StoredData, ReadDataResult, RecoveryResult } from './types';

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

const PERSISTED_TABLE_NAMES: readonly PersistedTableName[] = [
	'transactions',
	'categories',
	'monthlyBudgets',
	'categoryBudgets',
	'settings',
	'savingsAccounts',
	'savingsContributions',
	'linkedAccounts',
	'balanceSnapshots'
];

type SerializedTables = Partial<Record<PersistedTableName, string>>;

let persistedSnapshot: StoredData | null = null;
let serializedTables: SerializedTables = {};

/**
 * Calculate SHA-256 checksum of data content (excluding checksum field)
 */
async function calculateChecksum(data: StoredData): Promise<string> {
	const { checksum: _, ...dataWithoutChecksum } = data;
	return calculateContentChecksum(JSON.stringify(dataWithoutChecksum));
}

async function calculateContentChecksum(content: string): Promise<string> {
	const encoder = new TextEncoder();
	const dataBuffer = encoder.encode(content);
	const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify that data checksum matches (if checksum field is present)
 * Returns true if checksum is valid or not present (for backwards compatibility)
 */
async function verifyChecksum(data: StoredData): Promise<boolean> {
	if (data.checksum === undefined) {
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
	let warnings: string[];
	try {
		data = JSON.parse(content) as StoredData;
		warnings = validatePrimaryData(data).warnings;
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

	return { status: 'success', data, ...(warnings.length ? { warnings } : {}) };
}

/**
 * Attempt to recover from the .bak file left by the previous atomic write.
 * This is the most recent good state (fresher than the debounced timestamped
 * backups), so it is tried first.
 */
async function recoverFromBakFile(): Promise<RecoveryResult> {
	ensureInitialized();

	const bakPath = cachedDataPath + '.bak';
	if (!(await fs.exists(bakPath))) {
		return { status: 'no_valid_backup', hadCandidates: false };
	}

	try {
		const content = await fs.readTextFile(bakPath);
		const data = (await parseBackup(content)).data;
		if (data.checksum && !(await verifyChecksum(data))) {
			console.warn('data.json.bak has invalid checksum');
			return { status: 'no_valid_backup', hadCandidates: true };
		}
		console.log('Successfully recovered from data.json.bak');
		return { status: 'recovered', data, backupName: 'data.json.bak' };
	} catch (error) {
		console.warn('data.json.bak is invalid', error);
		return { status: 'no_valid_backup', hadCandidates: true };
	}
}

/**
 * Attempt to recover data from timestamped backups
 * Tries each backup from newest to oldest until one parses successfully
 */
async function recoverFromBackups(): Promise<RecoveryResult> {
	ensureInitialized();

	if (!(await fs.exists(cachedBackupsDir))) {
		return { status: 'no_valid_backup', hadCandidates: false };
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
			const data = (await parseBackup(content)).data;

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

	return { status: 'no_valid_backup', hadCandidates: backupFiles.length > 0 };
}

/**
 * Try every recovery source, freshest first: .bak, then timestamped backups.
 */
async function recoverFromAnySource(): Promise<RecoveryResult> {
	const bakResult = await recoverFromBakFile();
	if (bakResult.status === 'recovered') return bakResult;

	const backupsResult = await recoverFromBackups();
	if (backupsResult.status === 'recovered') return backupsResult;

	return {
		status: 'no_valid_backup',
		hadCandidates: bakResult.hadCandidates || backupsResult.hadCandidates
	};
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
async function serializeData(
	data: StoredData,
	changedTables?: ReadonlySet<PersistedTableName>
): Promise<{ content: string; tables: SerializedTables }> {
	const nextTables: SerializedTables = { ...serializedTables };
	for (const tableName of PERSISTED_TABLE_NAMES) {
		if (!nextTables[tableName] || !changedTables || changedTables.has(tableName)) {
			const value = tableName === 'settings' ? data.settings : (data[tableName] ?? []);
			nextTables[tableName] = JSON.stringify(value);
		}
	}

	const fields = [
		`"version":${JSON.stringify(data.version)}`,
		`"exportedAt":${JSON.stringify(data.exportedAt)}`,
		...PERSISTED_TABLE_NAMES.map((tableName) => `"${tableName}":${nextTables[tableName]}`)
	];
	const contentWithoutChecksum = `{${fields.join(',')}}`;
	const checksum = await calculateContentChecksum(contentWithoutChecksum);
	return {
		content: `${contentWithoutChecksum.slice(0, -1)},"checksum":${JSON.stringify(checksum)}}`,
		tables: nextTables
	};
}

async function writeDataFile(
	data: StoredData,
	changedTables?: ReadonlySet<PersistedTableName>
): Promise<SerializedTables> {
	ensureInitialized();

	const serialized = await serializeData(data, changedTables);
	const tempPath = cachedDataPath + TEMP_SUFFIX;
	const backupPath = cachedDataPath + '.bak';

	await fs.writeTextFile(tempPath, serialized.content);

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

	await fs.rename(tempPath, cachedDataPath);
	return serialized.tables;
}

/**
 * Create a timestamped backup (debounced to max 1 per minute)
 */
export async function createBackup(fresh = false): Promise<void> {
	ensureInitialized();

	if (fresh) {
		await ensureDirectories();
		const content = await encodeBackup(await dehydrateAll());
		const backupPath = await path.join(cachedBackupsDir, `data-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}.json`);
		await fs.writeTextFile(backupPath, content);
		// A destructive operation must have a readable recovery snapshot.
		await parseBackup(await fs.readTextFile(backupPath));
		return;
	}
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
			await copyBackupToICloud(content);
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
async function copyBackupToICloud(backupContent: string): Promise<void> {
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
type InitializationResult =
	| { status: 'loaded'; warnings?: string[] }
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
	persistedSnapshot = null;
	serializedTables = {};

	// Load APIs and cache paths first
	await initializeApis();
	await ensureDirectories();

	// Clear any stale IndexedDB data first - JSON file is our source of truth
	try {
		await db.delete();
		await db.open();
	} catch (error) {
		console.error('Failed to reset IndexedDB:', error);
		throw new Error(`Failed to initialize database: ${error}`, { cause: error });
	}

	const readResult = await readDataFile();

	// Handle successful read
	if (readResult.status === 'success') {
		await loadDataIntoDexie(readResult.data);
		await runMigrationsIfNeeded(true);
		return { status: 'loaded', ...(readResult.warnings?.length ? { warnings: readResult.warnings } : {}) };
	}

	// Handle a missing data file. This is usually a true first run, but it can
	// also mean a crash landed between the rename-to-.bak and rename-from-tmp
	// steps of an atomic write — so check recovery sources before starting fresh.
	if (readResult.status === 'not_found') {
		const recoveryResult = await recoverFromAnySource();

		if (recoveryResult.status === 'recovered') {
			console.warn(`data.json missing; recovered from ${recoveryResult.backupName}`);
			await loadDataIntoDexie(recoveryResult.data);
			await saveToFile();
			await runMigrationsIfNeeded(true);
			return { status: 'recovered', backupName: recoveryResult.backupName };
		}

		if (recoveryResult.hadCandidates) {
			// Backups exist but none were readable: data existed and was lost
			console.error('data.json missing and no backup was readable. DATA HAS BEEN LOST.');
			await initializeDefaults();
			await saveToFile();
			await runMigrationsIfNeeded();
			return { status: 'initialized_after_unrecoverable_corruption' };
		}

		// No data file and no backups anywhere: genuine first run
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

	const recoveryResult = await recoverFromAnySource();

	if (recoveryResult.status === 'recovered') {
		console.log(`Recovered from backup: ${recoveryResult.backupName}`);
		await loadDataIntoDexie(recoveryResult.data);
		// Save recovered data as new main file
		await saveToFile();
		await runMigrationsIfNeeded(true);
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
 * Run migrations if needed and persist results to JSON.
 * Migrations that create/modify records (e.g. form-split linkage) must be
 * persisted immediately, since Dexie is cleared on every startup.
 */
async function runMigrationsIfNeeded(preserveEmptyTables = false): Promise<void> {
	const { runMigrations } = await import('$lib/db/migrations');
	const migrated = await runMigrations({ preserveEmptyTables });
	if (migrated) {
		await saveToFile();
	}
}

/**
 * Load stored data into Dexie database
 */
async function loadDataIntoDexie(data: StoredData): Promise<void> {
	await hydrateAll(data);
	persistedSnapshot = data;
	serializedTables = {};
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

// Save serialization: all saves funnel through a single promise chain so two
// saves never race on the shared temp file. A save requested while another is
// already queued (but not started) piggybacks on it — the queued save reads
// Dexie when it runs, so it captures both mutations in one write.
let saveChain: Promise<void> = Promise.resolve();
let saveQueued = false;
let fullSavePending = false;
const pendingTables = new Set<PersistedTableName>();

function addPendingScope(tables?: PersistedTableName | readonly PersistedTableName[]): void {
	if (!tables) {
		fullSavePending = true;
		pendingTables.clear();
		return;
	}
	if (fullSavePending) return;
	for (const table of typeof tables === 'string' ? [tables] : tables) {
		pendingTables.add(table);
	}
}

function takePendingScope(): Set<PersistedTableName> | undefined {
	if (fullSavePending) {
		fullSavePending = false;
		pendingTables.clear();
		return undefined;
	}
	const scope = new Set(pendingTables);
	pendingTables.clear();
	return scope;
}

function restorePendingScope(scope?: ReadonlySet<PersistedTableName>): void {
	if (!scope) {
		fullSavePending = true;
		pendingTables.clear();
		return;
	}
	if (fullSavePending) return;
	for (const table of scope) pendingTables.add(table);
}

/**
 * Save current Dexie state to JSON file
 * Called after every data modification. Concurrent calls are serialized;
 * calls arriving while a save is queued coalesce into that save.
 * @throws PersistenceError if saving fails
 */
export function saveToFile(
	tables?: PersistedTableName | readonly PersistedTableName[]
): Promise<void> {
	ensureInitialized();
	addPendingScope(tables);

	if (saveQueued) {
		return saveChain;
	}
	saveQueued = true;
	saveChain = saveChain
		// A failed save must not poison the chain for subsequent saves
		.catch(() => {})
		.then(() => {
			const scope = takePendingScope();
			saveQueued = false;
			return performSave(scope).catch((error) => {
				restorePendingScope(scope);
				throw error;
			});
		});
	return saveChain;
}

/**
 * Serialize the full Dexie state and write it to disk (single writer;
 * only ever invoked through the saveToFile queue).
 */
async function performSave(changedTables?: ReadonlySet<PersistedTableName>): Promise<void> {
	// Create backup before saving (debounced)
	try {
		await createBackup();
	} catch (error) {
		// Log backup failure but continue with save
		console.error('Backup creation failed:', error);
	}

	const data = persistedSnapshot && changedTables
		? await dehydrateChanged(persistedSnapshot, changedTables)
		: await dehydrateAll();

	try {
		const nextSerializedTables = await writeDataFile(data, changedTables);
		persistedSnapshot = data;
		serializedTables = nextSerializedTables;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new PersistenceError(`Failed to save data: ${message}`, error);
	}
}
