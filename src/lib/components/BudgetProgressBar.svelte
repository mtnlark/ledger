<script lang="ts">
	import { getBudgetStatus } from '$lib/utils/budget-status';

	interface Props {
		spent: number;
		budget: number;
		showLabel?: boolean;
		size?: 'sm' | 'md';
	}

	let { spent, budget, showLabel = true, size = 'md' }: Props = $props();

	// Round values to whole dollars for status calculation
	// This ensures the status matches what users see in the UI (which uses formatCurrencyWhole)
	// e.g., $17.65/$18 displays as "$18/$18" so status should be "at", not "approaching"
	let roundedSpent = $derived(Math.round(spent));
	let roundedBudget = $derived(Math.round(budget));

	// Use centralized budget status utility for consistent color determination
	// Handles floating-point precision and provides 4-state color system:
	// under (green), approaching (yellow), at (gray), over (red)
	let budgetStatus = $derived(getBudgetStatus(roundedSpent, roundedBudget));

	let heightClass = $derived(size === 'sm' ? 'h-1.5' : 'h-2.5');
</script>

<div class="w-full">
	{#if showLabel}
		<div class="flex justify-between text-xs text-charcoal-muted mb-1.5">
			<span class="font-mono">{Math.round(budgetStatus.percentSpent)}%</span>
			{#if budgetStatus.label}
				<span class="{budgetStatus.textColorClass} {budgetStatus.status === 'over' ? 'font-medium' : ''}">
					{budgetStatus.label}
				</span>
			{/if}
		</div>
	{/if}
	<div
		class="{heightClass} bg-surface-alt rounded-full overflow-hidden shadow-[inset_0_1px_2px_rgba(45,42,38,0.08)]"
	>
		<div
			class="{heightClass} rounded-full {budgetStatus.colorClass} progress-fill"
			style="width: {budgetStatus.displayPercent}%"
		></div>
	</div>
</div>
