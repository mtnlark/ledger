<script lang="ts">
	import { getMonthKey, type SavingsAccount, type SavingsContribution, type Category } from '$lib/db';
	import { getAllCategories } from '$lib/stores/categories';
	import { getEffectiveBudgetsForMonth } from '$lib/stores/categoryBudget';
	import { addContribution, updateContribution, deleteContribution } from '$lib/stores/savingsContributions';
	import { PersistenceError, saveStatus } from '$lib/storage';
	import { parseLocalDate, formatDateForInput } from '$lib/utils/date-helpers';
	import { formatCurrency } from '$lib/utils/format-helpers';
	import { roundCurrency } from '$lib/utils/currency';
	import ModalContainer from './ModalContainer.svelte';

	interface Props {
		isOpen: boolean;
		accounts: SavingsAccount[];
		preselectedAccountId?: number;
		contribution?: SavingsContribution | null;
		onSave: () => void | Promise<void>;
		onDelete: () => void | Promise<void>;
		onClose: () => void;
	}
	let { isOpen, accounts, preselectedAccountId, contribution = null, onSave, onDelete, onClose }: Props = $props();
	let accountId = $state<number | ''>('');
	let amount = $state('');
	let date = $state('');
	let note = $state('');
	let categoryId = $state<number | ''>('');
	let categories = $state<Category[]>([]);
	let allowance = $state<number | null>(null);
	let busy = $state(false);
	let error = $state('');
	let confirmDelete = $state(false);
	const today = formatDateForInput(new Date());
	let value = $derived(Number(amount));
	let month = $derived(date.slice(0, 7));
	let balance = $derived(roundCurrency((accounts.find(a => a.id === accountId)?.currentBalance ?? 0) - (contribution?.accountId === accountId ? contribution.amount : 0) - (Number.isFinite(value) ? value : 0)));
	let blocked = $derived(busy || $saveStatus !== 'saved');
	$effect(() => {
		if (isOpen) {
			accountId = contribution?.accountId ?? preselectedAccountId ?? '';
			amount = contribution ? String(-contribution.amount) : '';
			date = contribution ? formatDateForInput(contribution.date) : today;
			note = contribution?.notes ?? '';
			categoryId = contribution?.budgetCategoryId ?? '';
			error = ''; busy = false; confirmDelete = false;
		}
	});
	$effect(() => {
		if (!isOpen) return;
		let active = true;
		getAllCategories().then(rows => { if (active) categories = rows; }).catch(() => { if (active) error = 'Could not load categories'; });
		return () => { active = false; };
	});
	$effect(() => {
		const selected = categoryId, selectedMonth = month, original = contribution;
		allowance = null;
		if (!isOpen || !selected || !/^\d{4}-\d{2}$/.test(selectedMonth)) return;
		let active = true;
		getEffectiveBudgetsForMonth(selectedMonth).then(result => {
			if (active) allowance = roundCurrency((result.byCategory.get(selected)?.effective ?? 0) + (original?.budgetCategoryId === selected && getMonthKey(original.date) === selectedMonth ? original.amount : 0));
		}).catch(() => { if (active) error = 'Could not load category allowance'; });
		return () => { active = false; };
	});
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (blocked) return;
		busy = true; error = '';
		try {
			const data = { accountId: Number(accountId), amount: -value, date: parseLocalDate(date), kind: 'withdrawal' as const, source: 'bank_transfer' as const, budgetCategoryId: categoryId || undefined, notes: note.trim() || undefined };
			if (contribution?.id) await updateContribution(contribution.id, data);
			else await addContribution(data);
		} catch (cause) {
			if (cause instanceof PersistenceError && cause.applied) { onClose(); return; }
			error = cause instanceof Error ? cause.message : 'Could not save withdrawal'; busy = false; return;
		}
		await onSave();
	}
	async function remove() {
		if (blocked || !contribution?.id) return;
		busy = true; error = '';
		try { await deleteContribution(contribution.id); }
		catch (cause) {
			if (cause instanceof PersistenceError && cause.applied) { onClose(); return; }
			error = cause instanceof Error ? cause.message : 'Could not delete withdrawal'; busy = false; return;
		}
		await onDelete();
	}
</script>

<ModalContainer {isOpen} title={contribution ? 'Edit withdrawal' : 'Use savings'} titleId="use-savings-title" {onClose}>
	<form onsubmit={save} class="p-6 space-y-4">
		{#if error}<p role="alert" class="text-danger-600">{error}</p>{/if}
		<label class="block text-sm text-charcoal-soft">Fund
			<select required bind:value={accountId} class="mt-1 w-full p-2.5 bg-surface-alt border border-theme rounded-lg">
				<option value="">Choose a savings fund</option>
				{#each accounts.filter(a => a.accountType === 'savings') as account (account.id)}<option value={account.id}>{account.icon} {account.name}</option>{/each}
			</select>
		</label>
		<div class="grid grid-cols-2 gap-4">
			<label class="block text-sm text-charcoal-soft">Amount<input required type="number" min="0.01" step="0.01" bind:value={amount} class="mt-1 w-full p-2.5 bg-surface-alt border border-theme rounded-lg font-mono" /></label>
			<label class="block text-sm text-charcoal-soft">Actual date<input required type="date" max={today} bind:value={date} class="mt-1 w-full p-2.5 bg-surface-alt border border-theme rounded-lg" /></label>
		</div>
		<label class="block text-sm text-charcoal-soft">Add to category budget
			<select bind:value={categoryId} class="mt-1 w-full p-2.5 bg-surface-alt border border-theme rounded-lg">
				<option value="">Unallocated</option>
				{#each categories.filter(c => c.isActive || c.id === contribution?.budgetCategoryId) as category (category.id)}<option value={category.id}>{category.icon} {category.name}</option>{/each}
			</select>
		</label>
		<label class="block text-sm text-charcoal-soft">Note (optional)<input bind:value={note} class="mt-1 w-full p-2.5 bg-surface-alt border border-theme rounded-lg" /></label>
		{#if accountId && value > 0}
			<div class="p-4 bg-surface-alt border border-theme rounded-lg space-y-2 text-sm" aria-live="polite">
				<p>Fund balance after: <span class="font-mono">{formatCurrency(balance)}</span></p>
				<p>Spending month: {month}</p>
				{#if categoryId && allowance !== null}<p>Category allowance after: <span class="font-mono">{formatCurrency(allowance + value)}</span></p>{:else if !categoryId}<p>Released money stays unallocated.</p>{/if}
				<p>Purchases are recorded separately. Category funding is included in this withdrawal.</p>
			</div>
		{/if}
		{#if contribution}
			{#if confirmDelete}<p class="text-sm">Delete this withdrawal and remove its category funding?</p><button type="button" disabled={blocked} onclick={remove} class="text-danger-600">Confirm delete withdrawal</button>{:else}<button type="button" disabled={blocked} onclick={() => confirmDelete = true} class="text-danger-600 text-sm">Delete withdrawal</button>{/if}
		{/if}
		<div class="flex justify-end gap-3 pt-3">
			<button type="button" disabled={busy} onclick={onClose} class="px-4 py-2.5 border border-theme rounded-lg">Cancel</button>
			<button type="submit" disabled={blocked || !accountId || !(value > 0) || balance < 0 || !date || date > today || (!!categoryId && allowance === null)} class="px-4 py-2.5 bg-primary-500 text-white rounded-lg disabled:opacity-50">{busy ? 'Saving…' : contribution ? 'Save withdrawal' : 'Use savings'}</button>
		</div>
	</form>
</ModalContainer>
