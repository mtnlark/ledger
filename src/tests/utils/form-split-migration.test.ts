import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '$lib/db';
import { runMigrations } from '$lib/db/migrations';
import type { Transaction } from '$lib/db';

/** Create a minimal transaction in Dexie */
async function addTx(
	overrides: Partial<Transaction> & Pick<Transaction, 'merchant' | 'date' | 'amount' | 'categoryId'>
): Promise<number> {
	return (await db.transactions.add({
		isShared: false,
		splitType: 'percentage',
		splitValue: 0.5,
		partnerShare: 0,
		isSettled: false,
		isEssential: false,
		isSubscription: false,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides
	})) as number;
}

describe('migrateFormSplitLinkage', () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
		// Seed minimal settings so migrations can run
		await db.settings.put({
			id: 1,
			partnerName: 'Test',
			defaultSplitType: 'percentage',
			defaultSplitValue: 0.5,
			currency: 'USD',
			theme: 'light',
			dismissedRecurring: [],
			cancelledSubscriptions: [],
			confirmedActiveSubscriptions: [],
			iCloudBackupEnabled: false,
			completedGoals: [],
			notificationsEnabled: false,
			dailyReminderEnabled: true,
			dailyReminderTime: '20:00',
			weeklyReviewEnabled: true,
			monthlyBudgetSetupEnabled: true,
			migrationVersion: undefined as unknown as number
		});
		// Seed at least one category so other migrations don't fail
		await db.categories.put({
			id: 1,
			name: 'Test',
			isActive: true,
			sortOrder: 1,
			isEssential: false
		});
	});

	it('links form-split transactions with near-identical createdAt', async () => {
		const baseTime = new Date('2026-01-15T12:00:00.000Z');

		// Simulate form-split: same merchant, same date, createdAt < 100ms apart
		await addTx({
			merchant: 'Target',
			date: new Date('2026-01-15'),
			amount: 30,
			categoryId: 1,
			createdAt: new Date(baseTime.getTime()),
			updatedAt: new Date(baseTime.getTime())
		});
		await addTx({
			merchant: 'Target',
			date: new Date('2026-01-15'),
			amount: 20,
			categoryId: 2,
			createdAt: new Date(baseTime.getTime() + 50),
			updatedAt: new Date(baseTime.getTime() + 50)
		});

		await runMigrations();

		const all = await db.transactions.toArray();
		// Should have 3: 2 children + 1 new parent
		expect(all.length).toBe(3);

		const parent = all.find((t) => t.isSplitParent);
		expect(parent).toBeDefined();
		expect(parent!.amount).toBe(50); // 30 + 20
		expect(parent!.merchant).toBe('Target');

		const children = all.filter((t) => t.parentTransactionId === parent!.id);
		expect(children.length).toBe(2);
		expect(children.map((c) => c.amount).sort()).toEqual([20, 30]);
	});

	it('does not link transactions with createdAt > 1 second apart', async () => {
		// Two separate entries to the same merchant on the same day
		await addTx({
			merchant: 'Shell',
			date: new Date('2026-01-15'),
			amount: 30,
			categoryId: 1,
			createdAt: new Date('2026-01-15T12:00:00.000Z'),
			updatedAt: new Date('2026-01-15T12:00:00.000Z')
		});
		await addTx({
			merchant: 'Shell',
			date: new Date('2026-01-15'),
			amount: 40,
			categoryId: 1,
			createdAt: new Date('2026-01-15T12:05:00.000Z'),
			updatedAt: new Date('2026-01-15T12:05:00.000Z')
		});

		await runMigrations();

		const all = await db.transactions.toArray();
		// Should still be 2, no parent created
		expect(all.length).toBe(2);
		expect(all.every((t) => !t.parentTransactionId)).toBe(true);
		expect(all.every((t) => !t.isSplitParent)).toBe(true);
	});

	it('does not re-link already linked transactions', async () => {
		const baseTime = new Date('2026-01-15T12:00:00.000Z');

		// Already properly linked split
		const parentId = await addTx({
			merchant: 'Walmart',
			date: new Date('2026-01-15'),
			amount: 50,
			categoryId: 1,
			isSplitParent: true,
			createdAt: baseTime,
			updatedAt: baseTime
		});
		await addTx({
			merchant: 'Walmart',
			date: new Date('2026-01-15'),
			amount: 30,
			categoryId: 1,
			parentTransactionId: parentId,
			createdAt: new Date(baseTime.getTime() + 10),
			updatedAt: new Date(baseTime.getTime() + 10)
		});
		await addTx({
			merchant: 'Walmart',
			date: new Date('2026-01-15'),
			amount: 20,
			categoryId: 2,
			parentTransactionId: parentId,
			createdAt: new Date(baseTime.getTime() + 20),
			updatedAt: new Date(baseTime.getTime() + 20)
		});

		await runMigrations();

		const all = await db.transactions.toArray();
		// Still 3, no extra parent created
		expect(all.length).toBe(3);
		expect(all.filter((t) => t.isSplitParent).length).toBe(1);
	});

	it('unmarks orphaned split parents with no children', async () => {
		// Orphaned parent (isSplitParent but no children)
		const orphanId = await addTx({
			merchant: 'Walmart',
			date: new Date('2026-01-09'),
			amount: 50,
			categoryId: 1,
			isSplitParent: true,
			createdAt: new Date('2026-01-09T16:47:06.000Z'),
			updatedAt: new Date('2026-01-09T16:47:26.000Z')
		});

		await runMigrations();

		const orphan = await db.transactions.get(orphanId);
		expect(orphan!.isSplitParent).toBe(false);
	});

	it('creates parent with correct partnerShare for shared splits', async () => {
		const baseTime = new Date('2026-01-15T12:00:00.000Z');

		await addTx({
			merchant: 'Target',
			date: new Date('2026-01-15'),
			amount: 30,
			categoryId: 1,
			isShared: true,
			splitType: 'percentage',
			splitValue: 0.5,
			partnerShare: 15,
			createdAt: baseTime,
			updatedAt: baseTime
		});
		await addTx({
			merchant: 'Target',
			date: new Date('2026-01-15'),
			amount: 20,
			categoryId: 2,
			isShared: true,
			splitType: 'percentage',
			splitValue: 0.5,
			partnerShare: 10,
			createdAt: new Date(baseTime.getTime() + 30),
			updatedAt: new Date(baseTime.getTime() + 30)
		});

		await runMigrations();

		const parent = (await db.transactions.toArray()).find((t) => t.isSplitParent);
		expect(parent!.amount).toBe(50);
		expect(parent!.partnerShare).toBe(25); // 50 * 0.5
		expect(parent!.isShared).toBe(true);
	});
});
