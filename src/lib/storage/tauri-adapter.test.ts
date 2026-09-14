import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, DEFAULT_SETTINGS, DEFAULT_CATEGORIES, type Category } from '$lib/db';
import type { StoredData } from './types';

// In-memory filesystem shared by the mocked Tauri fs plugin
const files = new Map<string, string>();
const dirs = new Set<string>();

vi.mock('@tauri-apps/plugin-fs', () => ({
	exists: vi.fn(async (p: string) => files.has(p) || dirs.has(p)),
	readTextFile: vi.fn(async (p: string) => {
		const content = files.get(p);
		if (content === undefined) throw new Error(`ENOENT: ${p}`);
		return content;
	}),
	writeTextFile: vi.fn(async (p: string, c: string) => {
		files.set(p, c);
	}),
	mkdir: vi.fn(async (p: string) => {
		dirs.add(p);
	}),
	readDir: vi.fn(async (p: string) =>
		[...files.keys()]
			.filter((k) => k.startsWith(p + '/'))
			.map((k) => ({ isFile: true, name: k.slice(p.length + 1) }))
	),
	remove: vi.fn(async (p: string) => {
		files.delete(p);
		dirs.delete(p);
	}),
	rename: vi.fn(async (from: string, to: string) => {
		const content = files.get(from);
		if (content === undefined) throw new Error(`ENOENT: ${from}`);
		files.set(to, content);
		files.delete(from);
	})
}));

vi.mock('@tauri-apps/api/path', () => ({
	appDataDir: async () => '/appdata',
	homeDir: async () => '/home',
	join: async (...parts: string[]) => parts.join('/').replace(/\/{2,}/g, '/')
}));

import { initializeTauriStorage, saveToFile, createBackup } from './tauri-adapter';
import * as mockedFs from '@tauri-apps/plugin-fs';

const DATA_PATH = '/appdata/data.json';
const BAK_PATH = '/appdata/data.json.bak';
const BACKUPS_DIR = '/appdata/backups';

function makeStoredData(merchant: string): StoredData {
	return {
		version: '1.0',
		exportedAt: new Date().toISOString(),
		transactions: [
			{
				id: 1,
				date: '2024-06-15' as unknown as Date,
				merchant,
				amount: 42,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				partnerShare: 0,
				isSettled: false,
				isEssential: false,
				isSubscription: false,
				createdAt: new Date('2024-06-15T10:00:00Z'),
				updatedAt: new Date('2024-06-15T10:00:00Z')
			}
		],
		categories: DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: i + 1 })) as Category[],
		monthlyBudgets: [],
		categoryBudgets: [],
		settings: { ...DEFAULT_SETTINGS }
	};
}

