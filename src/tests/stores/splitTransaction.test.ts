/**
 * Split transaction edge cases not covered by the main transactions.test.ts.
 *
 * The main test suite covers: basic 2-way split, parent marking, child linking,
 * amount validation, min-split check, double-split prevention, query filtering,
 * and shared expense inheritance.
 *
 * This file adds: N-way splits, rounding edge cases, settled status inheritance,
 * and isSplitBalanced integration.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, initializeDatabase } from '$lib/db';
import {
	addTransaction,
	splitTransaction,
	getSplitChildren,
	getTransactionsByMonth
} from '$lib/stores/transactions';
import { isSplitBalanced, sumCurrency } from '$lib/utils/currency';

// Helper to create a transaction with standard defaults
async function createParent(overrides: Record<string, unknown> = {}): Promise<number> {
	return addTransaction({
		date: new Date(2026, 0, 15),
		merchant: 'Target',
		amount: 100,
		categoryId: 1,
		isShared: false,
		splitType: 'percentage' as const,
		splitValue: 0.5,
		isSettled: false,
		isEssential: false,
		isSubscription: false,
		...overrides
	});
}

describe('splitTransaction – additional edge cases', () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
		await initializeDatabase();
	});

	afterEach(async () => {
		await db.delete();
	});

	it('splits into 3 children correctly', async () => {
		const parentId = await createParent({ amount: 99 });

		const childIds = await splitTransaction(parentId, [
			{ categoryId: 1, amount: 33 },
			{ categoryId: 2, amount: 33 },
			{ categoryId: 3, amount: 33 }
		]);

		expect(childIds).toHaveLength(3);

		const children = await getSplitChildren(parentId);
		expect(children).toHaveLength(3);

		const childTotal = sumCurrency(children.map((c) => c.amount));
		expect(childTotal).toBe(99);
	});

	it('splits into 5 children', async () => {
		const parentId = await createParent({ amount: 50 });

		const childIds = await splitTransaction(parentId, [
			{ categoryId: 1, amount: 10 },
			{ categoryId: 2, amount: 10 },
			{ categoryId: 3, amount: 10 },
			{ categoryId: 4, amount: 10 },
			{ categoryId: 5, amount: 10 }
		]);

		expect(childIds).toHaveLength(5);
	});

	it('handles rounding remainder (e.g., $100 split 3 ways)', async () => {
		const parentId = await createParent({ amount: 100 });

		// 33.33 + 33.33 + 33.34 = 100.00 (remainder in last child)
		const childIds = await splitTransaction(parentId, [
			{ categoryId: 1, amount: 33.33 },
			{ categoryId: 2, amount: 33.33 },
			{ categoryId: 3, amount: 33.34 }
		]);

		expect(childIds).toHaveLength(3);
		const children = await getSplitChildren(parentId);
		const total = children.reduce((sum, c) => sum + c.amount, 0);
		const remaining = 100 - total;
		expect(isSplitBalanced(remaining)).toBe(true);
	});

	it('inherits isSettled from parent', async () => {
		const parentId = await createParent({ isSettled: true });

		const childIds = await splitTransaction(parentId, [
			{ categoryId: 1, amount: 60 },
			{ categoryId: 2, amount: 40 }
		]);

		const child = await db.transactions.get(childIds[0]);
		expect(child?.isSettled).toBe(true);
	});

	it('inherits subscription settings from parent', async () => {
		const parentId = await createParent({
			isSubscription: true,
			subscriptionFrequency: 'monthly'
		});

		const childIds = await splitTransaction(parentId, [
			{ categoryId: 1, amount: 60 },
			{ categoryId: 2, amount: 40 }
		]);

		const child = await db.transactions.get(childIds[0]);
		expect(child?.isSubscription).toBe(true);
		expect(child?.subscriptionFrequency).toBe('monthly');
	});

	it('split children are excluded from parent total in spending queries', async () => {
		const parentId = await createParent({ amount: 100 });

		await splitTransaction(parentId, [
			{ categoryId: 1, amount: 60 },
			{ categoryId: 2, amount: 40 }
		]);

		const month = await getTransactionsByMonth('2026-01');
		// Parent hidden, only children visible
		const total = month.reduce((sum, t) => sum + t.amount, 0);
		expect(total).toBe(100); // Children sum, not double-counted with parent
		expect(month.some((t) => t.id === parentId)).toBe(false);
	});

	it('child notes come from split data, not parent', async () => {
		const parentId = await createParent({ notes: 'parent note' });

		const childIds = await splitTransaction(parentId, [
			{ categoryId: 1, amount: 60, notes: 'child note' },
			{ categoryId: 2, amount: 40 }
		]);

		const child1 = await db.transactions.get(childIds[0]);
		const child2 = await db.transactions.get(childIds[1]);
		expect(child1?.notes).toBe('child note');
		expect(child2?.notes).toBeUndefined();
	});

	it('recalculates partner share per child for shared splits', async () => {
		const parentId = await createParent({
			amount: 100,
			isShared: true,
			splitType: 'percentage',
			splitValue: 0.5 // 50/50 split
		});

		const childIds = await splitTransaction(parentId, [
			{ categoryId: 1, amount: 70 },
			{ categoryId: 2, amount: 30 }
		]);

		const child1 = await db.transactions.get(childIds[0]);
		const child2 = await db.transactions.get(childIds[1]);
		expect(child1?.partnerShare).toBe(35); // 50% of 70
		expect(child2?.partnerShare).toBe(15); // 50% of 30
	});

	it('throws for non-existent parent', async () => {
		await expect(
			splitTransaction(99999, [
				{ categoryId: 1, amount: 60 },
				{ categoryId: 2, amount: 40 }
			])
		).rejects.toThrow('Transaction not found');
	});
});
