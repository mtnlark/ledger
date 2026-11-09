import { beforeEach, expect, it } from 'vitest';
import { db } from '$lib/db';
import { addContribution, updateContribution, deleteContribution } from './savingsContributions';
import { copyBudgetsFromMonth, getEffectiveBudgetsForMonth } from './categoryBudget';
import { deleteCategory } from './categories';

beforeEach(async () => {
	await db.delete(); await db.open();
	const now = new Date();
	await db.categories.put({ id: 1, name: 'Gifts', isEssential: false, isActive: true, sortOrder: 1 });
	await db.savingsAccounts.bulkPut([1, 2].map(id => ({ id, name: `Fund ${id}`, accountType: 'savings' as const, currentBalance: 500, sortOrder: id, createdAt: now, updatedAt: now })));
});
const event = (amount = 100) => ({ accountId: 1, amount: -amount, kind: 'withdrawal' as const, source: 'bank_transfer' as const, date: new Date(2026, 0, 1), budgetCategoryId: 1 });
it('derives funding without a base row, moves it on edit, and removes it on delete', async () => {
	const id = await addContribution(event());
	expect((await getEffectiveBudgetsForMonth('2026-01')).byCategory.get(1)).toMatchObject({ base: 0, savingsFunding: 100, effective: 100 });
	await updateContribution(id, { date: new Date(2026, 1, 1), accountId: 2, amount: -200 });
	expect((await db.savingsAccounts.get(1))?.currentBalance).toBe(500);
	expect((await db.savingsAccounts.get(2))?.currentBalance).toBe(300);
	expect((await getEffectiveBudgetsForMonth('2026-01')).byCategory.size).toBe(0);
	expect((await getEffectiveBudgetsForMonth('2026-02')).byCategory.get(1)?.effective).toBe(200);
	await expect(deleteCategory(1)).rejects.toThrow('referenced');
	await deleteContribution(id);
	expect((await db.savingsAccounts.get(2))?.currentBalance).toBe(500);
	expect((await getEffectiveBudgetsForMonth('2026-02')).byCategory.size).toBe(0);
});
it('serializes concurrent withdrawals and checks edit overdrafts after reversing the old event', async () => {
	const results = await Promise.allSettled([addContribution(event(300)), addContribution(event(300))]);
	expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
	const [saved] = await db.savingsContributions.toArray();
	await expect(updateContribution(saved.id!, { amount: -501 })).rejects.toThrow();
	expect((await db.savingsAccounts.get(1))?.currentBalance).toBe(200);
	await updateContribution(saved.id!, { amount: -500 });
	expect((await db.savingsAccounts.get(1))?.currentBalance).toBe(0);
});
it('adds multiple funding events to rollover but copies only the base budget', async () => {
	const now = new Date();
	await db.categoryBudgets.put({ categoryId: 1, month: '2026-01', budgetAmount: 50, rollsOver: true, createdAt: now, updatedAt: now });
	await addContribution(event(100)); await addContribution(event(50));
	await copyBudgetsFromMonth('2026-01', '2026-02');
	const january = (await getEffectiveBudgetsForMonth('2026-01')).byCategory.get(1)!;
	expect(january.effective).toBe(200);
	const february = (await getEffectiveBudgetsForMonth('2026-02')).byCategory.get(1)!;
	expect(february).toMatchObject({ base: 50, savingsFunding: 0, carryover: 200, effective: 250 });
});
it('rejects future withdrawals, non-savings funds and contribution category references', async () => {
	const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
	await expect(addContribution({ ...event(), date: tomorrow })).rejects.toThrow();
	await db.savingsAccounts.update(1, { accountType: 'retirement' });
	await expect(addContribution(event())).rejects.toThrow();
	await expect(addContribution({ ...event(), kind: 'contribution', amount: 10 })).rejects.toThrow();
});

it('moves and clears category allocations without changing released cash', async () => {
	await db.categories.put({ id: 2, name: 'Travel', isActive: true, isEssential: false, sortOrder: 2 });
	const id = await addContribution(event(100));
	await updateContribution(id, { budgetCategoryId: 2 });
	let effective = await getEffectiveBudgetsForMonth('2026-01');
	expect(effective.byCategory.has(1)).toBe(false);
	expect(effective.byCategory.get(2)?.effective).toBe(100);
	await updateContribution(id, { budgetCategoryId: undefined });
	effective = await getEffectiveBudgetsForMonth('2026-01');
	expect(effective.byCategory.size).toBe(0);
	expect((await db.savingsAccounts.get(1))?.currentBalance).toBe(400);
	await expect(updateContribution(id, { accountId: 2, amount: -501 })).rejects.toThrow();
	expect((await db.savingsAccounts.get(1))?.currentBalance).toBe(400);
	expect((await db.savingsAccounts.get(2))?.currentBalance).toBe(500);
});
