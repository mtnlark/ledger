<script lang="ts">
	interface Props {
		spent: number;
		budget: number;
		showLabel?: boolean;
		size?: 'sm' | 'md';
	}

	let { spent, budget, showLabel = true, size = 'md' }: Props = $props();

	// Calculate percentage (capped at 100 for display, but track actual for color)
	let percentSpent = $derived(budget > 0 ? (spent / budget) * 100 : 0);
	let displayPercent = $derived(Math.min(100, percentSpent));

	// Determine color based on spending level
	// 0-80%: Sage Green (success)
	// 80-100%: Amber (warning)
	// >100%: Muted Rose (danger)
	let colorClass = $derived(
		percentSpent > 100
			? 'bg-gradient-to-r from-danger-300 to-danger-500'
			: percentSpent > 80
				? 'bg-gradient-to-r from-warning-300 to-warning-500'
				: 'bg-gradient-to-r from-success-200 to-success-500'
	);

	let heightClass = $derived(size === 'sm' ? 'h-1.5' : 'h-2.5');
</script>

<div class="w-full">
	{#if showLabel}
		<div class="flex justify-between text-xs text-charcoal-muted mb-1.5">
			<span class="font-mono">{Math.round(percentSpent)}%</span>
			{#if percentSpent > 100}
				<span class="text-danger-500 font-medium">Over budget</span>
			{:else if percentSpent > 80}
				<span class="text-warning-600">Approaching limit</span>
			{/if}
		</div>
	{/if}
	<div
		class="{heightClass} bg-surface-alt rounded-full overflow-hidden shadow-[inset_0_1px_2px_rgba(45,42,38,0.08)]"
	>
		<div
			class="{heightClass} rounded-full {colorClass} progress-fill"
			style="width: {displayPercent}%"
		></div>
	</div>
</div>
