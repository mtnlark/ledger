<script lang="ts">
	import type { LinkedAccount, SavingsAccount } from '$lib/db';
	import type { PlanningData } from '$lib/planning/types';
	import { plannedSavingsByAccount, projectGoals, type calculateGoalProjections } from '$lib/planning/forecast';
	import { linkSavingsAllocation, saveSavingsPlan, changePlanning } from '$lib/stores/planning';
	import { formatCurrency } from '$lib/utils/format-helpers';
	import { sumCurrency } from '$lib/utils/currency';
	import { format } from 'date-fns';
	let { accounts, banks, planning, month, pool, goalProjections, onSaved }: { accounts: SavingsAccount[]; banks: LinkedAccount[]; planning: PlanningData; month: string; pool: number; goalProjections?: ReturnType<typeof calculateGoalProjections>; onSaved: () => Promise<void> } = $props();
	let error = $state('');
	let busy = $state(false);
	let editing = $state<number | null>(null);
	let bankId = $state<number | ''>('');
	let allocation = $state(0);
	let monthly = $state(0);
	let rates = $derived(plannedSavingsByAccount(planning, month));
	let projections = $derived(projectGoals(accounts, pool, rates).map(g => ({ ...g, completion: goalProjections ? goalProjections.find(p => p.account.id === g.account.id)?.completion ?? null : g.completion })));
	let requested = $derived(sumCurrency([...rates.values()]));
	function edit(account: SavingsAccount) { editing = account.id!; bankId = account.linkedAccountId ?? ''; allocation = account.currentBalance ?? 0; monthly = rates.get(account.id!) ?? 0; error = ''; }
	async function save(e: SubmitEvent) {
		e.preventDefault(); if (editing === null || busy) return; busy = true; error = '';
		try {
			// Atomic allocation + plan update with a single disk acknowledgment.
			const { runMutation } = await import('$lib/storage/mutation');
			await runMutation(['savingsAccounts', 'savingsContributions', 'linkedAccounts', 'settings', 'categories', 'transactions'], async () => {
				const account = accounts.find(a => a.id === editing)!;
				if (account.accountType === 'savings') await linkSavingsAllocation(editing!, bankId === '' ? undefined : bankId, allocation);
				await saveSavingsPlan({ id: `${editing}-${month}`, accountId: editing!, amount: monthly, startMonth: month });
			});
			editing = null; await onSaved();
		} catch (e) { error = e instanceof Error ? e.message : String(e); } finally { busy = false; }
	}
	async function removePlan(id: string) { try { await changePlanning(p => ({ ...p, savingsPlans: p.savingsPlans.filter(s => s.id !== id) })); await onSaved(); } catch (e) { error = String(e); } }
</script>

<section class="space-y-4">
	<h2 class="font-display text-xl">Goals and funding</h2>
	<p class="text-sm text-charcoal-muted">All monthly savings plans share {formatCurrency(Math.max(0, pool))} after expected expenses. Requested: {formatCurrency(requested)}. {requested > pool ? 'The pool cannot cover every plan; projections share it in proportion to each request.' : 'Plans fit within the pool.'}</p>
	{#each banks.filter(b => b.accountClass === 'asset' && b.accountType === 'savings' && b.isActive) as bank (bank.id)}
		{@const allocated = sumCurrency(accounts.filter(a => a.linkedAccountId === bank.id).map(a => a.currentBalance ?? 0))}
		{@const balanceDate = bank.upstreamBalanceAt ?? bank.lastSyncedAt ?? bank.updatedAt}
		<div class="bg-surface-alt p-4 rounded-xl text-sm space-y-1">
			<p class="font-medium">{bank.name}</p>
			<p>Bank balance: <span class="font-mono">{formatCurrency(bank.currentBalance)}</span> · Allocated to savings plans: <span class="font-mono">{formatCurrency(allocated)}</span></p>
			<p class="text-xs text-charcoal-muted">Balance as of {format(new Date(balanceDate), 'MMM d, yyyy')}{bank.lastSyncStatus !== 'ok' || Date.now() - new Date(balanceDate).getTime() > 7 * 86400000 ? ' · Stale or unverified balance' : ''}.</p>
			{#if allocated !== bank.currentBalance}<p class="text-xs text-warning-700">Unexplained difference: {formatCurrency(bank.currentBalance - allocated)}. Review the bank balance and allocations.</p>{/if}
		</div>
	{/each}
	<div class="space-y-2">
		{#each accounts as account (account.id)}
			{@const projection = projections.find(g => g.account.id === account.id)}
			<div class="bg-surface border border-theme rounded-xl p-4">
				<div class="flex justify-between gap-3"><div><p class="font-medium">{account.name}</p><p class="text-sm text-charcoal-muted">Allocated balance {formatCurrency(account.currentBalance ?? 0)} · Monthly plan {formatCurrency(rates.get(account.id!) ?? 0)}</p></div><button class="text-primary-600 text-sm" onclick={() => edit(account)}>Edit plan</button></div>
				{#if projection}<p class="text-sm mt-2">Target {formatCurrency(account.targetAmount!)} · {projection.completion ? `Estimated completion ${format(projection.completion, 'MMM yyyy')}` : 'No completion estimate at this funding level'}{account.targetDate ? ` · Deadline ${format(account.targetDate, 'MMM d, yyyy')}` : ''}</p>{/if}
				{#if editing === account.id}
					<form onsubmit={save} class="space-y-3 mt-4">
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
							{#if account.accountType === 'savings'}
								<label>Corresponding bank account<select bind:value={bankId}><option value="">Unlinked</option>{#each banks.filter(b => b.isActive && b.accountClass === 'asset' && b.accountType === 'savings') as bank (bank.id)}<option value={bank.id}>{bank.name}</option>{/each}</select></label>
								<label>Explicit allocated balance<input required type="number" min="0" step="0.01" bind:value={allocation} /></label>
							{/if}
							<label>Monthly savings from {month}<input required type="number" min="0" step="0.01" bind:value={monthly} /></label>
						</div>
						<p class="text-xs text-charcoal-muted">Allocations are manual intentions. Contributions update them; bank sync never does. The monthly plan reserves only the amount beyond contributions already entered.</p>
						{#if error}<p role="alert" class="text-danger-600 text-sm">{error}</p>{/if}
						<button disabled={busy} class="btn-primary">Save allocation and plan</button> <button type="button" onclick={() => editing = null}>Cancel</button>
					</form>
				{/if}
			</div>
		{/each}
	</div>
	{#if planning.savingsPlans.length}
		<details class="text-sm"><summary class="cursor-pointer text-charcoal-muted">Saved contribution plans</summary>{#each planning.savingsPlans as plan (plan.id)}<div class="flex justify-between gap-3 py-2"><span>{accounts.find(a => a.id === plan.accountId)?.name ?? 'Deleted account'}: {formatCurrency(plan.amount)} from {plan.startMonth}{plan.endMonth ? ` through ${plan.endMonth}` : ''}</span><button class="text-danger-600" onclick={() => removePlan(plan.id)}>Remove</button></div>{/each}</details>
	{/if}
</section>

<style>
	label { display: block; font-size: .875rem; }
	input, select { display: block; width: 100%; margin-top: .25rem; padding: .6rem; border: 1px solid var(--color-border); border-radius: .5rem; background: var(--color-surface-alt); }
</style>
