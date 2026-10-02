import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, DEFAULT_SETTINGS } from '$lib/db';
import { resetStorageState } from './index';
import { dehydrateAll } from './serialization';
import { applyHistoricalRepairs, prepareHistoricalRepair, previewHistoricalData } from './historical-repair';
import { checksum, checksumText, parseBackup } from './backup';
const mocks = vi.hoisted(() => ({ original: vi.fn(), save: vi.fn() }));
vi.mock('./index', async (original) => ({ ...await original<typeof import('./index')>(), preserveOriginalSnapshot: mocks.original, persistData: mocks.save }));
const transaction = () => ({ id: 1, merchant: 'History', amount: 20, categoryId: 99, date: new Date(2026, 8, 1), isShared: false, splitType: 'percentage' as const, splitValue: 0.5, partnerShare: 0, isSettled: false, isEssential: false, isSubscription: false, createdAt: new Date(), updatedAt: new Date() });
beforeEach(async () => {
	resetStorageState(); await db.delete(); await db.open();
	await db.settings.put(DEFAULT_SETTINGS);
	mocks.original.mockReset().mockResolvedValue('/original.json'); mocks.save.mockReset().mockResolvedValue(undefined);
});
describe('reviewed historical repairs', () => {
	it('previews missing category transaction and budget references without writing, then preserves the original and restores strict validity', async () => {
		await db.transactions.put(transaction());
		await db.categoryBudgets.put({ id: 2, categoryId: 99, month: '2026-09', budgetAmount: 50, createdAt: new Date(), updatedAt: new Date() });
		const before = await dehydrateAll(); const preview = await previewHistoricalData();
		expect(preview.diagnostics).toHaveLength(1);
		expect(preview.diagnostics[0].references).toHaveLength(2);
		expect(await db.categories.count()).toBe(0); expect(mocks.original).not.toHaveBeenCalled();
		const plan = prepareHistoricalRepair(preview, [{ kind: 'category', id: 99, name: 'Historical category' }]);
		expect(await db.categories.count()).toBe(0);
		await applyHistoricalRepairs(plan);
		expect(mocks.original.mock.calls[0][0].transactions).toEqual(before.transactions);
		expect(await db.categories.get(99)).toMatchObject({ isActive: false, name: 'Historical category' });
		expect((await db.transactions.get(1))?.categoryId).toBe(99);
		expect(mocks.save).toHaveBeenCalledOnce();
		await expect(parseBackup(JSON.stringify(await dehydrateAll()))).resolves.toBeDefined();
	});
	it.each(['recreate', 'delete_contributions'] as const)('requires the orphan account choice %s', async (action) => {
		await db.savingsContributions.put({ id: 7, accountId: 99, amount: 50, date: new Date(), source: 'other', createdAt: new Date(), updatedAt: new Date() });
		const preview = await previewHistoricalData();
		const choice = action === 'recreate' ? { kind: 'account' as const, id: 99, action, name: 'Recovered fund', accountType: 'investment' as const, confirmedBalance: 500 } : { kind: 'account' as const, id: 99, action };
		const plan = prepareHistoricalRepair(preview, [choice]);
		await applyHistoricalRepairs(plan);
		if (action === 'recreate') { expect((await db.savingsAccounts.get(99))?.currentBalance).toBe(500); expect(await db.savingsContributions.count()).toBe(1); }
		else { expect(await db.savingsContributions.count()).toBe(0); expect(await db.savingsAccounts.count()).toBe(0); }
	});
	it('shows balance and contributions as context and never infers an opening balance', async () => {
		await db.savingsAccounts.put({ id: 1, name: 'Fund', accountType: 'savings', currentBalance: 700, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() });
		await db.savingsContributions.put({ id: 1, accountId: 1, amount: 50, date: new Date(), source: 'other', createdAt: new Date(), updatedAt: new Date() });
		const preview = await previewHistoricalData(); expect(preview.accounts[0]).toMatchObject({ balance: 700, contributionTotal: 50 });
		await applyHistoricalRepairs(prepareHistoricalRepair(preview, [{ kind: 'balance', id: 1, confirmedBalance: 1234.56 }]));
		expect((await db.savingsAccounts.get(1))?.currentBalance).toBe(1234.56);
	});
	it('rejects a stale preview before preserving or changing anything', async () => {
		await db.transactions.put(transaction());
		const plan = prepareHistoricalRepair(await previewHistoricalData(), [{ kind: 'category', id: 99, name: 'History' }]);
		await db.transactions.update(1, { notes: 'Edited after review' });
		await expect(applyHistoricalRepairs(plan)).rejects.toThrow('changed since preview');
		expect(mocks.original).not.toHaveBeenCalled(); expect(await db.categories.count()).toBe(0);
	});
	it('aborts if original preservation fails and rolls back a failed atomic replacement', async () => {
		await db.transactions.put(transaction());
		const plan = prepareHistoricalRepair(await previewHistoricalData(), [{ kind: 'category', id: 99, name: 'History' }]);
		mocks.original.mockRejectedValueOnce(new Error('Original readback failed'));
		await expect(applyHistoricalRepairs(plan)).rejects.toThrow('readback'); expect(await db.transactions.count()).toBe(1);
		const spy = vi.spyOn(db.categories, 'bulkPut').mockRejectedValueOnce(new Error('DB write failed'));
		await expect(applyHistoricalRepairs(plan)).rejects.toThrow('DB write failed'); spy.mockRestore();
		expect(await db.transactions.count()).toBe(1); expect(await db.categories.count()).toBe(0); expect(mocks.save).not.toHaveBeenCalled();
	});
	it('retains applied records after a save failure and never replays a repair plan', async () => {
		await db.transactions.put(transaction());
		const plan = prepareHistoricalRepair(await previewHistoricalData(), [{ kind: 'category', id: 99, name: 'History' }]);
		mocks.save.mockRejectedValueOnce(new Error('Disk full'));
		await expect(applyHistoricalRepairs(plan)).rejects.toThrow('Disk full');
		expect(await db.categories.count()).toBe(1);
		await expect(applyHistoricalRepairs(plan)).rejects.toThrow('Review');
	});
});
describe('selected damaged files', () => {
	async function damaged() {
		const data = await dehydrateAll(); data.transactions = [{ ...transaction(), date: null as unknown as Date }];
		return JSON.stringify({ ...data, checksum: await checksum(data) });
	}
	it('requires supplied date and reference corrections, preserves both originals and imports a restorable snapshot', async () => {
		const text = await damaged(); const preview = await previewHistoricalData({ name: 'damaged.json', text });
		expect(preview.diagnostics.map((d) => d.kind)).toEqual(['date', 'missing_category']);
		await expect(async () => prepareHistoricalRepair(preview, [{ kind: 'category', id: 99, name: 'History' }])).rejects.toThrow('date');
		const plan = prepareHistoricalRepair(preview, [{ kind: 'category', id: 99, name: 'History' }, { kind: 'field', diagnosticId: 'transactions:1:date', value: '2026-09-01' }]);
		await applyHistoricalRepairs(plan);
		expect(mocks.original).toHaveBeenCalledTimes(2); expect(mocks.original.mock.calls[1][0]).toBe(text);
		expect((await db.transactions.get(1))?.date).toEqual(new Date(2026, 8, 1));
		await expect(parseBackup(JSON.stringify(await dehydrateAll()))).resolves.toBeDefined();
	});
	it('blocks unparseable, mismatched, unsigned and unsupported structural damage', async () => {
		await expect(previewHistoricalData({ name: 'broken', text: '{' })).rejects.toThrow();
		const text = await damaged(); const data = JSON.parse(text); data.checksum = 'bad';
		await expect(previewHistoricalData({ name: 'checksum', text: JSON.stringify(data) })).rejects.toThrow('checksum');
		delete data.checksum;
		await expect(previewHistoricalData({ name: 'unsigned', text: JSON.stringify(data) })).rejects.toThrow('checksum');
		data.transactions[0].amount = 'broken'; data.checksum = await checksum(data);
		await expect(previewHistoricalData({ name: 'structure', text: JSON.stringify(data) })).rejects.toThrow('finite');
	});
});

it('reviews a checksum-verified preserved original but blocks a corrupted envelope', async () => {
	const data = await dehydrateAll(); data.transactions = [transaction()];
	const content = JSON.stringify({ ...data, checksum: await checksum(data) });
	const envelope = { version: 'ledger-original-1', content, checksum: await checksumText(content) };
	const preview = await previewHistoricalData({ name: 'original.json', text: JSON.stringify(envelope) });
	expect(preview.diagnostics[0].kind).toBe('missing_category');
	envelope.content += ' ';
	await expect(previewHistoricalData({ name: 'bad-original.json', text: JSON.stringify(envelope) })).rejects.toThrow('Original snapshot checksum');
});
it('keeps exposed review context separate from the immutable repair source', async () => {
	await db.transactions.put(transaction());
	const preview = await previewHistoricalData();
	preview.diagnostics[0].references![0].context!.merchant = 'Unapproved change';
	await applyHistoricalRepairs(prepareHistoricalRepair(preview, [{ kind: 'category', id: 99, name: 'History' }]));
	expect((await db.transactions.get(1))?.merchant).toBe('History');
});
