<script lang="ts">
	import { Pencil, Check, X, Sparkles } from 'lucide-svelte';
	import BudgetProgressBar from './BudgetProgressBar.svelte';
	import type { Category } from '$lib/db';
	import { formatCurrencyWhole } from '$lib/utils/modal-helpers';

	interface Props {
		category: Category;
		spent: number;
		budgetAmount: number | null;
		suggestedAmount?: number;
		onSaveBudget: (amount: number) => void;
		onDeleteBudget: () => void;
		onAcceptSuggestion?: () => void;
	}

	let {
		category,
		spent,
		budgetAmount,
		suggestedAmount = 0,
		onSaveBudget,
		onDeleteBudget,
		onAcceptSuggestion
	}: Props = $props();

	// Editing state
	let isEditing = $state(false);
	let editValue = $state('');

	function startEditing() {
		editValue = budgetAmount ? String(budgetAmount) : '';
		isEditing = true;
	}

	function cancelEditing() {
		isEditing = false;
		editValue = '';
	}

	function saveEdit() {
		const amount = parseFloat(editValue);
		if (!isNaN(amount) && amount > 0) {
			onSaveBudget(amount);
		} else if (editValue === '' || editValue === '0') {
			onDeleteBudget();
		}
		isEditing = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			saveEdit();
		} else if (e.key === 'Escape') {
			cancelEditing();
		}
	}

	let hasBudget = $derived(budgetAmount !== null && budgetAmount > 0);
	let showSuggestion = $derived(!hasBudget && suggestedAmount > 0);
</script>

<div
	class="bg-surface rounded-lg shadow-sm shadow-theme p-4 flex items-center gap-4 transition-colors hover:shadow-md"
>
	<!-- Category Icon -->
	<div
		class="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0"
		style="background-color: {category.color}20"
	>
		{category.icon || '📦'}
	</div>

	<!-- Category Name & Progress -->
	<div class="flex-1 min-w-0">
		<div class="flex items-center gap-2 mb-1">
			<span class="font-medium text-charcoal truncate">{category.name}</span>
			{#if showSuggestion && onAcceptSuggestion}
				<button
					onclick={onAcceptSuggestion}
					class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
						bg-primary-50 text-primary-600 hover:bg-primary-100 transition-colors"
					title="Based on your last 3 months of spending"
				>
					<Sparkles size={12} />
					{formatCurrencyWhole(suggestedAmount)}
				</button>
			{/if}
		</div>

		{#if hasBudget}
			<BudgetProgressBar spent={spent} budget={budgetAmount!} showLabel={false} size="sm" />
		{:else}
			<div class="h-1.5 bg-surface-alt rounded-full"></div>
		{/if}
	</div>

	<!-- Amount Display / Edit -->
	<div class="flex items-center gap-3 shrink-0 w-40 justify-end">
		{#if isEditing}
			<div class="flex items-center gap-2">
				<span class="text-charcoal-muted font-mono">$</span>
				<input
					type="text"
					inputmode="numeric"
					pattern="[0-9]*"
					bind:value={editValue}
					onkeydown={handleKeydown}
					class="w-20 px-3 py-1.5 text-right font-mono text-sm border border-theme rounded-lg
						focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
						bg-surface text-charcoal"
					placeholder="0"
					autofocus
				/>
				<button
					onclick={saveEdit}
					class="p-1.5 text-success-600 hover:bg-success-50 rounded-md transition-colors"
				>
					<Check size={16} />
				</button>
				<button
					onclick={cancelEditing}
					class="p-1.5 text-charcoal-muted hover:bg-surface-alt rounded-md transition-colors"
				>
					<X size={16} />
				</button>
			</div>
		{:else}
			<div class="text-right min-w-24">
				<span class="font-mono text-sm text-charcoal">{formatCurrencyWhole(spent)}</span>
				{#if hasBudget}
					<span class="font-mono text-sm text-charcoal-muted"> / {formatCurrencyWhole(budgetAmount!)}</span>
				{/if}
			</div>
			<button
				onclick={startEditing}
				class="p-1.5 text-charcoal-muted hover:text-primary-600 hover:bg-primary-50 rounded-md transition-colors"
				title={hasBudget ? 'Edit budget' : 'Set budget'}
			>
				<Pencil size={16} />
			</button>
		{/if}
	</div>
</div>
