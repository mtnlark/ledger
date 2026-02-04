<script lang="ts">
	import type { Transaction, Category } from '$lib/db';
	import { goto } from '$app/navigation';
	import { formatCurrencyWhole } from '$lib/utils/format-helpers';
	import { getInsightsEngine } from '$lib/insights';
	import NeedsWantsTrendChart from './NeedsWantsTrendChart.svelte';

	interface Props {
		transactions: Transaction[];
		categories: Category[];
		allTransactions: Transaction[];
	}

	let { transactions, categories, allTransactions }: Props = $props();

	const engine = getInsightsEngine();

	// Calculate needs vs wants for current month
	let currentMonthStats = $derived(engine.getNeedsVsWantsFull(transactions, 'current-month'));

	// Calculate all-time stats
	let allTimeStats = $derived(engine.getNeedsVsWantsFull(allTransactions, 'all-time'));

	// Get top essential and discretionary categories for current month
	let topCategories = $derived.by(() => {
		const essentialTotals = new Map<number, number>();
		const discretionaryTotals = new Map<number, number>();

		for (const tx of transactions) {
			const userAmount = tx.isShared ? tx.amount - tx.partnerShare : tx.amount;
			const targetMap = tx.isEssential ? essentialTotals : discretionaryTotals;
			targetMap.set(tx.categoryId, (targetMap.get(tx.categoryId) ?? 0) + userAmount);
		}

		const toSorted = (map: Map<number, number>) =>
			Array.from(map.entries())
				.sort((a, b) => b[1] - a[1])
				.slice(0, 3)
				.map(([catId, amount]) => {
					const cat = categories.find((c) => c.id === catId);
					return { category: cat, amount };
				});

		return {
			essential: toSorted(essentialTotals),
			discretionary: toSorted(discretionaryTotals)
		};
	});
</script>

