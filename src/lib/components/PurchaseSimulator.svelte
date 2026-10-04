<script lang="ts">
	import { type SavingsAccount, type SavingsContribution, type Transaction } from '$lib/db';
	import { calculateForecast, calculateGoalProjections } from '$lib/planning/forecast';
	import type { ExpenseSchedule, PlanningData } from '$lib/planning/types';
	import { changePlanning } from '$lib/stores/planning';
	import { formatDateForInput } from '$lib/utils/date-helpers';
	import { formatCurrency } from '$lib/utils/format-helpers';
	import { format } from 'date-fns';
	let { planning, transactions, contributions, accounts, month, income, categoryId, onSaved }: { planning: PlanningData; transactions: Transaction[]; contributions: SavingsContribution[]; accounts: SavingsAccount[]; month: string; income: number; categoryId: number; onSaved: () => Promise<void> } = $props();
	let kind = $state<'once' | 'monthly' | 'savings'>('once');
	let name = $state('Planned purchase');
	let amount = $state(0);
	let date = $state('');
	let incomeAssumption = $state(0);
	let adjustSavings = $state(false);
	let accountId = $state(0);
	let revisedSavings = $state(0);
	let temporary = $state(true);
	let confirming = $state(false);
	let busy = $state(false);
	let error = $state('');
	$effect(() => { date = `${month}-15`; incomeAssumption = income; accountId = accounts[0]?.id ?? 0; });
	let scenarioMonth = $derived(date.slice(0, 7));
	let valid = $derived(date.length === 10 && date >= formatDateForInput(new Date()) && incomeAssumption >= 0 && name.trim().length > 0 && (kind === 'savings' || amount > 0) && (!(adjustSavings || kind === 'savings') || (accountId > 0 && revisedSavings >= 0)));
	let draftSchedule = $derived<ExpenseSchedule>({ id: 'preview', merchant: name, amount, date, frequency: kind === 'monthly' ? 'monthly' : 'once', amountType: 'fixed', categoryId, isShared: false, splitType: 'percentage', splitValue: 0, active: true, autoMatch: false });
	function previewPlanning(changeSavings: boolean): PlanningData {
		return { ...planning, schedules: kind === 'savings' ? planning.schedules : [...planning.schedules, draftSchedule], savingsPlans: changeSavings ? [...planning.savingsPlans, { id: 'preview-savings', accountId, amount: revisedSavings, startMonth: scenarioMonth, endMonth: temporary ? scenarioMonth : undefined }] : planning.savingsPlans };
	}
	let baseline = $derived(calculateForecast({ month: scenarioMonth || month, transactions, contributions, planning, income: incomeAssumption }));
	let unchanged = $derived(calculateForecast({ month: scenarioMonth || month, transactions, contributions, planning: previewPlanning(false), income: incomeAssumption }));
	let changed = $derived(calculateForecast({ month: scenarioMonth || month, transactions, contributions, planning: previewPlanning(true), income: incomeAssumption }));
	function goals(p: PlanningData) { return calculateGoalProjections({ accounts, transactions, contributions, planning: p, income: incomeAssumption }); }
	let baselineGoals = $derived(valid ? goals(planning) : []);
	let unchangedGoals = $derived(valid ? goals(previewPlanning(false)) : []);
	let changedGoals = $derived(valid && (adjustSavings || kind === 'savings') ? goals(previewPlanning(true)) : []);
	async function apply() {
		if (!valid || busy) return; busy = true; error = '';
		try {
			await changePlanning(p => ({ ...p, schedules: kind === 'savings' ? p.schedules : [...p.schedules, { ...draftSchedule, id: crypto.randomUUID() }], savingsPlans: adjustSavings || kind === 'savings' ? [...p.savingsPlans, { id: crypto.randomUUID(), accountId, amount: revisedSavings, startMonth: scenarioMonth, endMonth: temporary ? scenarioMonth : undefined }] : p.savingsPlans }));
			confirming = false; amount = 0; await onSaved();
		} catch (e) { error = e instanceof Error ? e.message : String(e); } finally { busy = false; }
	}
</script>

