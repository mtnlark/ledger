<script lang="ts">
	import type { Transaction, Category } from '$lib/db';
	import InsightGroup from './InsightGroup.svelte';

	interface Props {
		transactions: Transaction[];
		categories: Category[];
		allTransactions: Transaction[];
	}

	let { transactions, categories, allTransactions }: Props = $props();

	// Calculate needs vs wants for current month (uses transaction's isEssential)
	let currentMonthStats = $derived.by(() => {
		let needs = 0;
		let wants = 0;

		for (const tx of transactions) {
			const userAmount = tx.isShared ? tx.amount - tx.partnerShare : tx.amount;

			if (tx.isEssential) {
				needs += userAmount;
			} else {
				wants += userAmount;
			}
		}

		const total = needs + wants;
		const needsPercent = total > 0 ? (needs / total) * 100 : 0;
		const wantsPercent = total > 0 ? (wants / total) * 100 : 0;

		return { needs, wants, total, needsPercent, wantsPercent };
	});

	// Calculate all-time stats
	let allTimeStats = $derived.by(() => {
		let needs = 0;
		let wants = 0;

		for (const tx of allTransactions) {
			const userAmount = tx.isShared ? tx.amount - tx.partnerShare : tx.amount;

			if (tx.isEssential) {
				needs += userAmount;
			} else {
				wants += userAmount;
			}
		}

		const total = needs + wants;
		const needsPercent = total > 0 ? (needs / total) * 100 : 0;
		const wantsPercent = total > 0 ? (wants / total) * 100 : 0;

		return { needs, wants, total, needsPercent, wantsPercent };
	});

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

	function formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 0,
			maximumFractionDigits: 0
		}).format(amount);
	}
</script>

<InsightGroup title="Needs vs Wants" description="Essential vs discretionary spending">
	{#snippet preview()}
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
	{/snippet}

	{#snippet children()}
		{#if currentMonthStats.total === 0}
			<div class="text-center py-6">
				<p class="text-charcoal-soft font-medium">No spending data</p>
				<p class="text-sm text-charcoal-muted mt-1">
					Add transactions to see your needs vs wants breakdown
				</p>
			</div>
		{:else}
			<!-- Visual Bar -->
			<div class="mb-6">
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
							Needs: {formatCurrency(currentMonthStats.needs)}
						</span>
					</div>
					<div class="flex items-center gap-2">
						<div class="w-3 h-3 rounded bg-gray-300"></div>
						<span class="text-charcoal-soft">
							Wants: {formatCurrency(currentMonthStats.wants)}
						</span>
					</div>
				</div>
			</div>

			<!-- Stats Grid -->
			<div class="grid grid-cols-2 gap-4 mb-6">
				<div class="bg-primary-50 rounded-lg p-4">
					<p class="text-sm text-charcoal-muted mb-1">This Month - Needs</p>
					<p class="text-2xl font-mono font-medium text-charcoal">
						{formatCurrency(currentMonthStats.needs)}
					</p>
					<p class="text-sm text-primary-600 font-medium">
						{currentMonthStats.needsPercent.toFixed(1)}% of spending
					</p>
				</div>
				<div class="bg-cream rounded-lg p-4">
					<p class="text-sm text-charcoal-muted mb-1">This Month - Wants</p>
					<p class="text-2xl font-mono font-medium text-charcoal">
						{formatCurrency(currentMonthStats.wants)}
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
									<span class="font-mono text-sm text-charcoal-soft">{formatCurrency(amount)}</span>
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
									<span class="font-mono text-sm text-charcoal-soft">{formatCurrency(amount)}</span>
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
				<div class="mt-6 pt-4 border-t border-dashed border-gray-200">
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
		{/if}
	{/snippet}
</InsightGroup>
