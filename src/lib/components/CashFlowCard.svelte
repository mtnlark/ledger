<script lang="ts">
	import { Check, AlertTriangle } from 'lucide-svelte';
	import type { MonthlyBudget } from '$lib/db';
	import { formatCurrency } from '$lib/utils/format-helpers';
	import { getBudgetStatus } from '$lib/utils/budget-status';

	interface Props {
		budget: MonthlyBudget | null;
		totalSpent: number;
		savedFromContributions: number;
		rolloverAdjustment?: number;
		onEditBudget?: () => void;
	}

	let { budget, totalSpent, savedFromContributions, rolloverAdjustment = 0, onEditBudget }: Props = $props();

	// Computed values
	let income = $derived(budget?.income ?? 0);
	let saved = $derived(savedFromContributions);
	let available = $derived(income - saved + rolloverAdjustment);
	let surplus = $derived(available - totalSpent);

	// Use getBudgetStatus for consistent color determination across the app
	// Rounds values to match displayed amounts (prevents display/status mismatch)
	let spendingStatus = $derived(
		available > 0 ? getBudgetStatus(Math.round(totalSpent), Math.round(available)) : null
	);
</script>

<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)]">
	<!-- Header -->
	<div class="px-5 py-3.5 flex items-center justify-between">
		<h2 class="text-xs font-medium uppercase tracking-wider text-charcoal-muted">Cash Flow</h2>
		{#if onEditBudget}
			<button
				onclick={onEditBudget}
				class="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
			>
				{budget ? 'Edit' : 'Set Budget'}
			</button>
		{/if}
	</div>

	<div class="px-5 pb-5 pt-4 border-t border-dashed border-theme-dashed">
		{#if !budget}
			<div class="text-center py-4 text-charcoal-muted">
				<p class="text-sm">No budget set for this month</p>
				{#if onEditBudget}
					<button
						onclick={onEditBudget}
						class="mt-2 text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
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

				{#if rolloverAdjustment !== 0}
					<div class="flex items-baseline">
						<span class="text-charcoal-soft text-sm">{rolloverAdjustment > 0 ? '+' : '−'} Budget rollover</span>
						<span class="ledger-line"></span>
						<span class="font-mono text-charcoal-soft">{formatCurrency(Math.abs(rolloverAdjustment))}</span>
					</div>
				{/if}

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
					<div class="mt-4 pt-4 border-t border-dashed border-theme-dashed">
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
</div>
