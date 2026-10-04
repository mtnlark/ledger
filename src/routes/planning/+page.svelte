<script lang="ts">
	import { onMount } from 'svelte';
	import { db, getMonthKey, type Category, type MonthlyBudget, type SavingsAccount, type SavingsContribution, type Transaction, type LinkedAccount } from '$lib/db';
	import { initializeStorage } from '$lib/storage';
	import { getAllCategories } from '$lib/stores/categories';
	import { getAllTransactions, addTransaction, addSplitTransaction } from '$lib/stores/transactions';
	import { getAllContributions } from '$lib/stores/savingsContributions';
	import { getAllSavingsAccounts } from '$lib/stores/savingsAccounts';
	import { getBudgetForMonth } from '$lib/stores/budget';
	import { getEffectiveBudgetsForMonth } from '$lib/stores/categoryBudget';
	import { getPlanning, removeSchedule, getRecordedGoalBalances } from '$lib/stores/planning';
	import { getSelectedMonth, setSelectedMonth } from '$lib/stores/selectedMonth';
	import { emptyPlanning, type ExpenseSchedule } from '$lib/planning/types';
	import { calculateForecast, calculateGoalProjections } from '$lib/planning/forecast';
	import { formatCurrency } from '$lib/utils/format-helpers';
	import { parseLocalDate, formatDateForInput } from '$lib/utils/date-helpers';
	import { scalePurchaseAllocations } from '$lib/utils/transaction-grouping';
	import BudgetForecastCard from '$lib/components/BudgetForecastCard.svelte';
	import ScheduleEditor from '$lib/components/ScheduleEditor.svelte';
	import GoalPlanner from '$lib/components/GoalPlanner.svelte';
	import PurchaseSimulator from '$lib/components/PurchaseSimulator.svelte';
	let month = $state(getMonthKey(new Date()));
	let tab = $state<'commitments' | 'simulator' | 'goals'>('commitments');
	let planning = $state(emptyPlanning());
	let transactions = $state<Transaction[]>([]);
	let contributions = $state<SavingsContribution[]>([]);
	let accounts = $state<SavingsAccount[]>([]);
	let goalBalances = $state<SavingsAccount[]>([]);
	let banks = $state<LinkedAccount[]>([]);
	let categories = $state<Category[]>([]);
	let budget = $state<MonthlyBudget | null>(null);
	let incomeAssumption = $state(0);
	let rollover = $state(0);
	let loading = $state(true);
	let error = $state('');
	let editing = $state<ExpenseSchedule | null>(null);
	let showEditor = $state(false);
	let recordId = $state<string | null>(null);
	let recordDate = $state(formatDateForInput(new Date()));
	let recordAmount = $state(0);
	let busy = $state(false);
	let forecast = $derived(calculateForecast({ month, transactions, contributions, planning, income: budget?.income ?? null, rolloverAdjustment: rollover }));
	let goalProjections = $derived(calculateGoalProjections({ accounts: goalBalances, transactions, contributions, planning, income: budget?.income ?? 0 }));
	async function load() {
		error = '';
		try {
			await initializeStorage();
			const [p, tx, cs, ac, ba, cats, b, r, currentBudget] = await Promise.all([getPlanning(), getAllTransactions(), getAllContributions(), getAllSavingsAccounts(), db.linkedAccounts.toArray(), getAllCategories(), getBudgetForMonth(month), getEffectiveBudgetsForMonth(month), getBudgetForMonth(getMonthKey(new Date()))]);
			planning = p; transactions = tx; contributions = cs; accounts = ac; banks = ba; categories = cats; budget = b;
			goalBalances = await getRecordedGoalBalances(ac);
			incomeAssumption = b?.income ?? currentBudget?.income ?? 0;
			rollover = r.carryoverTotal - r.deficitCarried;
		} catch (e) { error = e instanceof Error ? e.message : String(e); } finally { loading = false; }
	}
	onMount(() => { month = getSelectedMonth(); void load(); });
	async function changeMonth() { setSelectedMonth(month); await load(); }
	async function saved() { showEditor = false; editing = null; await load(); }
	async function remove(id: string) { try { await removeSchedule(id); await load(); } catch (e) { error = String(e); } }
	async function record(schedule: ExpenseSchedule, occurrenceDate: string) {
		if (busy) return; busy = true; error = '';
		try {
			const entry = { date: parseLocalDate(recordDate), merchant: schedule.merchant, amount: recordAmount, categoryId: schedule.categoryId, isShared: schedule.isShared, splitType: schedule.splitType, splitValue: schedule.splitValue, isSettled: false, isEssential: categories.find(c => c.id === schedule.categoryId)?.isEssential ?? false, isSubscription: schedule.frequency !== 'once', subscriptionFrequency: schedule.frequency === 'once' ? undefined : schedule.frequency, notes: schedule.notes, scheduleId: schedule.id, scheduleDate: occurrenceDate };
			if (schedule.allocations) await addSplitTransaction(entry, scalePurchaseAllocations(schedule.allocations, recordAmount)); else await addTransaction(entry);
			recordId = null; await load();
		} catch (e) { error = e instanceof Error ? e.message : String(e); } finally { busy = false; }
	}