describe('tauri-adapter', () => {
	beforeEach(async () => {
		files.clear();
		dirs.clear();
		await db.delete();
		await db.open();
	});

	describe('startup recovery when data.json is missing', () => {
		it('initializes fresh when no data file and no backups exist', async () => {
			const result = await initializeTauriStorage();
			expect(result.status).toBe('initialized_fresh');
			expect(files.has(DATA_PATH)).toBe(true);
		});

		it('recovers from data.json.bak when data.json is missing', async () => {
			files.set(BAK_PATH, JSON.stringify(makeStoredData('From Bak')));

			const result = await initializeTauriStorage();
			expect(result).toEqual({ status: 'recovered', backupName: 'data.json.bak' });

			const txs = await db.transactions.toArray();
			expect(txs.length).toBe(1);
			expect(txs[0].merchant).toBe('From Bak');
			// Recovered data was rewritten as the new main file
			expect(files.has(DATA_PATH)).toBe(true);
		});

		it('recovers from a timestamped backup when data.json and .bak are missing', async () => {
			files.set(
				`${BACKUPS_DIR}/data-2024-06-15T10-00-00-000Z.json`,
				JSON.stringify(makeStoredData('From Backup'))
			);

			const result = await initializeTauriStorage();
			expect(result.status).toBe('recovered');

			const txs = await db.transactions.toArray();
			expect(txs[0].merchant).toBe('From Backup');
		});

		it('prefers .bak (freshest) over timestamped backups', async () => {
			files.set(BAK_PATH, JSON.stringify(makeStoredData('From Bak')));
			files.set(
				`${BACKUPS_DIR}/data-2024-06-15T10-00-00-000Z.json`,
				JSON.stringify(makeStoredData('From Backup'))
			);

			const result = await initializeTauriStorage();
			expect(result).toEqual({ status: 'recovered', backupName: 'data.json.bak' });
		});

		it('reports unrecoverable corruption when backups exist but none are readable', async () => {
			files.set(BAK_PATH, 'not json at all {{{');
			files.set(`${BACKUPS_DIR}/data-2024-06-15T10-00-00-000Z.json`, 'also broken');

			const result = await initializeTauriStorage();
			expect(result.status).toBe('initialized_after_unrecoverable_corruption');
		});
	});

	describe('startup recovery when data.json is corrupted', () => {
		it('recovers from .bak before timestamped backups', async () => {
			files.set(DATA_PATH, '{"broken":');
			files.set(BAK_PATH, JSON.stringify(makeStoredData('From Bak')));

			const result = await initializeTauriStorage();
			expect(result).toEqual({ status: 'recovered', backupName: 'data.json.bak' });

			const txs = await db.transactions.toArray();
			expect(txs[0].merchant).toBe('From Bak');
		});
	});

	describe('saveToFile queue', () => {
		it('serializes concurrent saves and coalesces same-tick calls into one write', async () => {
			await initializeTauriStorage();
			const writeSpy = vi.mocked(mockedFs.writeTextFile);
			writeSpy.mockClear();

			await Promise.all([saveToFile(), saveToFile(), saveToFile()]);

			// All three calls coalesced into a single temp-file write
			const tmpWrites = writeSpy.mock.calls.filter(([p]) => String(p).endsWith('.tmp'));
			expect(tmpWrites.length).toBe(1);

			// Final data.json is complete and parseable
			const data = JSON.parse(files.get(DATA_PATH)!) as StoredData;
			expect(data.version).toBe('1.0');
			expect(data.checksum).toBeDefined();
		});

		it('runs a save requested mid-save after the in-flight one finishes', async () => {
			await initializeTauriStorage();
			const writeSpy = vi.mocked(mockedFs.writeTextFile);
			writeSpy.mockClear();

			const first = saveToFile();
			// Wait until the first save has actually started writing, then request another
			await vi.waitFor(() => expect(writeSpy).toHaveBeenCalled());
			const second = saveToFile();
			await Promise.all([first, second]);

			const tmpWrites = writeSpy.mock.calls.filter(([p]) => String(p).endsWith('.tmp'));
			expect(tmpWrites.length).toBe(2);

			const data = JSON.parse(files.get(DATA_PATH)!) as StoredData;
			expect(data.checksum).toBeDefined();
		});

		it('reads only changed tables after the initial snapshot', async () => {
			await initializeTauriStorage();
			await db.transactions.add({
				date: new Date(2026, 0, 15),
				merchant: 'Scoped Save',
				amount: 25,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				partnerShare: 0,
				isSettled: false,
				isEssential: false,
				isSubscription: false,
				createdAt: new Date(),
				updatedAt: new Date()
			});

			const transactionRead = vi.spyOn(db.transactions, 'toArray');
			const categoryRead = vi.spyOn(db.categories, 'toArray');
			try {
				await saveToFile('transactions');
				expect(transactionRead).toHaveBeenCalledOnce();
				expect(categoryRead).not.toHaveBeenCalled();
			} finally {
				transactionRead.mockRestore();
				categoryRead.mockRestore();
			}

			const content = files.get(DATA_PATH)!;
			const data = JSON.parse(content) as StoredData;
			expect(data.transactions[0].merchant).toBe('Scoped Save');
			expect(content).not.toContain('\n');
			expect((await initializeTauriStorage()).status).toBe('loaded');
		});

		it('merges changed-table scopes from coalesced saves', async () => {
			await initializeTauriStorage();
			await db.settings.update(1, { partnerName: 'Sam' });
			await db.categories.update(1, { name: 'Updated Category' });

			const writeSpy = vi.mocked(mockedFs.writeTextFile);
			writeSpy.mockClear();
			await Promise.all([saveToFile('settings'), saveToFile('categories')]);

			const tmpWrites = writeSpy.mock.calls.filter(([path]) => String(path).endsWith('.tmp'));
			expect(tmpWrites).toHaveLength(1);
			const data = JSON.parse(files.get(DATA_PATH)!) as StoredData;
			expect(data.settings?.partnerName).toBe('Sam');
			expect(data.categories[0].name).toBe('Updated Category');
		});
	});
});


