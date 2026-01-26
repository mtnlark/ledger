<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { Check, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-svelte';
	import type { MonthlyBudget } from '$lib/db';
	import { formatCurrency } from '$lib/utils/format-helpers';
	import { getBudgetStatus } from '$lib/utils/budget-status';

	const STORAGE_KEY = 'ledger-cashflow-expanded';

	interface Props {
		budget: MonthlyBudget | null;
		totalSpent: number;
		monthDisplay: string;
		onEditBudget?: () => void;
		defaultExpanded?: boolean;
	}

	let { budget, totalSpent, monthDisplay, onEditBudget, defaultExpanded = true }: Props = $props();

	// Animation state
	let mounted = $state(false);
	// Initial value from prop, overridden by localStorage in onMount (intentionally not reactive)
	let isExpanded = $state(defaultExpanded);

	onMount(() => {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored !== null) {
			isExpanded = stored === 'true';
		}
		setTimeout(() => mounted = true, 50);
	});

	function toggleExpanded() {
		isExpanded = !isExpanded;
		localStorage.setItem(STORAGE_KEY, String(isExpanded));
	}

	// Computed values
	let income = $derived(budget?.income ?? 0);
	let saved = $derived(budget?.savedAmount ?? 0);
	let available = $derived(income - saved);
	let surplus = $derived(available - totalSpent);

	// Use getBudgetStatus for consistent color determination across the app
	// Rounds values to match displayed amounts (prevents display/status mismatch)
	let spendingStatus = $derived(
		available > 0 ? getBudgetStatus(Math.round(totalSpent), Math.round(available)) : null
	);
</script>

<div
	class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden transition-all duration-500 {mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}"
	style="transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);"
>
	<!-- Header (always visible) -->
	<div class="px-6 py-4 flex items-center justify-between">
		<button
			class="flex items-center gap-4 hover:opacity-80 transition-opacity text-left"
			onclick={toggleExpanded}
		>
			<h2 class="font-display text-2xl font-medium text-charcoal">{monthDisplay}</h2>
			{#if !isExpanded && budget}
				<!-- Collapsed preview: show surplus -->
				<div class="flex items-center gap-2">
					<span class="text-charcoal-muted text-sm">Surplus:</span>
					<span
						class="font-mono font-medium flex items-center gap-1 {surplus >= 0 ? 'text-success-500' : 'text-danger-500'}"
					>
						{formatCurrency(surplus)}
						{#if surplus >= 0}
							<Check size={16} strokeWidth={2.5} />
						{:else}
							<AlertTriangle size={16} />
						{/if}
					</span>
				</div>
			{/if}
		</button>
		<div class="flex items-center gap-3">
			{#if onEditBudget}
				<button
					onclick={onEditBudget}
					class="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
				>
					{budget ? 'Edit' : 'Set Budget'}
				</button>
			{/if}
			<button
				onclick={toggleExpanded}
				class="text-charcoal-muted hover:text-charcoal transition-colors p-1"
			>
				{#if isExpanded}
					<ChevronUp size={20} />
				{:else}
					<ChevronDown size={20} />
				{/if}
			</button>
		</div>
	</div>

	<!-- Cash Flow Breakdown (collapsible) -->
	{#if isExpanded}
		<div transition:slide={{ duration: 200 }} class="px-6 pb-6 pt-2 border-t border-dashed border-theme-dashed">
			{#if !budget}
				<div class="text-center py-6 text-charcoal-muted">
					<p>No budget set for this month</p>
					{#if onEditBudget}
						<button
							onclick={onEditBudget}
							class="mt-3 text-primary-600 hover:text-primary-700 font-medium transition-colors"
						>
							Set income & savings
						</button>
					{/if}
				</div>
			{:else}
				<div class="space-y-3">
					<!-- Income -->
					<div class="flex items-baseline">
						<span class="text-charcoal-soft text-sm">Income</span>
						<span class="ledger-line"></span>
						<span class="font-mono font-medium text-charcoal">{formatCurrency(income)}</span>
					</div>

					<!-- Saved -->
					<div class="flex items-baseline">
						<span class="text-charcoal-soft text-sm">− Saved</span>
						<span class="ledger-line"></span>
						<span class="font-mono text-charcoal-soft">{formatCurrency(saved)}</span>
					</div>

					<!-- Divider -->
					<div class="border-t border-theme my-2"></div>

					<!-- Available -->
					<div class="flex items-baseline">
						<span class="text-charcoal-soft text-sm">Available</span>
						<span class="ledger-line"></span>
						<span class="font-mono font-medium text-charcoal">{formatCurrency(available)}</span>
					</div>

					<!-- Spent -->
					<div class="flex items-baseline">
						<span class="text-charcoal-soft text-sm">− Spent</span>
						<span class="ledger-line"></span>
						<span class="font-mono text-charcoal-soft">{formatCurrency(totalSpent)}</span>
					</div>

					<!-- Divider -->
					<div class="border-t border-theme my-2"></div>

					<!-- Surplus - Hero Element -->
					<div class="flex items-baseline">
						<span class="text-charcoal-soft text-sm">Surplus</span>
						<span class="ledger-line"></span>
						<span
							class="font-mono text-2xl font-medium flex items-center gap-2 {surplus >= 0 ? 'text-success-500' : 'text-danger-500'}"
						>
							{formatCurrency(surplus)}
							{#if surplus >= 0}
								<Check size={20} strokeWidth={2.5} class="text-success-500" />
							{:else}
								<AlertTriangle size={20} class="text-danger-500" />
							{/if}
						</span>
					</div>

					<!-- Progress Bar -->
					{#if available > 0 && spendingStatus}
						<div class="mt-5 pt-4 border-t border-dashed border-theme-dashed">
							<div class="flex justify-between text-xs text-charcoal-muted mb-2">
								<span>Spending Progress</span>
								<span class="font-mono">{Math.round(spendingStatus.percentSpent)}% used</span>
							</div>
							<div class="h-2.5 bg-surface-alt rounded-full overflow-hidden shadow-[inset_0_1px_2px_rgba(45,42,38,0.08)]">
								<div
									class="h-full rounded-full transition-all duration-500 ease-out {spendingStatus.colorClass}"
									style="width: {spendingStatus.displayPercent}%"
								></div>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
