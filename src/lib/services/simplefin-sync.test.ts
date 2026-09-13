import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type LinkedAccount } from '$lib/db';
import { syncBalances, mapSimplefinAccount, type SimplefinRawAccount } from './simplefin';
import { persistData } from '$lib/storage';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('$lib/storage', async (importOriginal) => ({ ...await importOriginal<typeof import('$lib/storage')>(), persistData: vi.fn().mockResolvedValue(undefined) }));
const now = new Date();
function raw(id: string, balance = '12.50', time = now): SimplefinRawAccount { return { id, name: id, balance, 'balance-date': Math.floor(time.getTime() / 1000) }; }
async function account(id: number, overrides: Partial<LinkedAccount> = {}) {
	await db.linkedAccounts.put({ id, name: String(id), institution: 'Bank', accountClass: 'asset', accountType: 'checking', currentBalance: 99, source: 'simplefin', simplefinId: String(id), lastSyncStatus: 'never', isActive: true, sortOrder: id, createdAt: now, updatedAt: now, ...overrides });
}
beforeEach(async () => { await db.delete(); await db.open(); vi.clearAllMocks(); invoke.mockImplementation(async (command) => command === 'simplefin_is_linked' ? true : { accounts: [], errors: [] }); });
describe('bank sync batches', () => {
	it.each(['', ' ', 'abc', '1.23junk', 'Infinity', 'NaN', '1,000', '1e309'])('rejects invalid balance %s', (balance) => expect(() => mapSimplefinAccount(raw('1', balance))).toThrow('Invalid bank balance'));
	it('keeps last good balances for invalid and missing accounts, and saves exactly once', async () => {
		for (const id of [1, 2, 3]) await account(id);
		invoke.mockImplementation(async (command) => command === 'simplefin_is_linked' ? true : { accounts: [raw('1'), raw('2', 'broken')], errors: [] });
		expect(await syncBalances()).toEqual({ synced: 1, failed: 2, skipped: false });
		expect((await db.linkedAccounts.get(1))?.currentBalance).toBe(12.5);
		expect((await db.linkedAccounts.get(2))).toMatchObject({ currentBalance: 99, lastSyncStatus: 'error' });
		expect((await db.linkedAccounts.get(3))).toMatchObject({ currentBalance: 99, lastSyncStatus: 'stale' });
		expect(await db.balanceSnapshots.count()).toBe(1);
		expect(persistData).toHaveBeenCalledTimes(1);
	});
	it('separates stale upstream timestamps from fetch and capture time', async () => {
		await account(1); const old = new Date(now.getTime() - 80 * 3600000);
		invoke.mockImplementation(async (command) => command === 'simplefin_is_linked' ? true : { accounts: [raw('1', '5', old)], errors: [] });
		await syncBalances();
		const saved = (await db.linkedAccounts.get(1))!; const snapshot = (await db.balanceSnapshots.toArray())[0];
		expect(saved.lastSyncStatus).toBe('stale');
		expect(saved.upstreamBalanceAt!.getTime()).toBe(Math.floor(old.getTime() / 1000) * 1000);
		expect(saved.lastSyncedAt!.getTime()).toBeGreaterThan(old.getTime());
		expect(snapshot.capturedAt).toEqual(saved.lastSyncedAt);
	});
	it('rejects regressed timestamps', async () => {
		await account(1, { upstreamBalanceAt: now });
		invoke.mockImplementation(async (command) => command === 'simplefin_is_linked' ? true : { accounts: [raw('1', '5', new Date(now.getTime() - 10000))], errors: [] });
		await syncBalances();
		expect(await db.linkedAccounts.get(1)).toMatchObject({ currentBalance: 99, lastSyncStatus: 'error' });
		expect(await db.balanceSnapshots.count()).toBe(0);
	});
	it('deduplicates overlapping sync attempts', async () => {
		await account(1);
		const first = syncBalances(), second = syncBalances();
		expect(first).toBe(second);
		await Promise.all([first, second]);
		expect(invoke.mock.calls.filter(([command]) => command === 'simplefin_fetch_accounts')).toHaveLength(1);
		expect(persistData).toHaveBeenCalledTimes(1);
	});
	it('records all account failures together after a network error', async () => {
		await account(1); await account(2);
		invoke.mockRejectedValue(new Error('network failure'));
		expect((await syncBalances()).failed).toBe(2);
		expect((await db.linkedAccounts.toArray()).every((a) => a.lastSyncStatus === 'error' && a.currentBalance === 99)).toBe(true);
		expect(persistData).toHaveBeenCalledTimes(1);
	});
});
