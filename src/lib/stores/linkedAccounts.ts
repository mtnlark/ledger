import { liveQuery } from 'dexie';
import { db, type LinkedAccount, type BalanceSnapshot, type BalanceSource, type SyncStatus } from '$lib/db';
import { persistData } from '$lib/storage';
import { roundCurrency } from '$lib/utils/currency';

/**
 * Net-worth accounts. Deliberately separate from SavingsAccount: savings tracks
 * intent (contributions, goals); these track actual balances. Synced balances
 * must never write to SavingsAccount.currentBalance.
 *
 * Multi-window rule: like all stores, writes here run only in the main window.
 */

export const linkedAccounts = liveQuery(() => db.linkedAccounts.orderBy('sortOrder').toArray());

export async function getAllLinkedAccounts(): Promise<LinkedAccount[]> {
	return db.linkedAccounts.orderBy('sortOrder').toArray();
}

export async function getLinkedAccount(id: number): Promise<LinkedAccount | undefined> {
	return db.linkedAccounts.get(id);
}

export interface NewLinkedAccount {
	name: string;
	institution: string;
	accountClass: LinkedAccount['accountClass'];
	accountType: LinkedAccount['accountType'];
	initialBalance: number;
	source?: BalanceSource;
	simplefinId?: string;
}

export async function addLinkedAccount(input: NewLinkedAccount): Promise<number> {
	const now = new Date();
	const all = await db.linkedAccounts.toArray();
	const sortOrder = all.reduce((max, a) => Math.max(max, a.sortOrder), -1) + 1;
	const balance = roundCurrency(input.initialBalance);

	const id = (await db.linkedAccounts.add({
		name: input.name,
		institution: input.institution,
		accountClass: input.accountClass,
		accountType: input.accountType,
		currentBalance: balance,
		source: input.source ?? 'manual',
		simplefinId: input.simplefinId,
		lastSyncStatus: 'never',
		sortOrder,
		isActive: true,
		createdAt: now,
		updatedAt: now
	})) as number;

	// The opening balance is the first history point
	await upsertSnapshot(id, balance, input.source ?? 'manual', now);
	await persistData();
	return id;
}

export async function updateLinkedAccount(
	id: number,
	updates: Partial<Omit<LinkedAccount, 'id' | 'createdAt'>>
): Promise<void> {
	await db.linkedAccounts.update(id, { ...updates, updatedAt: new Date() });
	await persistData();
}

/**
 * Swap display positions of two accounts (manual reordering).
 * Intentionally does not bump updatedAt — the UI shows that as the
 * balance-updated date, and reordering doesn't change balances.
 */
export async function swapLinkedAccountOrder(idA: number, idB: number): Promise<void> {
	const [a, b] = await Promise.all([db.linkedAccounts.get(idA), db.linkedAccounts.get(idB)]);
	if (!a || !b) return;
	await db.linkedAccounts.update(idA, { sortOrder: b.sortOrder });
	await db.linkedAccounts.update(idB, { sortOrder: a.sortOrder });
	await persistData();
}

/** Deletes the account and its entire snapshot history. */
export async function deleteLinkedAccount(id: number): Promise<void> {
	await db.balanceSnapshots.where('accountId').equals(id).delete();
	await db.linkedAccounts.delete(id);
	await persistData();
}

/**
 * Record a balance: updates currentBalance AND upserts the day's snapshot.
 * At most one snapshot per account per day — same-day records overwrite.
 */
export async function recordBalance(
	accountId: number,
	balance: number,
	source: BalanceSource
): Promise<void> {
	const rounded = roundCurrency(balance);
	const now = new Date();
	await db.linkedAccounts.update(accountId, { currentBalance: rounded, updatedAt: now });
	await upsertSnapshot(accountId, rounded, source, now);
	await persistData();
}

/** Update sync bookkeeping after a SimpleFIN attempt (does not touch balance). */
export async function setSyncStatus(
	accountId: number,
	status: SyncStatus,
	syncedAt?: Date
): Promise<void> {
	const updates: Partial<LinkedAccount> = { lastSyncStatus: status, updatedAt: new Date() };
	if (syncedAt) updates.lastSyncedAt = syncedAt;
	await db.linkedAccounts.update(accountId, updates);
	await persistData();
}

export async function getAllSnapshots(): Promise<BalanceSnapshot[]> {
	return db.balanceSnapshots.orderBy('capturedAt').toArray();
}

async function upsertSnapshot(
	accountId: number,
	balance: number,
	source: BalanceSource,
	when: Date
): Promise<void> {
	const dayStart = new Date(when.getFullYear(), when.getMonth(), when.getDate());
	const dayEnd = new Date(when.getFullYear(), when.getMonth(), when.getDate(), 23, 59, 59, 999);
	const existing = await db.balanceSnapshots
		.where('[accountId+capturedAt]')
		.between([accountId, dayStart], [accountId, dayEnd], true, true)
		.first();

	if (existing) {
		await db.balanceSnapshots.update(existing.id!, { balance, source, capturedAt: when });
	} else {
		await db.balanceSnapshots.add({ accountId, balance, source, capturedAt: when });
	}
}
