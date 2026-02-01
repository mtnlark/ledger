<script lang="ts">
	import type { ChartConfiguration } from 'chart.js/auto';
	import type { ComponentType } from 'svelte';
	import { PieChart } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import ChartWrapper from './ChartWrapper.svelte';
	import EmptyState from './EmptyState.svelte';
	import type { Transaction, Category } from '$lib/db';
	import { getChartTheme, onThemeChange, type ChartTheme } from '$lib/utils/chart-theme';
	import { formatCurrency } from '$lib/utils/format-helpers';

	interface Props {
		transactions: Transaction[];
		categories: Category[];
	}

	let { transactions, categories }: Props = $props();

	// Theme state that reacts to dark mode changes
	let theme = $state<ChartTheme>(getChartTheme());

	// Watch for theme changes via shared observer
	$effect(() => {
		return onThemeChange(() => {
			theme = getChartTheme();
		});
	});

	// Calculate spending by category
	let categorySpending = $derived.by(() => {
		const spending: Map<number, number> = new Map();

		for (const t of transactions) {
			// For shared transactions, only count your portion
			const amount = t.isShared ? t.amount - t.partnerShare : t.amount;
			const current = spending.get(t.categoryId) || 0;
			spending.set(t.categoryId, current + amount);
		}

		// Sort by amount descending
		return Array.from(spending.entries())
			.map(([categoryId, amount]) => {
				const category = categories.find((c) => c.id === categoryId);
				return {
					categoryId,
					name: category?.name ?? 'Unknown',
					icon: category?.icon ?? '📦',
					color: category?.color ?? '#6b7280',
					amount
				};
			})
			.sort((a, b) => b.amount - a.amount);
	});

	// Total spending
	let totalSpending = $derived(categorySpending.reduce((sum, c) => sum + c.amount, 0));

	// Chart configuration
	let chartConfig = $derived<ChartConfiguration<'doughnut'>>({
		type: 'doughnut',
		data: {
			labels: categorySpending.map((c) => `${c.icon} ${c.name}`),
			datasets: [
				{
					data: categorySpending.map((c) => c.amount),
					backgroundColor: categorySpending.map((c) => c.color),
					borderWidth: 2,
					borderColor: theme.surfaceColor
				}
			]
		},
		options: {
			responsive: true,
			maintainAspectRatio: true,
			plugins: {
				legend: {
					display: false // We'll show our own legend
				},
				tooltip: {
					callbacks: {
						label: (context) => {
							const value = context.parsed;
							const percentage = totalSpending > 0 ? ((value / totalSpending) * 100).toFixed(1) : 0;
							return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${percentage}%)`;
						}
					}
				}
			},
			cutout: '60%'
		}
	});
</script>

<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
	<div class="px-6 py-4 border-b border-dashed border-theme-dashed">
		<h2 class="font-display text-xl font-medium text-charcoal">Spending by Category</h2>
		<p class="text-sm text-charcoal-muted mt-1">Total: <span class="font-mono">{formatCurrency(totalSpending)}</span></p>
	</div>

	<div class="p-6">
		{#if transactions.length === 0}
			<EmptyState
				icon={PieChart as ComponentType}
				title="No spending data yet"
				description="Add some transactions to see your category breakdown"
				actionLabel="Add Transaction"
				onAction={() => goto('/')}
			/>
		{:else}
			<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<!-- Chart -->
				<div class="flex items-center justify-center">
					<div class="w-full max-w-[250px]">
						<ChartWrapper config={chartConfig} />
					</div>
				</div>

				<!-- Legend / List -->
				<div class="space-y-2 max-h-[300px] overflow-auto">
					{#each categorySpending as cat (cat.categoryId)}
						{@const percentage = totalSpending > 0 ? (cat.amount / totalSpending) * 100 : 0}
						<div class="flex items-center gap-3 p-2 rounded-lg hover:bg-cream/50 transition-colors">
							<div
								class="w-3 h-3 rounded-full flex-shrink-0"
								style="background-color: {cat.color}"
							></div>
							<span class="text-lg flex-shrink-0">{cat.icon}</span>
							<span class="text-sm text-charcoal-soft flex-1 truncate">{cat.name}</span>
							<div class="text-right flex-shrink-0">
								<span class="text-sm font-mono font-medium text-charcoal">{formatCurrency(cat.amount)}</span>
								<span class="text-xs text-charcoal-muted ml-1 font-mono">({percentage.toFixed(0)}%)</span>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>
