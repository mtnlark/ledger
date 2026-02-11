import { db, type SavingsAccount, type CompletedGoal } from '$lib/db';
import { liveQuery } from 'dexie';
import { persistData } from '$lib/storage';
import { getSettings, updateSettings } from './settings';

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

// Move a savings account up one position
export async function moveSavingsAccountUp(id: number): Promise<void> {
	const accounts = await db.savingsAccounts.orderBy('sortOrder').toArray();
	const index = accounts.findIndex((a) => a.id === id);

	// Can't move up if already at top
	if (index <= 0) return;

	const current = accounts[index];
	const above = accounts[index - 1];

	// Swap sort orders
	await db.transaction('rw', db.savingsAccounts, async () => {
		await db.savingsAccounts.update(current.id!, { sortOrder: above.sortOrder });
		await db.savingsAccounts.update(above.id!, { sortOrder: current.sortOrder });
	});
	await persistData();
}

// Move a savings account down one position
export async function moveSavingsAccountDown(id: number): Promise<void> {
	const accounts = await db.savingsAccounts.orderBy('sortOrder').toArray();
	const index = accounts.findIndex((a) => a.id === id);

	// Can't move down if already at bottom
	if (index < 0 || index >= accounts.length - 1) return;

	const current = accounts[index];
	const below = accounts[index + 1];

	// Swap sort orders
	await db.transaction('rw', db.savingsAccounts, async () => {
		await db.savingsAccounts.update(current.id!, { sortOrder: below.sortOrder });
		await db.savingsAccounts.update(below.id!, { sortOrder: current.sortOrder });
	});
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

/**
 * Mark a savings goal as complete, archiving it to settings and clearing
 * the goal fields from the account.
 * @param accountId - The savings account ID with the completed goal
 */
export async function completeGoal(accountId: number): Promise<void> {
	const account = await getSavingsAccount(accountId);
	if (!account || account.targetAmount === undefined) {
		return; // No goal to complete
	}

	// Archive the completed goal to settings
	const settings = await getSettings();
	const completedGoal: CompletedGoal = {
		accountName: account.name,
		targetAmount: account.targetAmount,
		completedDate: new Date().toISOString(),
		icon: account.icon,
		color: account.color
	};

	await updateSettings({
		completedGoals: [...(settings.completedGoals ?? []), completedGoal]
	});

	// Clear the goal from the account
	await db.savingsAccounts.update(accountId, {
		targetAmount: undefined,
		targetDate: undefined,
		updatedAt: new Date()
	});

	await persistData();
}
