import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, fireEvent, screen, waitFor, cleanup } from '@testing-library/svelte';
import { db, DEFAULT_SETTINGS, getMonthKey, navigateMonth } from '$lib/db';
import { resetStorageState } from '$lib/storage';
import PurchaseSimulator from './PurchaseSimulator.svelte';
import TransactionForm from './TransactionForm.svelte';
import WeekInReviewCard from './WeekInReviewCard.svelte';
import { emptyPlanning } from '$lib/planning/types';
import { getPlanning } from '$lib/stores/planning';
import { addSplitTransaction, getAllTransactions, updateSplitGroup } from '$lib/stores/transactions';
import { getWeekRange } from '$lib/utils/week-in-review';
vi.mock('svelte/transition', async (original) => ({ ...await original<typeof import('svelte/transition')>(), slide: () => ({ duration: 0 }), fade: () => ({ duration: 0 }), scale: () => ({ duration: 0 }) }));
const now = new Date();
const current = getMonthKey(now);
beforeEach(async () => {
	resetStorageState(); await db.delete(); await db.open();
	await db.settings.put(DEFAULT_SETTINGS);
	await db.categories.put({ id: 1, name: 'Shopping', isActive: true, sortOrder: 1, isEssential: false });
	await db.savingsAccounts.put({ id: 1, name: 'Holiday', accountType: 'savings', currentBalance: 0, targetAmount: 1000, sortOrder: 1, createdAt: now, updatedAt: now });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('planning UI', () => {
	it('keeps a purchase preview separate until the concrete changes are confirmed', async () => {
		const planning = { ...emptyPlanning(), savingsPlans: [{ id: 'p', accountId: 1, amount: 100, startMonth: current }] };
		render(PurchaseSimulator, { planning, transactions: [], contributions: [], accounts: await db.savingsAccounts.toArray(), month: navigateMonth(current, 1), income: 2000, categoryId: 1, onSaved: vi.fn().mockResolvedValue(undefined) });
		await fireEvent.input(screen.getByLabelText('Your purchase amount'), { target: { value: '1200' } });
		expect(await screen.findByText('Purchase, savings unchanged:', { exact: false })).toHaveTextContent('$700.00');
		expect(await db.transactions.count()).toBe(0);
		expect((await getPlanning()).schedules).toHaveLength(0);
		await fireEvent.click(screen.getByText('Review planned changes'));
		expect(screen.getByText('Add Planned purchase', { exact: false })).toHaveTextContent('$1,200.00');
		expect((await getPlanning()).schedules).toHaveLength(0);
		await fireEvent.click(screen.getByText('Confirm and apply plans'));
		await waitFor(async () => expect((await getPlanning()).schedules).toHaveLength(1));
		expect(await db.transactions.count()).toBe(0);
	});
	it('repeats a split purchase with sharing, notes and tags intact and editable amounts', async () => {
		const submitted = vi.fn();
		render(TransactionForm, { categories: await db.categories.toArray(), settings: DEFAULT_SETTINGS, initialTemplate: { id: 't', name: 'Trip', entry: { merchant: 'Store', amount: 100, categoryId: 1, isShared: true, splitType: 'fixed', splitValue: 40, isEssential: false, isSubscription: false, notes: '#trip' }, splits: [{ categoryId: 1, amount: 60, notes: '#groceries' }, { categoryId: 1, amount: 40, notes: '#home' }] }, onSubmit: vi.fn(), onSplitSubmit: submitted });
		const form = document.querySelector('form')!;
		await fireEvent.submit(form);
		expect(submitted).toHaveBeenCalledWith(expect.objectContaining({ merchant: 'Store', isShared: true, splitValue: 40, notes: '#trip', splits: [{ categoryId: 1, amount: 60, notes: '#groceries' }, { categoryId: 1, amount: 40, notes: '#home' }] }));
	});
	it('lets a zero-spending week be confirmed complete', async () => {
		render(WeekInReviewCard, { allTransactions: [], categories: await db.categories.toArray(), settings: DEFAULT_SETTINGS, onSaved: vi.fn().mockResolvedValue(undefined) });
		await fireEvent.click(await screen.findByText('Confirm completeness'));
		await waitFor(async () => expect((await getPlanning()).completeThrough).toBeDefined());
	});
	it('retains a reviewed split purchase as a one-off after editing its allocations', async () => {
		const purchase = { date: getWeekRange(1).start, merchant: 'Trip', amount: 100, categoryId: 1, isShared: false, splitType: 'percentage' as const, splitValue: 0, isSettled: false, isEssential: false, isSubscription: false };
		const lines = [{ categoryId: 1, amount: 60 }, { categoryId: 1, amount: 40 }];
		const ids = await addSplitTransaction(purchase, lines);
		const parentId = (await db.transactions.get(ids[0]))!.parentTransactionId!;
		render(WeekInReviewCard, { allTransactions: await getAllTransactions(), categories: await db.categories.toArray(), settings: DEFAULT_SETTINGS, onSaved: vi.fn().mockResolvedValue(undefined) });
		await fireEvent.click(await screen.findByText('Mark expected one-off'));
		await waitFor(async () => expect((await db.transactions.get(ids[0]))?.isExpectedOneOff).toBe(true));
		const updated = await updateSplitGroup(parentId, purchase, lines);
		expect((await db.transactions.bulkGet(updated)).every(t => t?.isExpectedOneOff)).toBe(true);
	});
});
