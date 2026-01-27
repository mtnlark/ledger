import { db, type SavingsAccount } from '$lib/db';
import { liveQuery } from 'dexie';
import { persistData } from '$lib/storage';

// Reactive savings accounts list
export const savingsAccounts = liveQuery(() => db.savingsAccounts.orderBy('sortOrder').toArray());

// Get all savings accounts sorted by sortOrder
export async function getAllSavingsAccounts(): Promise<SavingsAccount[]> {
	return db.savingsAccounts.orderBy('sortOrder').toArray();
}

// Get a single savings account by ID
export async function getSavingsAccount(id: number): Promise<SavingsAccount | undefined> {
	return db.savingsAccounts.get(id);
}

// Add a new savings account
export async function addSavingsAccount(
	account: Omit<SavingsAccount, 'id' | 'createdAt' | 'updatedAt'>
): Promise<number> {
	const now = new Date();

	// Only set currentBalance for savings type accounts
	const currentBalance = account.accountType === 'savings' ? (account.currentBalance ?? 0) : undefined;

	const newAccount: Omit<SavingsAccount, 'id'> = {
		...account,
		currentBalance,
		createdAt: now,
		updatedAt: now
	};

	const id = (await db.savingsAccounts.add(newAccount)) as number;
	await persistData();
	return id;
}

// Update a savings account
export async function updateSavingsAccount(
	id: number,
	updates: Partial<Omit<SavingsAccount, 'id' | 'createdAt'>>
): Promise<void> {
	const existing = await db.savingsAccounts.get(id);
	if (!existing) return;

	await db.savingsAccounts.update(id, {
		...updates,
		updatedAt: new Date()
	});
	await persistData();
}

// Delete a savings account
export async function deleteSavingsAccount(id: number): Promise<void> {
	await db.savingsAccounts.delete(id);
	await persistData();
}

// Reorder savings accounts based on an array of IDs
export async function reorderSavingsAccounts(orderedIds: number[]): Promise<void> {
	await db.transaction('rw', db.savingsAccounts, async () => {
		for (let i = 0; i < orderedIds.length; i++) {
			await db.savingsAccounts.update(orderedIds[i], { sortOrder: i + 1 });
		}
	});
	await persistData();
}

// Internal helper: Update account balance by a delta amount
// Only affects 'savings' type accounts
export async function updateAccountBalance(id: number, delta: number): Promise<void> {
	const account = await db.savingsAccounts.get(id);
	if (!account || account.accountType !== 'savings') return;

	const newBalance = (account.currentBalance ?? 0) + delta;
	await db.savingsAccounts.update(id, {
		currentBalance: newBalance,
		updatedAt: new Date()
	});
}
