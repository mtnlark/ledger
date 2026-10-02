import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { db, DEFAULT_SETTINGS } from '$lib/db';
import { resetStorageState } from '$lib/storage';
import { addTransaction, updateTransaction, addSplitTransaction, updateSplitGroup, bulkUpdateCategory, bulkAddTag, bulkRemoveTag, renameTag, deleteTag, softDeleteTransaction, getAllTransactions } from '$lib/stores/transactions';
import { addContribution, updateContribution, deleteContribution, getGoalStatus } from '$lib/stores/savingsContributions';
import { deleteSavingsAccount } from '$lib/stores/savingsAccounts';
import { deleteCategory, getCategoryUsageCount } from '$lib/stores/categories';
import { addLinkedAccount, updateLinkedAccount } from '$lib/stores/linkedAccounts';
import { getRecurringSuggestions, addRecurringSuggestionTransaction } from '$lib/stores/recurringSuggestions';
import { invalidateRecurringCache } from '$lib/stores/recurring';
import { undoStore } from '$lib/stores/undo';
import { runExclusive } from '$lib/storage/mutation';
const purchase = () => ({ date: new Date(2026, 8, 10), merchant: 'Store', amount: 100, categoryId: 1, isShared: false, splitType: 'percentage' as const, splitValue: 0.5, isSettled: false, isEssential: false, isSubscription: false });
beforeEach(async () => {
	resetStorageState(); await db.delete(); await db.open();
	await db.settings.put(DEFAULT_SETTINGS);
	await db.categories.bulkPut([1, 2].map((id) => ({ id, name: `Category ${id}`, isActive: true, isEssential: false, sortOrder: id })));
	await db.savingsAccounts.bulkPut([1, 2].map((id) => ({ id, name: `Fund ${id}`, accountType: 'savings' as const, currentBalance: 100, sortOrder: id, createdAt: new Date(), updatedAt: new Date() })));
});
describe('durable record validation', () => {
	it.each([{ date: new Date(NaN) }, { amount: NaN }, { amount: -1 }, { categoryId: 999 }])('rejects a merged transaction update %o', async (updates) => {
		const id = await addTransaction(purchase()); const before = await db.transactions.get(id);
		await expect(updateTransaction(id, updates)).rejects.toThrow();
		expect(await db.transactions.get(id)).toEqual(before);
	});
	it('checks category references inside the queue for creation, splits and bulk changes', async () => {
		const id = await addTransaction(purchase());
		const deleting = runExclusive(() => db.categories.delete(2));
		const adding = addTransaction({ ...purchase(), categoryId: 2 });
		await deleting; await expect(adding).rejects.toThrow('category');
		await expect(addSplitTransaction(purchase(), [{ categoryId: 1, amount: 50 }, { categoryId: 2, amount: 50 }])).rejects.toThrow('category');
		await expect(bulkUpdateCategory([id], 999)).rejects.toThrow('category');
		expect((await db.transactions.get(id))?.categoryId).toBe(1);
	});
	it('rejects invalid group edits without replacing children', async () => {
		const ids = await addSplitTransaction(purchase(), [{ categoryId: 1, amount: 50 }, { categoryId: 2, amount: 50 }]);
		const parent = (await db.transactions.get(ids[0]))!.parentTransactionId!;
		const before = await db.transactions.toArray();
		await expect(updateSplitGroup(parent, purchase(), [{ categoryId: 1, amount: 50 }, { categoryId: 999, amount: 50 }])).rejects.toThrow('category');
		expect(await db.transactions.toArray()).toEqual(before);
	});
	it.each([{ date: new Date(NaN) }, { amount: Infinity }, { amount: -1 }, { accountId: 999 }])('rejects invalid contribution create and edit %o', async (updates) => {
		const input = { accountId: 1, date: new Date(), amount: 10, source: 'other' as const };
		await expect(addContribution({ ...input, ...updates })).rejects.toThrow();
		const id = await addContribution(input); const before = await db.savingsContributions.get(id);
		await expect(updateContribution(id, updates)).rejects.toThrow();
		expect(await db.savingsContributions.get(id)).toEqual(before);
		expect((await db.savingsAccounts.get(1))?.currentBalance).toBe(110);
	});
});