<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
	<div class="px-6 py-4">
		<h2 class="font-display text-xl font-medium text-charcoal">Needs vs Wants</h2>
		<p class="text-sm text-charcoal-muted mt-0.5">Essential vs discretionary spending</p>
	</div>
	<div class="px-6 pb-6 space-y-6">
		<!-- Needs/Wants percentage row -->
		{#if currentMonthStats.total === 0}
			<p class="text-charcoal-muted text-sm">No spending data this month</p>
		{:else}
			<div class="flex items-center gap-4">
				<div>
					<span class="font-mono text-lg font-medium text-charcoal">
						{currentMonthStats.needsPercent.toFixed(0)}%
					</span>
					<span class="text-sm text-charcoal-muted ml-1">needs</span>
				</div>
				<div class="text-charcoal-muted">/</div>
				<div>
					<span class="font-mono text-lg font-medium text-charcoal">
						{currentMonthStats.wantsPercent.toFixed(0)}%
					</span>
					<span class="text-sm text-charcoal-muted ml-1">wants</span>
				</div>
			</div>
		{/if}

		{#if currentMonthStats.total === 0}
			<div class="text-center py-6">
				<p class="text-charcoal-soft font-medium">No spending data</p>
				<p class="text-sm text-charcoal-muted mt-1">
					Add transactions to see your needs vs wants breakdown
				</p>
				<button
					onclick={() => goto('/')}
					class="mt-3 px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 transition-colors"
				>
					Add Transaction
				</button>
			</div>
		{:else}
			<!-- Visual Bar -->
			<div>
				<div class="h-8 rounded-full overflow-hidden flex">
					<div
						class="bg-primary-500 transition-all duration-500"
						style="width: {currentMonthStats.needsPercent}%"
					></div>
					<div
						class="bg-gray-300 transition-all duration-500"
						style="width: {currentMonthStats.wantsPercent}%"
					></div>
				</div>
				<div class="flex justify-between mt-2 text-sm">
					<div class="flex items-center gap-2">
						<div class="w-3 h-3 rounded bg-primary-500"></div>
						<span class="text-charcoal-soft">
							Needs: {formatCurrencyWhole(currentMonthStats.needs)}
						</span>
					</div>
					<div class="flex items-center gap-2">
						<div class="w-3 h-3 rounded bg-gray-300"></div>
						<span class="text-charcoal-soft">
							Wants: {formatCurrencyWhole(currentMonthStats.wants)}
						</span>
					</div>
				</div>
			</div>

			<!-- Stats Grid -->
			<div class="grid grid-cols-2 gap-4">
				<div class="bg-primary-50 rounded-lg p-4">
					<p class="text-sm text-charcoal-muted mb-1">This Month - Needs</p>
					<p class="text-2xl font-mono font-medium text-charcoal">
						{formatCurrencyWhole(currentMonthStats.needs)}
					</p>
					<p class="text-sm text-primary-600 font-medium">
						{currentMonthStats.needsPercent.toFixed(1)}% of spending
					</p>
				</div>
				<div class="bg-cream rounded-lg p-4">
					<p class="text-sm text-charcoal-muted mb-1">This Month - Wants</p>
					<p class="text-2xl font-mono font-medium text-charcoal">
						{formatCurrencyWhole(currentMonthStats.wants)}
					</p>
					<p class="text-sm text-charcoal-soft font-medium">
						{currentMonthStats.wantsPercent.toFixed(1)}% of spending
					</p>
				</div>
			</div>

			<!-- Top Categories -->
			<div class="grid grid-cols-2 gap-4">
				<!-- Top Essential -->
				<div>
					<h4 class="text-sm font-medium text-charcoal-muted mb-2">Top Needs</h4>
					<div class="space-y-2">
						{#each topCategories.essential as { category, amount }}
							{#if category}
								<div class="flex items-center gap-2">
									<span class="text-lg">{category.icon}</span>
									<span class="text-sm text-charcoal truncate flex-1">{category.name}</span>
									<span class="font-mono text-sm text-charcoal-soft">{formatCurrencyWhole(amount)}</span>
								</div>
							{/if}
						{:else}
							<p class="text-sm text-charcoal-muted italic">No essential spending</p>
						{/each}
					</div>
				</div>

				<!-- Top Discretionary -->
				<div>
					<h4 class="text-sm font-medium text-charcoal-muted mb-2">Top Wants</h4>
					<div class="space-y-2">
						{#each topCategories.discretionary as { category, amount }}
							{#if category}
								<div class="flex items-center gap-2">
									<span class="text-lg">{category.icon}</span>
									<span class="text-sm text-charcoal truncate flex-1">{category.name}</span>
									<span class="font-mono text-sm text-charcoal-soft">{formatCurrencyWhole(amount)}</span>
								</div>
							{/if}
						{:else}
							<p class="text-sm text-charcoal-muted italic">No discretionary spending</p>
						{/each}
					</div>
				</div>
			</div>

			<!-- All-time comparison -->
			{#if allTransactions.length > transactions.length}
				<div class="pt-4 border-t border-dashed border-theme">
					<h4 class="text-sm font-medium text-charcoal-muted mb-2">All-Time Average</h4>
					<div class="flex items-center gap-4 text-sm">
						<span class="text-charcoal-soft">
							<span class="font-mono font-medium">{allTimeStats.needsPercent.toFixed(0)}%</span> needs
						</span>
						<span class="text-charcoal-muted">/</span>
						<span class="text-charcoal-soft">
							<span class="font-mono font-medium">{allTimeStats.wantsPercent.toFixed(0)}%</span> wants
						</span>
					</div>
				</div>
			{/if}

			<!-- Needs vs Wants Trend -->
			{#if allTransactions.length > 0}
				<div class="pt-4 border-t border-dashed border-theme">
					<h4 class="text-sm font-medium text-charcoal-muted mb-3">Trend Over Time</h4>
					<NeedsWantsTrendChart {allTransactions} {categories} />
				</div>
			{/if}
		{/if}
	</div>
</div>
