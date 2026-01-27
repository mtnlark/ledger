import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, initializeDatabase, type SavingsAccount } from '$lib/db';
import {
	getAllSavingsAccounts,
	getSavingsAccount,
	addSavingsAccount,
	updateSavingsAccount,
	deleteSavingsAccount,
	reorderSavingsAccounts
} from './savingsAccounts';

describe('SavingsAccount Operations', () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
		await initializeDatabase();
		// Clear seeded savings accounts to start with empty table for testing
		await db.savingsAccounts.clear();
	});

	afterEach(async () => {
		await db.delete();
	});

	describe('addSavingsAccount', () => {
		it('creates account with auto-incrementing ID', async () => {
			const id1 = await addSavingsAccount({
				name: 'Emergency Fund',
				accountType: 'savings',
				icon: '☔',
				color: '#5B8C5A',
				sortOrder: 1
			});

			const id2 = await addSavingsAccount({
				name: 'Vacation Fund',
				accountType: 'savings',
				icon: '✈️',
				color: '#C45D3A',
				sortOrder: 2
			});

			expect(id1).toBeGreaterThan(0);
			expect(id2).toBeGreaterThan(id1);
		});

		it('sets createdAt and updatedAt timestamps', async () => {
			const beforeCreate = new Date();

			const id = await addSavingsAccount({
				name: 'Emergency Fund',
				accountType: 'savings',
				icon: '☔',
				color: '#5B8C5A',
				sortOrder: 1
			});

			const afterCreate = new Date();
			const account = await getSavingsAccount(id);

			expect(account?.createdAt).toBeInstanceOf(Date);
			expect(account?.updatedAt).toBeInstanceOf(Date);
			expect(account!.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
			expect(account!.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
		});

		it('initializes balance to 0 if not provided for savings type', async () => {
			const id = await addSavingsAccount({
				name: 'Emergency Fund',
				accountType: 'savings',
				icon: '☔',
				color: '#5B8C5A',
				sortOrder: 1
			});

			const account = await getSavingsAccount(id);
			expect(account?.currentBalance).toBe(0);
		});

		it('allows custom initial balance for savings type', async () => {
			const id = await addSavingsAccount({
				name: 'Emergency Fund',
				accountType: 'savings',
				icon: '☔',
				color: '#5B8C5A',
				sortOrder: 1,
				currentBalance: 5000
			});

			const account = await getSavingsAccount(id);
			expect(account?.currentBalance).toBe(5000);
		});

		it('does not set balance for retirement accounts', async () => {
			const id = await addSavingsAccount({
				name: '401(k)',
				accountType: 'retirement',
				icon: '🌅',
				color: '#C45D3A',
				sortOrder: 1
			});

			const account = await getSavingsAccount(id);
			expect(account?.currentBalance).toBeUndefined();
		});

		it('does not set balance for investment accounts', async () => {
			const id = await addSavingsAccount({
				name: 'Brokerage',
				accountType: 'investment',
				icon: '🪴',
				color: '#8B7355',
				sortOrder: 1
			});

			const account = await getSavingsAccount(id);
			expect(account?.currentBalance).toBeUndefined();
		});

		it('stores all required fields correctly', async () => {
			const id = await addSavingsAccount({
				name: 'My Fund',
				accountType: 'savings',
				icon: '💰',
				color: '#123456',
				sortOrder: 5
			});

			const account = await getSavingsAccount(id);
			expect(account?.name).toBe('My Fund');
			expect(account?.accountType).toBe('savings');
			expect(account?.icon).toBe('💰');
			expect(account?.color).toBe('#123456');
			expect(account?.sortOrder).toBe(5);
		});
	});

	describe('getAllSavingsAccounts', () => {
		it('returns all accounts sorted by sortOrder', async () => {
			await addSavingsAccount({
				name: 'Third',
				accountType: 'savings',
				sortOrder: 3
			});
			await addSavingsAccount({
				name: 'First',
				accountType: 'savings',
				sortOrder: 1
			});
			await addSavingsAccount({
				name: 'Second',
				accountType: 'savings',
				sortOrder: 2
			});

			const accounts = await getAllSavingsAccounts();
			expect(accounts).toHaveLength(3);
			expect(accounts[0].name).toBe('First');
			expect(accounts[1].name).toBe('Second');
			expect(accounts[2].name).toBe('Third');
		});

		it('returns empty array when no accounts exist', async () => {
			const accounts = await getAllSavingsAccounts();
			expect(accounts).toEqual([]);
		});
	});

	describe('getSavingsAccount', () => {
		it('returns account by ID', async () => {
			const id = await addSavingsAccount({
				name: 'Test Account',
				accountType: 'savings',
				sortOrder: 1
			});

			const account = await getSavingsAccount(id);
			expect(account).toBeDefined();
			expect(account?.name).toBe('Test Account');
		});

		it('returns undefined for non-existent ID', async () => {
			const account = await getSavingsAccount(99999);
			expect(account).toBeUndefined();
		});
	});

	describe('updateSavingsAccount', () => {
		it('updates specified fields', async () => {
			const id = await addSavingsAccount({
				name: 'Original Name',
				accountType: 'savings',
				icon: '📦',
				sortOrder: 1
			});

			await updateSavingsAccount(id, { name: 'New Name', icon: '🎁' });

			const account = await getSavingsAccount(id);
			expect(account?.name).toBe('New Name');
			expect(account?.icon).toBe('🎁');
		});

		it('updates updatedAt timestamp', async () => {
			const id = await addSavingsAccount({
				name: 'Test',
				accountType: 'savings',
				sortOrder: 1
			});

			const original = await getSavingsAccount(id);
			const originalUpdatedAt = original!.updatedAt;

			// Wait a bit to ensure timestamp differs
			await new Promise((resolve) => setTimeout(resolve, 10));

			await updateSavingsAccount(id, { name: 'Updated' });

			const updated = await getSavingsAccount(id);
			expect(updated!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
		});

		it('preserves unmodified fields', async () => {
			const id = await addSavingsAccount({
				name: 'Test',
				accountType: 'savings',
				icon: '💰',
				color: '#ff0000',
				sortOrder: 5
			});

			await updateSavingsAccount(id, { name: 'New Name' });

			const account = await getSavingsAccount(id);
			expect(account?.icon).toBe('💰');
			expect(account?.color).toBe('#ff0000');
			expect(account?.sortOrder).toBe(5);
			expect(account?.accountType).toBe('savings');
		});

		it('does nothing for non-existent ID', async () => {
			// Should not throw
			await expect(updateSavingsAccount(99999, { name: 'Test' })).resolves.toBeUndefined();
		});
	});

	describe('deleteSavingsAccount', () => {
		it('removes account from database', async () => {
			const id = await addSavingsAccount({
				name: 'To Delete',
				accountType: 'savings',
				sortOrder: 1
			});

			await deleteSavingsAccount(id);

			const account = await getSavingsAccount(id);
			expect(account).toBeUndefined();
		});

		it('handles non-existent ID gracefully', async () => {
			// Should not throw
			await expect(deleteSavingsAccount(99999)).resolves.toBeUndefined();
		});
	});

	describe('reorderSavingsAccounts', () => {
		it('updates sortOrder for all accounts atomically', async () => {
			const id1 = await addSavingsAccount({
				name: 'First',
				accountType: 'savings',
				sortOrder: 1
			});
			const id2 = await addSavingsAccount({
				name: 'Second',
				accountType: 'savings',
				sortOrder: 2
			});
			const id3 = await addSavingsAccount({
				name: 'Third',
				accountType: 'savings',
				sortOrder: 3
			});

			// Reverse order
			await reorderSavingsAccounts([id3, id2, id1]);

			const accounts = await getAllSavingsAccounts();
			expect(accounts[0].id).toBe(id3);
			expect(accounts[0].sortOrder).toBe(1);
			expect(accounts[1].id).toBe(id2);
			expect(accounts[1].sortOrder).toBe(2);
			expect(accounts[2].id).toBe(id1);
			expect(accounts[2].sortOrder).toBe(3);
		});

		it('maintains sortOrder sequence starting from 1', async () => {
			const id1 = await addSavingsAccount({
				name: 'A',
				accountType: 'savings',
				sortOrder: 10
			});
			const id2 = await addSavingsAccount({
				name: 'B',
				accountType: 'savings',
				sortOrder: 20
			});

			await reorderSavingsAccounts([id2, id1]);

			const accounts = await getAllSavingsAccounts();
			expect(accounts[0].sortOrder).toBe(1);
			expect(accounts[1].sortOrder).toBe(2);
		});
	});
});
