import { beforeEach, describe, expect, it } from 'vitest';
import { db, DEFAULT_SETTINGS } from '$lib/db';
import { resetStorageState } from '$lib/storage';
import { addRefund, addTransaction, calculateOutstandingBalance, updateTransaction, softDeleteTransaction, addSplitTransaction, updateSplitGroup } from './transactions';
import { addContribution } from './savingsContributions';
import { confirmCompleteThrough, getPlanning, linkSavingsAllocation, recordSettlement, saveSchedule, templateFromTransactions, saveSavingsPlan } from './planning';
import { deleteSavingsAccount, updateSavingsAccount } from './savingsAccounts';
import { deleteCategory } from './categories';
import { deleteLinkedAccount } from './linkedAccounts';
import { dehydrateAll, hydrateAll } from '$lib/storage/serialization';
import { validateBackup } from '$lib/storage/backup';
import { formatDateForInput } from '$lib/utils/date-helpers';
import { sumCurrency } from '$lib/utils/currency';
const now = new Date();
const purchase = { date: now, merchant: 'Store', amount: 100, categoryId: 1, isShared: true, splitType: 'fixed' as const, splitValue: 40, isSettled: false, isEssential: false, isSubscription: false, notes: 'Trip #holiday' };
beforeEach(async () => {
	resetStorageState(); await db.delete(); await db.open();
	await db.settings.put(DEFAULT_SETTINGS);
	await db.categories.put({ id: 1, name: 'Shopping', isActive: true, sortOrder: 1, isEssential: false });
	for (const id of [1, 2]) await db.savingsAccounts.put({ id, name: `Goal ${id}`, accountType: 'savings', currentBalance: 0, sortOrder: id, createdAt: now, updatedAt: now });
	await db.linkedAccounts.put({ id: 1, name: 'Bank', institution: 'Local', accountType: 'savings', accountClass: 'asset', currentBalance: 500, source: 'manual', lastSyncStatus: 'stale', sortOrder: 1, isActive: true, createdAt: now, updatedAt: now });
});
describe('planning and financial events', () => {
	it('persists plans through JSON hydration and rejects malformed planning data', async () => {
		await saveSchedule({ id: 'rent', merchant: 'Rent', amount: 2000, categoryId: 1, date: '2026-10-01', frequency: 'monthly', amountType: 'variable', isShared: false, splitType: 'percentage', splitValue: .5, active: true });
		const snapshot = await dehydrateAll(); validateBackup(snapshot);
		await hydrateAll(JSON.parse(JSON.stringify(snapshot)));
		expect((await getPlanning()).schedules).toHaveLength(1);
		expect(() => validateBackup({ ...snapshot, settings: { ...snapshot.settings, planning: { schedules: 'bad' } } })).toThrow();
	});
	it('allocates each bank dollar once, even with a stale balance', async () => {
		await linkSavingsAllocation(1, 1, 300);
		await expect(linkSavingsAllocation(2, 1, 300)).rejects.toThrow('exceed');
		expect((await db.savingsAccounts.get(2))?.currentBalance).toBe(0);
		expect((await db.linkedAccounts.get(1))?.currentBalance).toBe(500);
		await linkSavingsAllocation(2, 1, 150);
		await expect(updateSavingsAccount(2, { currentBalance: 300 })).rejects.toThrow('exceed');
	});
	it('records partial refunds as dated negative spending with a proportional shared credit', async () => {
		const id = await addTransaction(purchase);
		await addRefund(id, 25, now);
		const refund = (await db.transactions.toArray()).find(t => t.refundOfTransactionId === id)!;
		expect(refund.amount).toBe(-25); expect(refund.partnerShare).toBe(-10);
		await expect(addRefund(id, 80, now)).rejects.toThrow('exceed');
		await expect(updateTransaction(id, { amount: 20 })).rejects.toThrow();
	});
	it('allocates refund cents cumulatively so a fully refunded shared purchase nets to zero', async () => {
		const id = await addTransaction({ ...purchase, amount: .05, splitValue: .02 });
		for (let i = 0; i < 5; i++) await addRefund(id, .01, now);
		const rows = await db.transactions.toArray();
		expect(sumCurrency(rows.map(row => row.amount))).toBeCloseTo(0, 2);
		expect(sumCurrency(rows.map(row => row.partnerShare))).toBeCloseTo(0, 2);
	});
	it('withdrawals reduce goal funding and cannot overdraw it', async () => {
		await addContribution({ accountId: 1, amount: 100, source: 'bank_transfer', date: now });
		await addContribution({ accountId: 1, amount: -30, kind: 'withdrawal', source: 'bank_transfer', date: now });
		expect((await db.savingsAccounts.get(1))?.currentBalance).toBe(70);
		await expect(addContribution({ accountId: 1, amount: -80, kind: 'withdrawal', source: 'bank_transfer', date: now })).rejects.toThrow();
	});
	it('records partial settlements and keeps the remaining amount outstanding', async () => {
		const id = await addTransaction(purchase);
		const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
		await recordSettlement({ date, amount: 15, allocations: [{ transactionId: id, amount: 15 }] });
		expect(await calculateOutstandingBalance()).toBe(25);
		await recordSettlement({ date, amount: 25, allocations: [{ transactionId: id, amount: 25 }] });
		expect(await calculateOutstandingBalance()).toBe(0);
		expect((await getPlanning()).settlements).toHaveLength(2);
	});
	it('allows zero-spending periods to be confirmed complete', async () => {
		await confirmCompleteThrough('2026-01-01');
		expect((await getPlanning()).completeThrough).toBe('2026-01-01');
	});
	it('settles only the net unpaid share after partial refunds', async () => {
		const id = await addTransaction(purchase);
		await addRefund(id, 25, now);
		const date = formatDateForInput(now);
		await recordSettlement({ date, amount: 30, allocations: [{ transactionId: id, amount: 30 }] });
		expect(await calculateOutstandingBalance()).toBe(0);
		await expect(softDeleteTransaction(id)).rejects.toThrow();
		validateBackup(await dehydrateAll());
	});
	it('repays a partner’s share after refunding an already reimbursed purchase', async () => {
		const id = await addTransaction(purchase);
		await recordSettlement({ date: formatDateForInput(now), amount: 40, allocations: [{ transactionId: id, amount: 40 }] });
		const refundId = await addRefund(id, 50, now);
		expect(await calculateOutstandingBalance()).toBe(-20);
		await recordSettlement({ date: formatDateForInput(now), direction: 'sent', amount: 5, allocations: [{ transactionId: refundId, amount: 5 }] });
		expect(await calculateOutstandingBalance()).toBe(-15);
		await recordSettlement({ date: formatDateForInput(now), direction: 'sent', amount: 15, allocations: [{ transactionId: refundId, amount: 15 }] });
		expect(await calculateOutstandingBalance()).toBe(0);
		validateBackup(await dehydrateAll());
	});
	it('cleans links and contribution plans when accounts are removed', async () => {
		await linkSavingsAllocation(1, 1, 100);
		await deleteLinkedAccount(1);
		expect((await db.savingsAccounts.get(1))?.linkedAccountId).toBeUndefined();
		await saveSavingsPlan({ id: 'p', accountId: 1, amount: 100, startMonth: '2026-10' });
		await deleteSavingsAccount(1);
		expect((await getPlanning()).savingsPlans).toEqual([]);
		validateBackup(await dehydrateAll());
	});
	it('protects categories used by plans', async () => {
		await saveSchedule({ id: 's', merchant: 'Bill', amount: 10, categoryId: 1, date: '2026-10-01', frequency: 'monthly', amountType: 'fixed', isShared: false, splitType: 'percentage', splitValue: .5, active: true });
		await expect(deleteCategory(1)).rejects.toThrow('referenced');
	});
	it('keeps refund references intact when split groups are edited', async () => {
		const ids = await addSplitTransaction(purchase, [{ categoryId: 1, amount: 60 }, { categoryId: 1, amount: 40 }]);
		await addRefund(ids[0], 10, now);
		const parent = (await db.transactions.get(ids[0]))!.parentTransactionId!;
		await expect(updateSplitGroup(parent, purchase, [{ categoryId: 1, amount: 50 }, { categoryId: 1, amount: 50 }])).rejects.toThrow('refunds');
		validateBackup(await dehydrateAll());
	});
	it('retains split notes and tags when making templates', async () => {
		const id = await addTransaction(purchase);
		const row = (await db.transactions.get(id))!;
		const template = templateFromTransactions([row, { ...row, id: 2, notes: '#groceries', amount: 50, partnerShare: 20 }], 'Weekly shop');
		expect(template.entry.amount).toBe(150);
		expect(template.entry.splitValue).toBe(60);
		expect(template.splits?.map(s => s.notes)).toEqual(['Trip #holiday', '#groceries']);
		const repeated = await addSplitTransaction({ ...purchase, ...template.entry }, template.splits!);
		expect((await db.transactions.bulkGet(repeated)).map(t => t?.notes)).toEqual(['Trip #holiday', '#groceries']);
	});
});