</script>

<svelte:head><title>Planning | Ledger</title></svelte:head>
<main class="max-w-6xl mx-auto px-6 py-6 space-y-5">
	<div class="flex items-center justify-between gap-4"><h1 class="font-display text-2xl">Planning</h1><label class="text-sm">Month<input aria-label="Planning month" type="month" bind:value={month} onchange={changeMonth} class="ml-2 p-2 border border-theme bg-surface rounded-lg" /></label></div>
	{#if error}<p role="alert" class="text-danger-600">{error}</p>{/if}
	{#if loading}<p>Loading plans…</p>{:else}
		<div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_330px] gap-6 items-start">
			<div class="bg-surface rounded-xl shadow-sm shadow-theme p-5 space-y-5">
				<div class="flex flex-wrap gap-2" aria-label="Planning views">{#each ['commitments', 'simulator', 'goals'] as view (view)}<button aria-pressed={tab === view} class="px-3 py-2 rounded-lg text-sm {tab === view ? 'bg-primary-50 text-primary-700' : 'text-charcoal-muted'}" onclick={() => tab = view as typeof tab}>{view === 'commitments' ? 'Bills and purchases' : view === 'simulator' ? 'Purchase simulator' : 'Goals and funding'}</button>{/each}</div>
				{#if tab === 'commitments'}
					<div class="flex justify-between gap-3"><h2 class="font-display text-xl">Confirmed commitments</h2><button class="text-primary-600 text-sm" onclick={() => { editing = null; showEditor = true; }}>Add commitment</button></div>
					<p class="text-sm text-charcoal-muted">Schedules reserve your share. Record a payment when it happens. Existing payments match by merchant, category, nearby date, and amount; you can explicitly link an entry in its editor.</p>
					{#if showEditor}<ScheduleEditor {categories} schedule={editing} onSaved={saved} onCancel={() => showEditor = false} />{/if}
					{#each forecast.commitments as commitment (`${commitment.schedule.id}-${commitment.date}`)}
						<div class="border border-theme rounded-xl p-4 space-y-2">
							<div class="flex justify-between gap-3"><div><p class="font-medium">{commitment.schedule.merchant}</p><p class="text-xs text-charcoal-muted">{commitment.date} · {commitment.schedule.frequency} · {commitment.schedule.amountType === 'variable' ? 'Estimated ' : ''}{formatCurrency(commitment.amount)} your share</p></div><span class="text-xs text-charcoal-muted">{commitment.matchedIds.length ? 'Payment matched' : commitment.date < formatDateForInput(new Date()) ? 'Needs review · still reserved' : 'Reserved'}</span></div>
							<div class="flex gap-4 text-sm"><button class="text-primary-600" onclick={() => { editing = commitment.schedule; showEditor = true; }}>Edit schedule</button><button class="text-danger-600" onclick={() => remove(commitment.schedule.id)}>Remove plan</button>{#if !commitment.matchedIds.length}<button class="text-primary-600" onclick={() => { recordId = commitment.schedule.id; recordDate = formatDateForInput(new Date()); recordAmount = commitment.schedule.amount; }}>Record payment</button>{/if}</div>
							{#if recordId === commitment.schedule.id}<form class="space-y-3" onsubmit={(e) => { e.preventDefault(); void record(commitment.schedule, commitment.date); }}><div class="grid grid-cols-2 gap-3"><label class="text-sm">Payment date<input required type="date" max={formatDateForInput(new Date())} bind:value={recordDate} class="block w-full p-2 border border-theme bg-surface-alt rounded-lg" /></label><label class="text-sm">Actual full amount<input required type="number" min="0.01" step="0.01" bind:value={recordAmount} class="block w-full p-2 border border-theme bg-surface-alt rounded-lg" /></label></div><p class="text-xs text-charcoal-muted">Save {commitment.schedule.merchant} for {formatCurrency(recordAmount)} on {recordDate}, linked to this commitment.</p><button disabled={busy} class="btn-primary">Confirm payment</button> <button type="button" onclick={() => recordId = null}>Cancel</button></form>{/if}
						</div>
					{:else}<p class="text-sm text-charcoal-muted">No commitments scheduled this month. Add a bill or preview a purchase.</p>{/each}
					<details><summary class="text-sm text-charcoal-muted cursor-pointer">All saved schedules</summary>{#each planning.schedules as schedule (schedule.id)}<div class="flex justify-between py-2 text-sm"><span>{schedule.merchant} · {schedule.date}</span><button class="text-primary-600" onclick={() => { editing = schedule; showEditor = true; }}>Edit</button></div>{/each}</details>
				{:else if tab === 'simulator'}
					<PurchaseSimulator {planning} {transactions} {contributions} accounts={goalBalances} {month} income={incomeAssumption} categoryId={categories.find(c => c.isActive)?.id ?? 0} onSaved={load} />
				{:else}
					<GoalPlanner {accounts} {banks} {planning} {month} {goalProjections} pool={(forecast.remainder ?? 0) + forecast.savings} onSaved={load} />
				{/if}
			</div>
			<aside class="lg:sticky lg:top-6"><BudgetForecastCard {forecast} /></aside>
		</div>
	{/if}
</main>
