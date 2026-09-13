import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { db, DEFAULT_SETTINGS } from '$lib/db';
import { addTransaction, addSplitTransaction } from '$lib/stores/transactions';
import { saveStatus, retryPersistence, resetStorageState, PersistenceError, replaceAllData } from './index';
import { dehydrateAll } from './serialization';
import { createQuickAddHandler } from '$lib/services/quick-add';
import { addContribution } from '$lib/stores/savingsContributions';
const mocks = vi.hoisted(() => ({ save: vi.fn(), backup: vi.fn() }));
vi.mock('./tauri-adapter', () => ({ saveToFile: mocks.save, createBackup: mocks.backup }));
const input = () => ({ date: new Date(), merchant: 'Purchase', amount: 100, categoryId: 1, isShared: true, splitType: 'fixed' as const, splitValue: 25, isSettled: false, isEssential: false, isSubscription: false });
beforeEach(async () => {
	resetStorageState(); mocks.save.mockReset().mockResolvedValue(undefined); mocks.backup.mockReset().mockResolvedValue(undefined);
	Object.assign(window, { __TAURI__: {} });
	await db.delete(); await db.open();
	await db.categories.put({ id: 1, name: 'Food', isActive: true, sortOrder: 1, isEssential: true });
	await db.settings.put(DEFAULT_SETTINGS);
});
afterEach(() => { resetStorageState(); delete (window as unknown as Record<string, unknown>).__TAURI__; });
describe('durable saves', () => {
	it('reports an applied failure, blocks new writes and retries without inserting again', async () => {
		mocks.save.mockRejectedValueOnce(new Error('disk full'));
		await expect(addTransaction(input())).rejects.toMatchObject({ applied: true });
		expect(get(saveStatus)).toBe('unsaved');
		expect(await db.transactions.count()).toBe(1);
		await expect(addTransaction(input())).rejects.toMatchObject({ applied: false });
		await expect(db.transactions.clear()).rejects.toThrow('Retry');
		await retryPersistence();
		expect(get(saveStatus)).toBe('saved');
		expect(await db.transactions.count()).toBe(1);
		expect(mocks.save).toHaveBeenCalledTimes(2);
		await addTransaction({ ...input(), merchant: 'Next' });
		expect(await db.transactions.count()).toBe(2);
	});
	it('keeps the barrier during a pending retry', async () => {
		mocks.save.mockRejectedValueOnce(new Error('disk full'));
		await expect(addTransaction(input())).rejects.toThrow();
		let release!: () => void;
		mocks.save.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
		const retry = retryPersistence();
		await vi.waitFor(() => expect(release).toBeTypeOf('function'));
		await expect(db.settings.update(1, { partnerName: 'Blocked' })).rejects.toThrow();
		release(); await retry;
	});
	it('serializes queued mutations so disk failure prevents the second insert', async () => {
		mocks.save.mockRejectedValueOnce(new Error('disk full'));
		const results = await Promise.allSettled([addTransaction(input()), addTransaction(input())]);
		expect(results.every((r) => r.status === 'rejected')).toBe(true);
		expect(await db.transactions.count()).toBe(1);
	});
	it('groups a split and subscription reactivation into one save', async () => {
		await db.settings.update(1, { cancelledSubscriptions: [{ merchant: 'purchase', cancelledDate: new Date().toISOString() }] });
		mocks.save.mockRejectedValueOnce(new Error('disk full'));
		await expect(addSplitTransaction({ ...input(), isSubscription: true }, [{ categoryId: 1, amount: 60 }, { categoryId: 1, amount: 40 }])).rejects.toMatchObject({ applied: true });
		expect(await db.transactions.count()).toBe(3);
		expect((await db.settings.get(1))?.cancelledSubscriptions).toEqual([]);
		expect(mocks.save).toHaveBeenCalledTimes(1);
	});
	it('rolls back related contribution writes on a database failure and distinguishes it from a disk failure', async () => {
		await db.savingsAccounts.put({ id: 1, name: 'Fund', accountType: 'savings', currentBalance: 10, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() });
		const spy = vi.spyOn(db.savingsAccounts, 'update').mockRejectedValueOnce(new Error('database failure'));
		await expect(addContribution({ accountId: 1, amount: 5, date: new Date(), source: 'other' })).rejects.toMatchObject({ applied: false });
		expect(await db.savingsContributions.count()).toBe(0);
		expect(mocks.save).not.toHaveBeenCalled();
		spy.mockRestore();
	});
	it('aborts restore if the fresh recovery backup fails', async () => {
		await addTransaction(input()); const snapshot = await dehydrateAll(); snapshot.transactions = [];
		mocks.backup.mockRejectedValueOnce(new Error('backup unavailable'));
		await expect(replaceAllData(snapshot)).rejects.toThrow('backup unavailable');
		expect(await db.transactions.count()).toBe(1);
		expect(mocks.backup).toHaveBeenCalledWith(true);
	});
});
describe('Quick Add acknowledgments', () => {
	const request = () => ({ requestId: 'request-1', data: { ...input(), date: input().date.toISOString() } });
	it('acknowledges durable success and deduplicates concurrent delivery', async () => {
		const handler = createQuickAddHandler(addTransaction, retryPersistence); const req = request();
		const results = await Promise.all([handler(req), handler(req)]);
		expect(results.map((r) => r.status)).toEqual(['saved', 'saved']);
		expect(await db.transactions.count()).toBe(1);
		expect(mocks.save).toHaveBeenCalledTimes(1);
	});
	it('retries saving an applied request and never replays insertion', async () => {
		const handler = createQuickAddHandler(addTransaction, retryPersistence); const req = request();
		mocks.save.mockRejectedValueOnce(new Error('disk full'));
		expect((await handler(req)).status).toBe('unsaved');
		expect((await handler(req)).status).toBe('saved');
		expect(await db.transactions.count()).toBe(1);
	});
	it('rejects bad input and changed payloads with the same ID', async () => {
		const handler = createQuickAddHandler(addTransaction, retryPersistence); const req = request(); req.data.amount = NaN;
		expect((await handler(req)).status).toBe('rejected');
		expect(await db.transactions.count()).toBe(0);
		req.data.amount = 10;
		expect((await handler(req)).message).toContain('different transaction');
	});
	it('can answer a repeated request after the first acknowledgment was missed', async () => {
		const handler = createQuickAddHandler(addTransaction, retryPersistence); const req = request();
		await handler(req);
		expect((await handler(req)).status).toBe('saved');
		expect(await db.transactions.count()).toBe(1);
	});
	it('does not convert failed persistence into success', async () => {
		const handler = createQuickAddHandler(vi.fn().mockRejectedValue(new PersistenceError('unsaved', true)), vi.fn().mockRejectedValue(new Error('still failing')));
		const req = request();
		expect((await handler(req)).status).toBe('unsaved');
		expect((await handler(req)).status).toBe('unsaved');
	});
});
