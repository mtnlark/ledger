<script lang="ts">
	import type { Category } from '$lib/db';
	import type { ExpenseSchedule } from '$lib/planning/types';
	import { saveSchedule } from '$lib/stores/planning';
	import { formatDateForInput } from '$lib/utils/date-helpers';
	let { categories, schedule = null, onSaved, onCancel }: { categories: Category[]; schedule?: ExpenseSchedule | null; onSaved: () => Promise<void>; onCancel: () => void } = $props();
	let merchant = $state('');
	let date = $state('');
	let amount = $state(0);
	let categoryId = $state(0);
	let frequency = $state<ExpenseSchedule['frequency']>('monthly');
	let amountType = $state<ExpenseSchedule['amountType']>('fixed');
	let isShared = $state(false);
	let autoMatch = $state(true);
	let splitType = $state<'percentage' | 'fixed'>('percentage');
	let splitValue = $state(.5);
	let error = $state('');
	let busy = $state(false);
	$effect(() => {
		merchant = schedule?.merchant ?? '';
		date = schedule?.date ?? formatDateForInput(new Date());
		amount = schedule?.amount ?? 0;
		categoryId = schedule?.categoryId ?? categories[0]?.id ?? 0;
		frequency = schedule?.frequency ?? 'monthly';
		amountType = schedule?.amountType ?? 'fixed';
		isShared = schedule?.isShared ?? false;
		autoMatch = schedule?.autoMatch ?? true;
		splitType = schedule?.splitType ?? 'percentage';
		splitValue = schedule?.splitValue ?? .5;
	});
	async function save(event: SubmitEvent) {
		event.preventDefault(); if (busy) return; busy = true; error = '';
		try {
			// Scale an accepted split schedule while retaining notes on each line.
			const allocations = schedule?.allocations?.map((line, index, lines) => ({ ...line, amount: index === lines.length - 1 ? Math.round((amount - lines.slice(0, -1).reduce((sum, l) => sum + Math.round(l.amount / schedule.amount * amount * 100) / 100, 0)) * 100) / 100 : Math.round(line.amount / schedule.amount * amount * 100) / 100 }));
			await saveSchedule({ ...schedule, id: schedule?.id ?? crypto.randomUUID(), merchant: merchant.trim(), date, amount, categoryId, frequency, amountType, isShared, splitType, splitValue, active: true, autoMatch, allocations });
			await onSaved();
		} catch (e) { error = e instanceof Error ? e.message : String(e); } finally { busy = false; }
	}
</script>

<form onsubmit={save} class="bg-surface-alt rounded-xl p-4 space-y-3">
	<h3 class="font-medium">{schedule ? 'Edit commitment' : 'New commitment'}</h3>
	<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
		<label>Merchant<input required bind:value={merchant} /></label>
		<label>{amountType === 'variable' ? 'Estimated full amount' : 'Full amount'}<input required type="number" min="0.01" step="0.01" bind:value={amount} /></label>
		<label>First due date<input required type="date" bind:value={date} /></label>
		<label>Repeat<select bind:value={frequency}><option value="once">One time</option><option value="monthly">Monthly</option><option value="semi-annual">Every six months</option><option value="annual">Annual</option></select></label>
		<label>Category<select bind:value={categoryId}>{#each categories as category (category.id)}<option value={category.id}>{category.name}</option>{/each}</select></label>
		<label>Amount<select bind:value={amountType}><option value="fixed">Fixed</option><option value="variable">Variable estimate</option></select></label>
	</div>
	<label class="flex items-center gap-2"><input type="checkbox" bind:checked={isShared} /> Shared expense</label>
	<label class="flex items-center gap-2"><input type="checkbox" bind:checked={autoMatch} /> Match nearby recorded payments automatically</label>
	{#if isShared}
		<div class="grid grid-cols-2 gap-3"><label>Split method<select bind:value={splitType}><option value="percentage">Partner fraction (0–1)</option><option value="fixed">Partner fixed amount</option></select></label><label>Partner share<input type="number" min="0" max={splitType === 'percentage' ? 1 : amount} step="0.01" bind:value={splitValue} /></label></div>
	{/if}
	{#if schedule?.allocations}<p class="text-xs text-charcoal-muted">Category splits are retained and scaled with the full amount.</p>{/if}
	{#if error}<p role="alert" class="text-sm text-danger-600">{error}</p>{/if}
	<div class="flex gap-3"><button disabled={busy} class="btn-primary">Save commitment</button><button type="button" onclick={onCancel}>Cancel</button></div>
</form>

<style>
	label { display: block; font-size: .875rem; }
	input:not([type=checkbox]), select { display: block; width: 100%; margin-top: .25rem; padding: .6rem; border: 1px solid var(--color-border); border-radius: .5rem; background: var(--color-surface); }
</style>
