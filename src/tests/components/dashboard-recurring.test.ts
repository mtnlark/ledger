import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { get } from 'svelte/store';
import Dashboard from '../../routes/+page.svelte';
import { db, DEFAULT_SETTINGS, getMonthKey } from '$lib/db';
import { refreshDataCaches, resetStorageState } from '$lib/storage';
import { addSplitTransaction, addTransaction, getTransactionCache } from '$lib/stores/transactions';
import { toast, toasts } from '$lib/stores/toast';
import { sumCurrency } from '$lib/utils/currency';

vi.mock('svelte/transition', async (original) => ({
	...await original<typeof import('svelte/transition')>(),
	slide: () => ({ duration: 0 }),
	fade: () => ({ duration: 0 }),
	scale: () => ({ duration: 0 })
}));

beforeEach(async () => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date(2026, 10, 1, 12));
	vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
	resetStorageState();
	localStorage.clear();
	localStorage.setItem('ledger-selected-month', '2026-11');
	localStorage.setItem('ledger-show-upcoming', 'true');
	await db.delete();
	await db.open();
	await db.settings.put({ ...DEFAULT_SETTINGS });
	await db.categories.bulkPut([1, 2].map((id) => ({
		id, name: `Category ${id}`, isActive: true, isEssential: false, sortOrder: id
	})));
	await refreshDataCaches();

	const input = {
		date: new Date(2026, 9, 15, 12),
		merchant: 'Synthetic service',
		amount: 10,
		categoryId: 1,
		isShared: false,
		splitType: 'percentage' as const,
		splitValue: 0.5,
		isSettled: false,
		isEssential: false,
		isSubscription: true,
		subscriptionFrequency: 'monthly' as const
	};
	await addTransaction(input);
	await addSplitTransaction({
		...input,
		date: new Date(2026, 9, 31, 12),
		merchant: 'Synthetic split service',
		amount: 100,
		isShared: true,
		splitType: 'fixed',
		splitValue: 20
	}, [{ categoryId: 1, amount: 60 }, { categoryId: 2, amount: 40 }]);
});

afterEach(() => {
	cleanup();
	toast.clear();
	resetStorageState();
	localStorage.clear();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

async function confirmSuggestions() {
	render(Dashboard);
	await fireEvent.click(await screen.findByRole('button', { name: 'Review' }));
	await fireEvent.click(screen.getByRole('button', { name: 'Continue (2)' }));
	return within(screen.getByRole('dialog'));
}

describe('dashboard recurring transactions', () => {
	it('adds the November batch with local dates and shared category allocations intact', async () => {
		const history = await db.transactions.toArray();
		const confirmation = await confirmSuggestions();
		const dates = confirmation.getAllByLabelText('Date');
		expect(dates[0]).toHaveValue('2026-11-15');
		expect(dates[1]).toHaveValue('2026-11-30');
		await fireEvent.click(confirmation.getByRole('button', { name: 'Add 2 Transactions' }));

		await waitFor(() => expect(get(toasts)).toEqual([
			expect.objectContaining({ type: 'success', message: '2 transactions added' })
		]));
		const all = await db.transactions.toArray();
		expect(all.filter((row) => getMonthKey(row.date) === '2026-10')).toEqual(history);
		const november = all.filter((row) => getMonthKey(row.date) === '2026-11');
		expect(november).toHaveLength(4);
		expect(november.find((row) => row.merchant === 'Synthetic service')).toMatchObject({
			date: new Date(2026, 10, 15, 12), amount: 10, categoryId: 1, isSubscription: true
		});
		const parent = november.find((row) => row.isSplitParent)!;
		expect(parent).toMatchObject({
			date: new Date(2026, 10, 30, 12), amount: 100, splitType: 'fixed', splitValue: 20
		});
		const children = november.filter((row) => row.parentTransactionId === parent.id);
		expect(children.map(({ categoryId, amount }) => ({ categoryId, amount }))).toEqual([
			{ categoryId: 1, amount: 60 }, { categoryId: 2, amount: 40 }
		]);
		expect(sumCurrency(children.map((row) => row.partnerShare))).toBe(20);
		expect(getTransactionCache().getForMonth('2026-11')).toHaveLength(3);
		expect((await db.settings.get(1))?.lastAutoSuggestedMonth).toBe('2026-11');
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument();
		await screen.findByText('Synthetic service');
		await screen.findByText('Synthetic split service');
	});

	it('rolls back earlier additions and cache changes when a later split category is missing', async () => {
		const history = await db.transactions.toArray();
		const confirmation = await confirmSuggestions();
		// Simulate a stale category reference after the suggestions have been reviewed.
		await db.categories.delete(2);
		const additions = vi.spyOn(db.transactions, 'add');
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		await fireEvent.click(confirmation.getByRole('button', { name: 'Add 2 Transactions' }));

		await waitFor(() => expect(get(toasts)).toEqual([
			expect.objectContaining({ type: 'error', message: 'Failed to add transactions' })
		]));
		expect(additions).toHaveBeenCalledOnce();
		expect(additions).toHaveBeenCalledWith(expect.objectContaining({ merchant: 'Synthetic service' }));
		expect(log).toHaveBeenCalledWith(
			expect.stringContaining('handleAddSelectedSuggestions'),
			expect.objectContaining({ applied: false, message: 'Missing category reference' })
		);
		expect(await db.transactions.toArray()).toEqual(history);
		expect(getTransactionCache().getForMonth('2026-11')).toEqual([]);
		expect((await db.settings.get(1))?.lastAutoSuggestedMonth).not.toBe('2026-11');
		expect(screen.getByRole('dialog')).toBeInTheDocument();
		expect(confirmation.getByRole('button', { name: 'Add 2 Transactions' })).toBeEnabled();
	});
});
