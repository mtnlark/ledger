<script lang="ts">
	import { Pencil, Check, X, Sparkles, Repeat } from 'lucide-svelte';
	import BudgetProgressBar from './BudgetProgressBar.svelte';
	import type { Category } from '$lib/db';
	import { formatCurrencyWhole } from '$lib/utils/format-helpers';
	import { roundCurrency } from '$lib/utils/currency';

	interface Props {
		category: Category;
		spent: number;
		budgetAmount: number | null;
		suggestedAmount?: number;
		/** Surplus rolled into this category from last month (≥ 0). */
		carryover?: number;
		/** Whether this month's budget rolls unused amounts forward. */
		rollsOver?: boolean;
		onSaveBudget: (amount: number) => void | Promise<void>;
		onDeleteBudget: () => void | Promise<void>;
		onAcceptSuggestion?: () => void;
		onToggleRollover?: (rollsOver: boolean) => void | Promise<void>;
	}

	let {
		category,
		spent,
		budgetAmount,
		suggestedAmount = 0,
		carryover = 0,
		rollsOver = false,
		onSaveBudget,
		onDeleteBudget,
		onAcceptSuggestion,
		onToggleRollover
	}: Props = $props();

	// Editing state
	let isEditing = $state(false);
	let editValue = $state('');
	let editRollsOver = $state(false);
	let inputRef = $state<HTMLInputElement | null>(null);

	function startEditing() {
		editValue = budgetAmount ? String(budgetAmount) : '';
		editRollsOver = rollsOver;
		isEditing = true;
		// Use queueMicrotask for better screen reader UX vs autofocus attribute
		queueMicrotask(() => inputRef?.focus());
	}

	function cancelEditing() {
		isEditing = false;
		editValue = '';
	}

	async function saveEdit() {
		const amount = parseFloat(editValue);
		isEditing = false;
		if (!isNaN(amount) && amount > 0) {
			// Await so the row exists before the rollover flag is written to it
			await onSaveBudget(amount);
			if (editRollsOver !== rollsOver) {
				await onToggleRollover?.(editRollsOver);
			}
		} else if (editValue === '' || editValue === '0') {
			await onDeleteBudget();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			saveEdit();
		} else if (e.key === 'Escape') {
			cancelEditing();
		}
	}

	let hasBudget = $derived(budgetAmount !== null && budgetAmount > 0);
	let effectiveBudget = $derived(hasBudget ? roundCurrency(budgetAmount! + carryover) : null);
	let showSuggestion = $derived(!hasBudget && suggestedAmount > 0);
</script>

<div
	class="bg-surface rounded-lg shadow-sm shadow-theme p-4 flex items-center gap-4 transition-colors hover:shadow-md"
>

	<!-- Category Name & Progress -->
	<div class="flex-1 min-w-0">
		<div class="flex items-center gap-2 mb-1">
			<span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: {category.color};" aria-hidden="true"></span>
			<span class="font-medium text-charcoal truncate">{category.name}</span>
			{#if carryover > 0}
				<span
					class="font-mono text-xs text-success-600 shrink-0"
					title="Includes {formatCurrencyWhole(carryover)} rolled over from last month"
				>+{formatCurrencyWhole(carryover)}</span>
			{:else if rollsOver}
				<span class="text-charcoal-muted/70 shrink-0" title="Unused budget rolls over to next month">
					<Repeat size={12} />
				</span>
			{/if}
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
			<BudgetProgressBar spent={spent} budget={effectiveBudget!} showLabel={false} size="sm" />
		{:else}
			<div class="h-1.5 bg-surface-alt rounded-full"></div>
		{/if}
	</div>

	<!-- Amount Display / Edit -->
	<div class="flex items-center gap-3 shrink-0 justify-end {isEditing ? '' : 'w-40'}">
		{#if isEditing}
			<div class="flex items-center gap-2">
				{#if onToggleRollover}
					<button
						type="button"
						onclick={() => (editRollsOver = !editRollsOver)}
						aria-pressed={editRollsOver}
						class="p-1.5 rounded-md transition-colors {editRollsOver
							? 'text-primary-600 bg-primary-50'
							: 'text-charcoal-muted hover:bg-surface-alt'}"
						title="Roll over unused budget to next month"
					>
						<Repeat size={16} />
					</button>
				{/if}
				<span class="text-charcoal-muted font-mono">$</span>
				<input
					type="text"
					inputmode="numeric"
					pattern="[0-9]*"
					bind:value={editValue}
					bind:this={inputRef}
					onkeydown={handleKeydown}
					class="w-20 px-3 py-1.5 text-right font-mono text-sm border border-theme rounded-lg
						focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500
						bg-surface text-charcoal"
					placeholder="0"
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
					<span
						class="font-mono text-sm text-charcoal-muted"
						title={carryover > 0
							? `${formatCurrencyWhole(budgetAmount!)} budget + ${formatCurrencyWhole(carryover)} rolled over`
							: undefined}
					> / {formatCurrencyWhole(effectiveBudget!)}</span>
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