<section class="space-y-4">
	<h2 class="font-display text-xl">Preview a decision</h2>
	<p class="text-sm text-charcoal-muted">Compare a purchase or contribution change before committing. Previews leave recorded activity untouched.</p>
	<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
		<label>Decision<select bind:value={kind} onchange={() => confirming = false}><option value="once">One-time purchase</option><option value="monthly">Recurring expense</option><option value="savings">Change monthly savings</option></select></label>
		<label>Date<input required type="date" min={formatDateForInput(new Date())} bind:value={date} oninput={() => confirming = false} /></label>
		{#if kind !== 'savings'}<label>Description<input bind:value={name} oninput={() => confirming = false} /></label><label>Your purchase amount<input type="number" min="0.01" step="0.01" bind:value={amount} oninput={() => confirming = false} /></label>{/if}
		<label>Monthly income assumption<input type="number" min="0" step="0.01" bind:value={incomeAssumption} oninput={() => confirming = false} /></label>
	</div>
	{#if kind !== 'savings'}<label class="flex items-center gap-2"><input type="checkbox" bind:checked={adjustSavings} onchange={() => confirming = false} /> Compare changing a savings contribution</label>{/if}
	{#if adjustSavings || kind === 'savings'}
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4"><label>Savings plan<select bind:value={accountId} onchange={() => confirming = false}>{#each accounts as account (account.id)}<option value={account.id}>{account.name}</option>{/each}</select></label><label>Revised monthly savings<input type="number" min="0" step="0.01" bind:value={revisedSavings} oninput={() => confirming = false} /></label></div>
		<label class="flex items-center gap-2"><input type="checkbox" bind:checked={temporary} onchange={() => confirming = false} /> Change savings only for {scenarioMonth}</label>
	{/if}
	{#if valid}
		<div class="bg-surface-alt rounded-xl p-4 space-y-2 text-sm" aria-live="polite">
			<p>Current plan: <strong class="font-mono">{formatCurrency(baseline.remainder ?? 0)}</strong> month-end remainder</p>
			{#if kind !== 'savings'}<p>Purchase, savings unchanged: <strong class="font-mono">{formatCurrency(unchanged.remainder ?? 0)}</strong></p>{/if}
			{#if adjustSavings || kind === 'savings'}<p>With revised savings: <strong class="font-mono">{formatCurrency(changed.remainder ?? 0)}</strong></p>{/if}
			<p class="text-xs text-charcoal-muted">Future months use this income assumption and recent ordinary spending history. Goal projections share one funding pool across all plans. Enter monthly plans in Goals and funding for completion estimates.</p>
		</div>
		{#if baselineGoals.length}
			<div class="overflow-x-auto"><table class="w-full text-sm text-left"><thead><tr><th>Goal</th><th>Current plan</th>{#if kind !== 'savings'}<th>Savings unchanged</th>{/if}{#if changedGoals.length}<th>Revised savings</th>{/if}</tr></thead><tbody>{#each baselineGoals as goal, i (goal.account.id)}<tr><td>{goal.account.name}</td><td>{goal.completion ? format(goal.completion, 'MMM yyyy') : 'No estimate'}</td>{#if kind !== 'savings'}<td>{unchangedGoals[i]?.completion ? format(unchangedGoals[i].completion!, 'MMM yyyy') : 'No estimate'}</td>{/if}{#if changedGoals.length}<td>{changedGoals[i]?.completion ? format(changedGoals[i].completion!, 'MMM yyyy') : 'No estimate'}</td>{/if}</tr>{/each}</tbody></table></div>
		{/if}
		{#if !confirming}<button class="btn-primary" onclick={() => confirming = true}>Review planned changes</button>{:else}
			<div class="border border-theme rounded-xl p-4 space-y-3">
				<h3 class="font-medium">Confirm planned changes</h3>
				{#if kind !== 'savings'}<p class="text-sm">Add {name} for {formatCurrency(amount)} on {date}{kind === 'monthly' ? ', repeating monthly' : ''}.</p>{/if}
				{#if adjustSavings || kind === 'savings'}<p class="text-sm">Set {accounts.find(a => a.id === accountId)?.name} to {formatCurrency(revisedSavings)} {temporary ? `for ${scenarioMonth} only` : `monthly from ${scenarioMonth}`}.</p>{/if}
				<button disabled={busy} class="btn-primary" onclick={apply}>Confirm and apply plans</button> <button onclick={() => confirming = false}>Keep previewing</button>
			</div>
		{/if}
	{/if}
	{#if error}<p role="alert" class="text-danger-600">{error}</p>{/if}
</section>

<style>
	label { display: block; font-size: .875rem; }
	input:not([type=checkbox]), select { display: block; width: 100%; margin-top: .25rem; padding: .6rem; border: 1px solid var(--color-border); border-radius: .5rem; background: var(--color-surface-alt); }
	th, td { padding: .6rem; border-bottom: 1px solid var(--color-border); }
</style>