afterEach(() => vi.useRealTimers());
describe('category references and savings accounting', () => {
	it('counts budgets, split parents and soft-deleted history and rejects category deletion', async () => {
		await db.categoryBudgets.add({ categoryId: 2, month: '2020-01', budgetAmount: 25, createdAt: new Date(), updatedAt: new Date() });
		expect(await getCategoryUsageCount(2)).toBe(1);
		await expect(deleteCategory(2)).rejects.toThrow('Deactivate');
		const id = await addTransaction(purchase());
		await db.transactions.update(id, { isSplitParent: true, isDeleted: true });
		await expect(deleteCategory(1)).rejects.toThrow('Deactivate');
		expect(await db.categories.count()).toBe(2);
	});
	it('atomically deletes an account and its contributions', async () => {
		await addContribution({ accountId: 1, amount: 5, date: new Date(), source: 'other' });
		await addContribution({ accountId: 2, amount: 7, date: new Date(), source: 'other' });
		await deleteSavingsAccount(1);
		expect(await db.savingsAccounts.get(1)).toBeUndefined();
		expect((await db.savingsContributions.toArray()).map((c) => c.accountId)).toEqual([2]);
	});
	it('rolls back contribution deletion when account deletion fails', async () => {
		await addContribution({ accountId: 1, amount: 5, date: new Date(), source: 'other' });
		const spy = vi.spyOn(db.savingsAccounts, 'delete').mockRejectedValueOnce(new Error('database failure'));
		await expect(deleteSavingsAccount(1)).rejects.toThrow(); spy.mockRestore();
		expect(await db.savingsContributions.count()).toBe(1);
	});
	it('reverses the old contribution and applies the new amount when moving accounts', async () => {
		const id = await addContribution({ accountId: 1, amount: 10.11, date: new Date(), source: 'other' });
		await updateContribution(id, { accountId: 2, amount: 20.22 });
		expect((await db.savingsAccounts.get(1))?.currentBalance).toBe(100);
		expect((await db.savingsAccounts.get(2))?.currentBalance).toBe(120.22);
		await updateContribution(id, { amount: 30.33 });
		expect((await db.savingsAccounts.get(2))?.currentBalance).toBe(130.33);
		await deleteContribution(id);
		expect((await db.savingsAccounts.get(2))?.currentBalance).toBe(100);
	});
	it('moving to retirement reverses savings without changing retirement balance', async () => {
		await db.savingsAccounts.update(2, { accountType: 'retirement', currentBalance: undefined });
		const id = await addContribution({ accountId: 1, amount: 10, date: new Date(), source: 'other' });
		await updateContribution(id, { accountId: 2 });
		expect((await db.savingsAccounts.get(1))?.currentBalance).toBe(100);
		expect((await db.savingsAccounts.get(2))?.currentBalance).toBeUndefined();
	});
	it.each([15, 31])('keeps a goal ending on October %i active on October 15', async (day) => {
		vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 15, 23, 30));
		await db.savingsAccounts.update(1, { targetAmount: 200, targetDate: new Date(2026, 9, day) });
		const status = await getGoalStatus(1);
		expect(status?.monthsRemaining).toBe(1);
		expect(status?.severity).not.toBe('deadline_passed');
		expect(status?.recommendedMonthly).toBe(100);
	});
	it('expires a goal on the local calendar day after its deadline', async () => {
		vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 1));
		await db.savingsAccounts.update(1, { targetAmount: 200, targetDate: new Date(2026, 9, 31) });
		expect((await getGoalStatus(1))?.severity).toBe('deadline_passed');
	});
});

