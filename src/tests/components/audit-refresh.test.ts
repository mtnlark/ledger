import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterNavigate } from '$app/navigation';
import { fireEvent } from '@testing-library/svelte';
import Insights from '../../routes/insights/+page.svelte';
import * as savingsStore from '$lib/stores/savingsContributions';
import Dashboard from '../../routes/+page.svelte';
import Budget from '../../routes/budget/+page.svelte';
import { db, DEFAULT_SETTINGS } from '$lib/db';
import { refreshDataCaches, resetStorageState } from '$lib/storage';
import * as actionStore from '$lib/stores/dashboardActions';
import * as categoryBudgetStore from '$lib/stores/categoryBudget';
import * as forecastStore from '$lib/stores/forecast';
import { addTransaction } from '$lib/stores/transactions';
import { setSelectedMonth } from '$lib/stores/selectedMonth';
import { toast } from '$lib/stores/toast';

vi.mock('svelte/transition', async (original) => ({ ...await original<typeof import('svelte/transition')>(), slide: () => ({ duration: 0 }), fade: () => ({ duration: 0 }), scale: () => ({ duration: 0 }) }));
let actions: ReturnType<typeof actionStore.setupDashboardActions>;
const entry = (merchant: string, amount: number, date = new Date(2026, 10, 3)) => ({ date, merchant, amount, categoryId: 1, isShared: false, isSettled: false, splitType: 'percentage' as const, splitValue: .5, isEssential: false, isSubscription: false });
const projected = () => screen.getByLabelText('Projected spending').textContent;
const changed = () => window.dispatchEvent(new CustomEvent('ledger:transactions-changed'));
const navigate = () => { const callback = vi.mocked(afterNavigate).mock.calls.at(-1)![0]; return callback({} as never); };
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(async () => {
	vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 3, 12));
	vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
	resetStorageState(); localStorage.clear(); setSelectedMonth('2026-11');
	await db.delete(); await db.open(); await db.settings.put({ ...DEFAULT_SETTINGS, lastAutoSuggestedMonth: '2026-11' });
	await db.categories.put({ id: 1, name: 'Food', isActive: true, isEssential: false, sortOrder: 1 });
	await refreshDataCaches(true);
	const setup = actionStore.setupDashboardActions;
	vi.spyOn(actionStore, 'setupDashboardActions').mockImplementation(ctx => (actions = setup(ctx)));
});
afterEach(() => { cleanup(); toast.clear(); resetStorageState(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('shows the first saved $42 expense immediately in an empty ledger forecast', async () => {
	render(Dashboard); await waitFor(() => expect(projected()).toBe('$0.00'));
	await actions.addTransaction(entry('First purchase', 42));
	await waitFor(() => expect(projected()).toBe('$42.00'));
});

it('rebuilds inferred bills after late entry, edit, deletion and subscription cancellation', async () => {
	for (const month of [4, 5, 6, 7, 8, 9]) await addTransaction(entry('Rent', 2000, new Date(2026, month, 1)));
	render(Dashboard); await waitFor(() => expect(projected()).toBe('$2,000.00'));
	await actions.addTransaction(entry('Rent', 2100, new Date(2026, 10, 20)));
	await waitFor(() => expect(projected()).toBe('$2,100.00'));
	const id = (await db.transactions.filter(t => t.amount === 2100).first())!.id!;
	await actions.saveEdit(id, entry('Rent', 2200, new Date(2026, 10, 20)), false);
	await waitFor(() => expect(projected()).toBe('$2,200.00'));
	await actions.deleteTransaction(id);
	await waitFor(() => expect(projected()).toBe('$2,000.00'));
	await actions.cancelSubscription('Rent');
	await waitFor(() => expect(projected()).toBe('$0.00'));
});

it('does not reject or duplicate a saved addition when refreshing the view fails', async () => {
	render(Dashboard); await waitFor(() => expect(projected()).toBe('$0.00'));
	vi.spyOn(forecastStore, 'getForecastPlanning').mockRejectedValueOnce(new Error('refresh failed'));
	vi.spyOn(console, 'error').mockImplementation(() => {});
	await expect(actions.addTransaction(entry('Saved once', 42))).resolves.toBeUndefined();
	expect(await db.transactions.count()).toBe(1);
	changed(); await waitFor(() => expect(projected()).toBe('$42.00'));
	expect(await db.transactions.count()).toBe(1);
});

it('discards an older dashboard refresh that finishes after a newer refresh', async () => {
	render(Dashboard); await waitFor(() => expect(projected()).toBe('$0.00'));
	const gate = deferred(); const infer = forecastStore.getForecastPlanning;
	vi.spyOn(forecastStore, 'getForecastPlanning').mockImplementationOnce(async (...args) => { await gate.promise; return infer(...args); });
	changed(); await waitFor(() => expect(forecastStore.getForecastPlanning).toHaveBeenCalledOnce());
	await actions.addTransaction(entry('Newer purchase', 42));
	await waitFor(() => expect(projected()).toBe('$42.00'));
	gate.resolve(); await new Promise(r => setTimeout(r, 30));
	expect(projected()).toBe('$42.00');
});

it('does not publish a pending dashboard request after navigation changes the selected month', async () => {
	render(Dashboard); await waitFor(() => expect(projected()).toBe('$0.00'));
	const gate = deferred(); const infer = forecastStore.getForecastPlanning;
	vi.spyOn(forecastStore, 'getForecastPlanning').mockImplementationOnce(async (...args) => { await gate.promise; return infer(...args); });
	changed(); await waitFor(() => expect(forecastStore.getForecastPlanning).toHaveBeenCalledOnce());
	setSelectedMonth('2026-10'); await navigate();
	await screen.findByText('October 2026'); gate.resolve(); await new Promise(r => setTimeout(r, 30));
	expect(screen.getByText('October 2026')).toBeInTheDocument();
});

it('refreshes Budget spending, remaining and alerts after a saved Quick Add event', async () => {
	await db.categoryBudgets.put({ categoryId: 1, month: '2026-11', budgetAmount: 100, createdAt: new Date(), updatedAt: new Date() });
	render(Budget); await navigate(); await screen.findByText('Budget Summary');
	await addTransaction(entry('Quick Add purchase', 110)); changed();
	await waitFor(() => expect(screen.getAllByText('$110').length).toBeGreaterThan(0));
	expect(screen.getByText('over', { exact: true })).toBeInTheDocument();
	expect(screen.getByText(/over budget for Food/)).toBeInTheDocument();
	expect(screen.getAllByText('$10').length).toBeGreaterThan(0);
});

it('discards an older Budget response after a newer Quick Add refresh', async () => {
	await db.categoryBudgets.put({ categoryId: 1, month: '2026-11', budgetAmount: 100, createdAt: new Date(), updatedAt: new Date() });
	render(Budget); await navigate(); await screen.findByText('Budget Summary');
	const gate = deferred(); const spending = categoryBudgetStore.getAllCategorySpending;
	vi.spyOn(categoryBudgetStore, 'getAllCategorySpending').mockImplementationOnce(async month => {
		const old = await spending(month); await gate.promise; return old;
	});
	changed(); await waitFor(() => expect(categoryBudgetStore.getAllCategorySpending).toHaveBeenCalledOnce());
	await addTransaction(entry('New Budget purchase', 110)); changed();
	await screen.findByText(/over budget for Food/);
	gate.resolve(); await new Promise(r => setTimeout(r, 30));
	expect(screen.getByText(/over budget for Food/)).toBeInTheDocument();
});

it('discards a pending Budget response after the selected month changes', async () => {
	render(Budget); await navigate(); await screen.findByText('Budget Summary');
	const gate = deferred(); const spending = categoryBudgetStore.getAllCategorySpending;
	vi.spyOn(categoryBudgetStore, 'getAllCategorySpending').mockImplementationOnce(async month => {
		const old = await spending(month); await gate.promise; return old;
	});
	changed(); await waitFor(() => expect(categoryBudgetStore.getAllCategorySpending).toHaveBeenCalledOnce());
	setSelectedMonth('2026-10'); await navigate(); await screen.findAllByText('October 2026');
	gate.resolve(); await new Promise(r => setTimeout(r, 30));
	expect(screen.getByText('October 2026')).toBeInTheDocument();
});

it.each(['dashboard', 'budget'] as const)('invalidates pending %s requests and removes its event listener on unmount', async page => {
	const view = render(page === 'dashboard' ? Dashboard : Budget);
	if (page === 'budget') await navigate();
	await screen.findByText(page === 'dashboard' ? 'Expected month-end spending' : 'Budget Summary');
	const gate = deferred();
	const query = page === 'dashboard'
		? vi.spyOn(forecastStore, 'getForecastPlanning').mockImplementationOnce(async () => { await gate.promise; throw new Error('unmounted read'); })
		: vi.spyOn(categoryBudgetStore, 'getAllCategorySpending').mockImplementationOnce(async () => { await gate.promise; throw new Error('unmounted read'); });
	const error = vi.spyOn(toast, 'error');
	changed(); await waitFor(() => expect(query).toHaveBeenCalledOnce());
	view.unmount(); gate.resolve(); await new Promise(r => setTimeout(r, 30));
	changed(); await new Promise(r => setTimeout(r, 30));
	expect(query).toHaveBeenCalledOnce(); expect(error).not.toHaveBeenCalled();
});

it('keeps the selected Insights month when an older funding refresh finishes later', async () => {
	await addTransaction(entry('History', 10, new Date(2026, 9, 1)));
	localStorage.setItem('ledger-insights-tab', 'savings');
	render(Insights); await navigate(); await screen.findByText('Savings This Month');
	const gate = deferred(); const query = savingsStore.getAllContributionsForMonth;
	vi.spyOn(savingsStore, 'getAllContributionsForMonth').mockImplementationOnce(async month => {
		const old = await query(month); await gate.promise; return old;
	});
	changed(); await waitFor(() => expect(savingsStore.getAllContributionsForMonth).toHaveBeenCalledOnce());
	await fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
	await screen.findAllByText('October 2026');
	gate.resolve(); await new Promise(r => setTimeout(r, 30));
	expect(screen.getAllByText('October 2026').length).toBeGreaterThan(0);
});