describe('validated recovery and fresh backups', () => {
	it('skips structurally invalid JSON recovery candidates', async () => {
		files.clear(); dirs.clear();
		files.set(BAK_PATH, JSON.stringify({ version: '1.0', data: {} }));
		files.set(`${BACKUPS_DIR}/data-2026-01-01.json`, JSON.stringify(makeStoredData('Valid recovery')));
		expect((await initializeTauriStorage()).status).toBe('recovered');
		expect((await db.transactions.toArray())[0].merchant).toBe('Valid recovery');
	});
	it('fresh backups capture the current database, bypass debounce and are readable', async () => {
		files.clear(); dirs.clear();
		files.set(DATA_PATH, JSON.stringify(makeStoredData('Original')));
		await initializeTauriStorage();
		await db.transactions.update(1, { merchant: 'Current unsaved snapshot' });
		await createBackup(true); await createBackup(true);
		const backups = [...files.entries()].filter(([name]) => name.startsWith(BACKUPS_DIR + '/'));
		expect(backups).toHaveLength(2);
		const { parseBackup } = await import('./backup');
		for (const [, content] of backups) expect((await parseBackup(content)).data.transactions[0].merchant).toBe('Current unsaved snapshot');
	});
});


it('preserves explicitly empty tables through startup migrations', async () => {
	files.clear(); dirs.clear();
	const empty = makeStoredData('unused'); empty.transactions = []; empty.categories = []; empty.settings = null;
	empty.savingsAccounts = []; empty.savingsContributions = []; empty.linkedAccounts = []; empty.balanceSnapshots = [];
	files.set(DATA_PATH, JSON.stringify(empty));
	expect((await initializeTauriStorage()).status).toBe('loaded');
	expect(await db.savingsAccounts.count()).toBe(0); expect(await db.settings.count()).toBe(0);
});


it('does not treat an empty checksum as a legacy file', async () => {
	files.clear(); dirs.clear();
	files.set(DATA_PATH, JSON.stringify({ ...makeStoredData('Bad checksum'), checksum: '' }));
	files.set(BAK_PATH, JSON.stringify(makeStoredData('Valid fallback')));
	expect((await initializeTauriStorage()).status).toBe('recovered');
	expect((await db.transactions.toArray())[0].merchant).toBe('Valid fallback');
});


it('preserves dangling references in the primary file without rolling back to an older backup', async () => {
	files.clear(); dirs.clear();
	const primary = makeStoredData('Current records'); primary.settings!.migrationVersion = 11;
	primary.categoryBudgets = [{ id: 21, categoryId: 999, month: '2026-09', budgetAmount: 10, createdAt: new Date(), updatedAt: new Date() }];
	const content = JSON.stringify(primary);
	files.set(DATA_PATH, content); files.set(BAK_PATH, JSON.stringify(makeStoredData('Older records')));
	const result = await initializeTauriStorage();
	expect(result).toMatchObject({ status: 'loaded', warnings: ['categoryBudgets 21 has a missing categoryId reference'] });
	expect((await db.transactions.toArray())[0].merchant).toBe('Current records');
	expect((await db.categoryBudgets.get(21))?.budgetAmount).toBe(10);
	expect(files.get(DATA_PATH)).toBe(content);
	const { parseBackup } = await import('./backup');
	await expect(parseBackup(content)).rejects.toThrow('missing categoryId');
});
