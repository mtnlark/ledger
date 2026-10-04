import { db, type SavingsAccount, type CompletedGoal } from '$lib/db';
import { liveQuery } from 'dexie';
import { sumCurrency } from '$lib/utils/currency';
import { runMutation } from '$lib/storage/mutation';
import { getSettings, updateSettings } from './settings';

export const savingsAccounts = liveQuery(() => db.savingsAccounts.orderBy('sortOrder').toArray());

export async function getAllSavingsAccounts(): Promise<SavingsAccount[]> {
	return db.savingsAccounts.orderBy('sortOrder').toArray();
}

export async function getSavingsAccount(id: number): Promise<SavingsAccount | undefined> {
	return db.savingsAccounts.get(id);
}

export async function addSavingsAccount(
	account: Omit<SavingsAccount, 'id' | 'createdAt' | 'updatedAt'>
): Promise<number> {
	return runMutation(['savingsAccounts', 'settings', 'savingsContributions', 'linkedAccounts'], async () => {
		await validateAllocation(account);
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
		return id;
	});
}

export async function updateSavingsAccount(
	id: number,
	updates: Partial<Omit<SavingsAccount, 'id' | 'createdAt'>>
): Promise<void> {
	return runMutation(['savingsAccounts', 'settings', 'savingsContributions', 'linkedAccounts'], async () => {
		const existing = await db.savingsAccounts.get(id);
		if (!existing) return;
		if (updates.currentBalance !== undefined || updates.linkedAccountId !== undefined) await validateAllocation({ ...existing, ...updates }, id);

		await db.savingsAccounts.update(id, {
			...updates,
			updatedAt: new Date()
		});
	});
}

async function validateAllocation(account: Pick<SavingsAccount, 'linkedAccountId' | 'currentBalance'>, id?: number): Promise<void> {
	if (account.linkedAccountId === undefined) return;
	const bank = await db.linkedAccounts.get(account.linkedAccountId);
	if (!bank?.isActive || bank.accountClass !== 'asset' || bank.accountType !== 'savings') throw new Error('Choose an active savings bank account');
	const others = (await db.savingsAccounts.toArray()).filter(a => a.id !== id && a.linkedAccountId === bank.id);
	if (sumCurrency([account.currentBalance ?? 0, ...others.map(a => a.currentBalance ?? 0)]) > bank.currentBalance) throw new Error('Allocations exceed the latest bank balance');
}

export async function deleteSavingsAccount(id: number): Promise<void> {
	return runMutation(['savingsAccounts', 'settings', 'savingsContributions'], async () => {
		const settings = await getSettings();
		if (settings.planning) await updateSettings({ planning: { ...settings.planning, savingsPlans: settings.planning.savingsPlans.filter(p => p.accountId !== id) } });
		await db.savingsContributions.where('accountId').equals(id).delete();
		await db.savingsAccounts.delete(id);
	});
}

export async function moveSavingsAccountUp(id: number): Promise<void> {
	return runMutation(['savingsAccounts', 'settings', 'savingsContributions'], async () => {
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
	});
}

export async function moveSavingsAccountDown(id: number): Promise<void> {
	return runMutation(['savingsAccounts', 'settings', 'savingsContributions'], async () => {
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
	});
}

export async function reorderSavingsAccounts(orderedIds: number[]): Promise<void> {
	return runMutation(['savingsAccounts', 'settings', 'savingsContributions'], async () => {
		await db.transaction('rw', db.savingsAccounts, async () => {
			for (let i = 0; i < orderedIds.length; i++) {
				await db.savingsAccounts.update(orderedIds[i], { sortOrder: i + 1 });
			}
		});
	});
}

// Internal helper: Update account balance by a delta amount
// Only affects 'savings' type accounts
export async function updateAccountBalance(id: number, delta: number): Promise<void> {
	const account = await db.savingsAccounts.get(id);
	if (!account || account.accountType !== 'savings') return;

	const newBalance = sumCurrency([account.currentBalance ?? 0, delta]);
	if (!Number.isFinite(newBalance)) throw new Error('Invalid savings balance');
	if (newBalance < 0) throw new Error('Savings event exceeds allocated funding');
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
	return runMutation(['savingsAccounts', 'settings', 'savingsContributions'], async () => {
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
	});
}
