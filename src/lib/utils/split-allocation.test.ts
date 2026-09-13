import { beforeEach, describe, expect, it } from 'vitest';
import { allocatePartnerShares } from './split-allocation';
import { db } from '$lib/db';
import { addSplitTransaction, getSplitChildren, updateSplitGroup } from '$lib/stores/transactions';
import { applySplitRepairs, previewSplitRepairs } from '$lib/storage/split-repair';
const purchase = { merchant: 'Store', date: new Date('2026-06-01'), amount: 100, categoryId: 1, isShared: true, splitType: 'fixed' as const, splitValue: 30, isSettled: false, isEssential: false, isSubscription: false };
beforeEach(async () => { await db.delete(); await db.open(); });
describe('purchase allocations', () => {
	it('allocates fixed shares proportionally', () => { expect(allocatePartnerShares([60, 40], true, 'fixed', 30)).toEqual([18, 12]); });
	it('allocates purchase-rounded percentage shares and resolves ties by line order', () => {
		expect(allocatePartnerShares([0.01, 0.01, 0.01], true, 'percentage', 0.5)).toEqual([0.01, 0.01, 0]);
		expect(allocatePartnerShares([1, 1, 1], true, 'fixed', 1)).toEqual([0.34, 0.33, 0.33]);
	});
	it.each([NaN, Infinity, -1, 101])('rejects invalid share %s', (value) => expect(() => allocatePartnerShares([60, 40], true, 'fixed', value)).toThrow());
	it('stores allocated fixed values and editing recomputes the whole group', async () => {
		const ids = await addSplitTransaction(purchase, [{ categoryId: 1, amount: 60 }, { categoryId: 2, amount: 40 }]);
		const parentId = (await db.transactions.get(ids[0]))!.parentTransactionId!;
		expect((await getSplitChildren(parentId)).map((c) => c.splitValue)).toEqual([18, 12]);
		await updateSplitGroup(parentId, { ...purchase, splitValue: 25 }, [{ categoryId: 1, amount: 50 }, { categoryId: 2, amount: 50 }]);
		expect((await getSplitChildren(parentId)).map((c) => c.partnerShare)).toEqual([12.5, 12.5]);
		expect((await db.transactions.get(parentId))?.splitValue).toBe(25);
	});
	it('rejects invalid group edits without deleting original children', async () => {
		const ids = await addSplitTransaction(purchase, [{ categoryId: 1, amount: 60 }, { categoryId: 2, amount: 40 }]);
		const parentId = (await db.transactions.get(ids[0]))!.parentTransactionId!;
		await expect(updateSplitGroup(parentId, purchase, [{ categoryId: 1, amount: NaN }, { categoryId: 2, amount: 40 }])).rejects.toThrow();
		expect((await getSplitChildren(parentId)).map((c) => c.id)).toEqual(ids);
	});
});
async function historical() {
	const ids = await addSplitTransaction(purchase, [{ categoryId: 1, amount: 60 }, { categoryId: 2, amount: 40 }]);
	for (const id of ids) await db.transactions.update(id, { partnerShare: 30, splitValue: 30 });
	return ids;
}
describe('historical repair selection', () => {
	it('previews without writes and requires explicit selection', async () => {
		await historical(); const rows = await previewSplitRepairs();
		expect(rows[0]).toMatchObject({ existingTotal: 60, proposedTotal: 30, reason: null, allocations: [18, 12] });
		await expect(applySplitRepairs([])).rejects.toThrow('Select');
		expect((await previewSplitRepairs())[0].existingTotal).toBe(60);
		await applySplitRepairs(rows);
		expect(await previewSplitRepairs()).toEqual([]);
	});
	it.each(['settled', 'deleted', 'incomplete', 'ambiguous'])('flags %s groups for manual review', async (kind) => {
		const ids = await historical();
		if (kind === 'settled') await db.transactions.update(ids[0], { isSettled: true });
		if (kind === 'deleted') await db.transactions.update(ids[0], { isDeleted: true });
		if (kind === 'incomplete') await db.transactions.delete(ids[0]);
		if (kind === 'ambiguous') await db.transactions.update(ids[0], { splitValue: 12 });
		const rows = await previewSplitRepairs(); expect(rows[0].reason).toBeTruthy();
		await expect(applySplitRepairs(rows)).rejects.toThrow('Manual review');
	});
	it('revalidates every selected record and rolls back if any changed', async () => {
		const ids = await historical(); const rows = await previewSplitRepairs();
		await db.transactions.update(ids[0], { notes: 'changed after preview' });
		await expect(applySplitRepairs(rows)).rejects.toThrow('changed since preview');
		expect((await db.transactions.get(ids[1]))?.partnerShare).toBe(30);
	});
});
