import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, initializeDatabase } from '$lib/db';
import {
	getAllLinkedAccounts,
	addLinkedAccount,
	updateLinkedAccount,
	deleteLinkedAccount,
	recordBalance,
	setSyncStatus,
	getAllSnapshots,
	swapLinkedAccountOrder
} from './linkedAccounts';

describe('LinkedAccounts Operations', () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
		await initializeDatabase();
	});

	afterEach(async () => {
		await db.delete();
	});

	function newAccount(overrides = {}) {
		return addLinkedAccount({
			name: 'Chase Checking',
			institution: 'Chase',
			accountClass: 'asset',
			accountType: 'checking',
			initialBalance: 1200,
			...overrides
		});
	}

	it('adds an account with defaults and an opening snapshot', async () => {
		const id = await newAccount();
		const accounts = await getAllLinkedAccounts();
		expect(accounts).toHaveLength(1);
		expect(accounts[0]).toMatchObject({
			id,
			currentBalance: 1200,
			source: 'manual',
			lastSyncStatus: 'never',
			isActive: true,
			sortOrder: 0
		});

		const snapshots = await getAllSnapshots();
		expect(snapshots).toHaveLength(1);
		expect(snapshots[0]).toMatchObject({ accountId: id, balance: 1200, source: 'manual' });
	});

	it('assigns increasing sortOrder', async () => {
		await newAccount();
		await newAccount({ name: 'Fidelity' });
		const accounts = await getAllLinkedAccounts();
		expect(accounts.map((a) => a.sortOrder)).toEqual([0, 1]);
	});

	it('recordBalance updates the account and overwrites the same-day snapshot', async () => {
		const id = await newAccount();
		await recordBalance(id, 1500, 'manual');
		await recordBalance(id, 1600, 'simplefin');

		const accounts = await getAllLinkedAccounts();
		expect(accounts[0].currentBalance).toBe(1600);

		// Opening snapshot was today too — all three writes collapse to one row
		const snapshots = await getAllSnapshots();
		expect(snapshots).toHaveLength(1);
		expect(snapshots[0]).toMatchObject({ balance: 1600, source: 'simplefin' });
	});

	it('keeps snapshots from different days separate', async () => {
		const id = await newAccount();
		// Backdate the opening snapshot to simulate yesterday's history
		const snapshots = await getAllSnapshots();
		const yesterday = new Date();
		yesterday.setDate(yesterday.getDate() - 1);
		await db.balanceSnapshots.update(snapshots[0].id!, { capturedAt: yesterday });

		await recordBalance(id, 1300, 'manual');
		expect(await getAllSnapshots()).toHaveLength(2);
	});

	it('updateLinkedAccount patches fields without touching snapshots', async () => {
		const id = await newAccount();
		await updateLinkedAccount(id, { name: 'Chase Premier', isActive: false });
		const accounts = await db.linkedAccounts.toArray();
		expect(accounts[0]).toMatchObject({ name: 'Chase Premier', isActive: false });
		expect(await getAllSnapshots()).toHaveLength(1);
	});

	it('setSyncStatus records status and optional timestamp', async () => {
		const id = await newAccount();
		const when = new Date();
		await setSyncStatus(id, 'ok', when);
		const account = (await getAllLinkedAccounts())[0];
		expect(account.lastSyncStatus).toBe('ok');
		expect(account.lastSyncedAt?.getTime()).toBe(when.getTime());

		await setSyncStatus(id, 'error');
		const after = (await getAllLinkedAccounts())[0];
		expect(after.lastSyncStatus).toBe('error');
		expect(after.lastSyncedAt?.getTime()).toBe(when.getTime()); // unchanged
	});

	it('swapLinkedAccountOrder exchanges positions', async () => {
		const a = await newAccount();
		const b = await newAccount({ name: 'Fidelity' });
		await swapLinkedAccountOrder(a, b);
		const accounts = await getAllLinkedAccounts();
		expect(accounts.map((x) => x.name)).toEqual(['Fidelity', 'Chase Checking']);
	});

	it('deleteLinkedAccount cascades its snapshots', async () => {
		const a = await newAccount();
		const b = await newAccount({ name: 'Fidelity' });
		await deleteLinkedAccount(a);

		expect(await getAllLinkedAccounts()).toHaveLength(1);
		const snapshots = await getAllSnapshots();
		expect(snapshots).toHaveLength(1);
		expect(snapshots[0].accountId).toBe(b);
	});
});