describe('transaction concurrency and purchase behavior', () => {
	it('retains overlapping add and rename tag edits in both DB and cache', async () => {
		const id = await addTransaction({ ...purchase(), notes: '#old' });
		await getAllTransactions();
		await Promise.all([bulkAddTag([id], 'first'), bulkAddTag([id], 'second'), renameTag('old', 'new')]);
		const expected = '#new #first #second';
		expect((await db.transactions.get(id))?.notes).toBe(expected);
		expect((await getAllTransactions()).find((t) => t.id === id)?.notes).toBe(expected);
		await Promise.all([bulkRemoveTag([id], 'first'), deleteTag('second')]);
		expect((await db.transactions.get(id))?.notes).toBe('#new');
	});
	it('uses the purchase partner share for detected fixed-share splits', async () => {
		for (const month of [6, 7, 8]) await addSplitTransaction({ ...purchase(), date: new Date(2026, month, 10), isShared: true, splitType: 'fixed', splitValue: 20 }, [{ categoryId: 1, amount: 60 }, { categoryId: 2, amount: 40 }]);
		invalidateRecurringCache();
		const suggestions = await getRecurringSuggestions('2026-10');
		expect(suggestions[0].splitValue).toBe(20);
		const ids = await addRecurringSuggestionTransaction({ ...suggestions[0], date: new Date(2026, 9, 10) });
		expect((await db.transactions.bulkGet(ids)).reduce((sum, row) => sum + row!.partnerShare, 0)).toBe(20);
	});
	it('preserves unrelated amount-specific cancellations on add, split and edit', async () => {
		const cancelled = [{ merchant: 'apple', amount: 10, cancelledDate: new Date().toISOString() }];
		await db.settings.update(1, { cancelledSubscriptions: cancelled });
		const id = await addTransaction({ ...purchase(), merchant: 'Apple', amount: 2, isSubscription: true });
		await addSplitTransaction({ ...purchase(), merchant: 'Apple', amount: 2, isSubscription: true }, [{ categoryId: 1, amount: 1 }, { categoryId: 2, amount: 1 }]);
		await updateTransaction(id, { isSubscription: true });
		expect((await db.settings.get(1))?.cancelledSubscriptions).toEqual(cancelled);
		await addTransaction({ ...purchase(), merchant: 'Apple', amount: 10, isSubscription: true });
		expect((await db.settings.get(1))?.cancelledSubscriptions).toEqual([]);
	});
	it('emits a dashboard refresh after successful undo', async () => {
		const id = await addTransaction(purchase());
		undoStore.capture([(await softDeleteTransaction(id))!]);
		const listener = vi.fn(); window.addEventListener('ledger:transactions-changed', listener);
		expect(await undoStore.undo()).toBe(true);
		expect(listener).toHaveBeenCalledOnce();
		window.removeEventListener('ledger:transactions-changed', listener); undoStore.clear();
	});
});

it('rejects duplicate active SimpleFIN mappings on create, update and concurrent reconnect', async () => {
	const input = { name: 'Bank', institution: 'Bank', accountClass: 'asset' as const, accountType: 'checking' as const, initialBalance: 100, source: 'simplefin' as const, simplefinId: 'external' };
	await addLinkedAccount(input);
	await expect(addLinkedAccount(input)).rejects.toThrow('already');
	const id = await addLinkedAccount({ ...input, source: 'manual' });
	await expect(updateLinkedAccount(id, { source: 'simplefin' })).rejects.toThrow('already');
	await db.linkedAccounts.clear();
	const a = await addLinkedAccount({ ...input, source: 'manual' }), b = await addLinkedAccount({ ...input, source: 'manual' });
	const results = await Promise.allSettled([updateLinkedAccount(a, { source: 'simplefin' }), updateLinkedAccount(b, { source: 'simplefin' })]);
	expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
});
