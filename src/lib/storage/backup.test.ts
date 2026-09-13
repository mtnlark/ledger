import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, DEFAULT_SETTINGS, type Transaction } from '$lib/db';
import { dehydrateAll, hydrateAll } from './serialization';
import { encodeBackup, parseBackup, validateBackup, TABLE_NAMES } from './backup';
import { replaceAllData, resetStorageState } from './index';
import { exportAllDataToJSON, importFromJSON } from '$lib/utils/export';
import { getTransactionCache } from '$lib/stores/transactionCache';
import { tagIndex } from '$lib/stores/tags.svelte';

const when = new Date('2026-06-15T12:00:00Z');
export function transaction(overrides: Partial<Transaction> = {}): Transaction {
	return { id: 1, merchant: 'Store', date: new Date(2026, 5, 15), amount: 10, categoryId: 1, isShared: false, splitType: 'fixed', splitValue: 0, partnerShare: 0, isSettled: false, isEssential: false, isSubscription: false, createdAt: when, updatedAt: when, ...overrides };
}
async function seed() {
	await db.categories.put({ id: 1, name: 'Food', isActive: true, isEssential: true, sortOrder: 1 });
	await db.transactions.put(transaction({ notes: '#food' }));
	await db.settings.put(DEFAULT_SETTINGS);
	await db.monthlyBudgets.put({ id: 1, month: '2026-06', income: 100, savedAmount: 5 });
	await db.categoryBudgets.put({ id: 1, month: '2026-06', categoryId: 1, budgetAmount: 10, createdAt: when, updatedAt: when });
	await db.savingsAccounts.put({ id: 1, name: 'Savings', accountType: 'savings', sortOrder: 1, currentBalance: 50, createdAt: when, updatedAt: when });
	await db.savingsContributions.put({ id: 1, accountId: 1, date: new Date(2026, 5, 15), amount: 5, source: 'other', createdAt: when, updatedAt: when });
	await db.linkedAccounts.put({ id: 1, name: 'Bank', institution: 'Bank', accountClass: 'asset', accountType: 'checking', currentBalance: 30, source: 'simplefin', lastSyncStatus: 'ok', upstreamBalanceAt: when, lastSyncedAt: when, isActive: true, sortOrder: 1, createdAt: when, updatedAt: when });
	await db.balanceSnapshots.put({ id: 1, accountId: 1, balance: 30, capturedAt: when, source: 'simplefin' });
}
beforeEach(async () => { resetStorageState(); vi.restoreAllMocks(); await db.delete(); await db.open(); });
describe('complete backup and restore', () => {
	it('round trips all nine tables, checksums, dates and original IDs', async () => {
		await seed();
		const original = await dehydrateAll();
		const exported = await exportAllDataToJSON();
		const preview = await parseBackup(exported);
		expect(preview.missingTables).toEqual([]);
		expect(Object.values(preview.counts)).toEqual(Array(9).fill(1));
		await db.transactions.clear();
		expect((await importFromJSON(exported)).success).toBe(true);
		const restored = await dehydrateAll();
		for (const table of TABLE_NAMES) expect(restored[table]).toEqual(original[table]);
		expect(getTransactionCache().getAll()[0].notes).toBe('#food');
		expect(tagIndex.getAllTags()).toContain('food');
	});
	it('accepts legacy automatic files and identifies omitted tables', async () => {
		await seed(); const data = await dehydrateAll();
		delete data.savingsAccounts; delete data.savingsContributions; delete data.linkedAccounts; delete data.balanceSnapshots;
		const preview = await parseBackup(JSON.stringify(data));
		expect(preview.missingTables).toHaveLength(4);
		await replaceAllData(preview.data);
		expect(await db.savingsAccounts.count()).toBe(0);
		expect(await db.balanceSnapshots.count()).toBe(0);
	});
	it('normalizes legacy manual budgets and empties omitted tables including settings', async () => {
		await seed(); const data = await dehydrateAll();
		const preview = await parseBackup(JSON.stringify({ version: '1.0', exportDate: data.exportedAt, data: { transactions: data.transactions, categories: data.categories, budgets: data.monthlyBudgets } }));
		expect(preview.data.monthlyBudgets).toEqual(data.monthlyBudgets);
		expect(preview.warnings).toHaveLength(6);
		await replaceAllData(preview.data);
		expect(await db.settings.count()).toBe(0);
		expect(await db.categoryBudgets.count()).toBe(0);
	});
	it('permits explicit empty snapshots', async () => {
		const data = await dehydrateAll();
		await seed(); await replaceAllData((await parseBackup(await encodeBackup(data))).data);
		for (const table of TABLE_NAMES) expect(await db.table(table).count()).toBe(0);
	});
	it('rolls back every table if the replacement transaction fails', async () => {
		await seed(); const data = await dehydrateAll();
		const next = structuredClone(data); next.transactions[0].merchant = 'Replacement';
		vi.spyOn(db.balanceSnapshots, 'bulkPut').mockRejectedValueOnce(new Error('injected database failure'));
		await expect(replaceAllData(next)).rejects.toThrow('injected');
		expect((await db.transactions.get(1))?.merchant).toBe('Store');
		expect(await db.settings.count()).toBe(1);
	});
	it('refreshes mounted views after a restore', async () => {
		await seed(); const listener = vi.fn(); window.addEventListener('ledger:data-replaced', listener);
		await replaceAllData(await dehydrateAll());
		expect(listener).toHaveBeenCalledTimes(1);
		window.removeEventListener('ledger:data-replaced', listener);
	});
});
describe('validation before mutation', () => {
	it.each(['{}', '{"data":{}}', '{"version":"1.0","data":{}}', 'null', '{', '{"version":"2.0"}'])('rejects malformed input %s without writes', async (input) => {
		await seed(); expect((await importFromJSON(input)).success).toBe(false); expect(await db.transactions.count()).toBe(1);
	});
	it.each(['amount', 'partnerShare', 'splitValue'])('rejects nonfinite %s', async (field) => {
		await seed(); const data = await dehydrateAll(); Object.assign(data.transactions[0], { [field]: Infinity }); expect(() => validateBackup(data)).toThrow('finite');
	});
	it('rejects duplicate IDs, invalid dates/enums and missing references', async () => {
		await seed(); const source = await dehydrateAll();
		for (const patch of [{ id: 1 }, { date: '2026-02-30' }, { splitType: 'bad' }, { categoryId: 987 }, { parentTransactionId: 1 }]) {
			const data = structuredClone(source);
			if (Object.hasOwn(patch, 'id')) data.transactions.push(transaction());
			else Object.assign(data.transactions[0], patch);
			expect(() => validateBackup(data)).toThrow('Invalid backup');
		}
	});
	it('accepts every supported subscription frequency', async () => {
		await seed(); const data = await dehydrateAll();
		for (const subscriptionFrequency of ['monthly', 'semi-annual', 'annual'] as const) { data.transactions[0].subscriptionFrequency = subscriptionFrequency; expect(() => validateBackup(data)).not.toThrow(); }
	});
	it('rejects checksum tampering and explicitly malformed optional tables', async () => {
		await seed(); const encoded = JSON.parse(await exportAllDataToJSON()); encoded.transactions[0].amount = 999;
		await expect(parseBackup(JSON.stringify(encoded))).rejects.toThrow('checksum');
		const data = await dehydrateAll(); expect(() => validateBackup({ ...data, savingsAccounts: {} })).toThrow();
		expect(() => validateBackup({ ...data, savingsAccounts: null })).toThrow();
	});
	it('hydrates deletion and upstream timestamps', async () => {
		await seed(); const data = await dehydrateAll(); data.transactions[0].deletedAt = when;
		await hydrateAll(JSON.parse(await encodeBackup(data)));
		expect((await db.transactions.get(1))?.deletedAt).toEqual(when);
		expect((await db.linkedAccounts.get(1))?.upstreamBalanceAt).toEqual(when);
	});
});


it('allows settings to be saved after restoring an explicitly empty settings table', async () => {
	const { updatePartnerName } = await import('$lib/stores/settings');
	await updatePartnerName('New partner');
	expect((await db.settings.get(1))?.partnerName).toBe('New partner');
});


it.each([{ dismissedRecurring: 5 }, { confirmedActiveSubscriptions: [false] }, { cancelledSubscriptions: [true] }, { cancelledSubscriptions: [{ merchant: 'Store' }] }, { completedGoals: [{ accountName: 12, targetAmount: 5, completedDate: '2026-01-01' }] }, { dailyReminderTime: '25:00' }])('rejects malformed nested settings %j', async (fields) => {
	await seed(); const data = await dehydrateAll();
	expect(() => validateBackup({ ...data, settings: { ...data.settings, ...fields } })).toThrow('Invalid backup');
});
