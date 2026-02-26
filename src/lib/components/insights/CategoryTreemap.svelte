<script lang="ts">
	import type { ChartConfiguration } from 'chart.js/auto';
	import type { Transaction, Category } from '$lib/db';
	import { roundCurrency } from '$lib/utils/currency';
	import ChartWrapper from '../ChartWrapper.svelte';
	import { getChartTheme, onThemeChange, type ChartTheme } from '$lib/utils/chart-theme';

	interface Props {
		transactions: Transaction[];
		categories: Category[];
	}

	let { transactions, categories }: Props = $props();

	// Theme state that reacts to dark mode changes
	let theme = $state<ChartTheme>(getChartTheme());

	$effect(() => {
		return onThemeChange(() => {
			theme = getChartTheme();
		});
	});

	// Compute category spending data
	let categoryData = $derived.by(() => {
		const byCategory = new Map<number, number>();
		for (const t of transactions) {
			const userAmount = t.isShared ? t.amount - t.partnerShare : t.amount;
			byCategory.set(t.categoryId, (byCategory.get(t.categoryId) || 0) + userAmount);
		}

		const items: Array<{
			name: string;
			icon: string;
			amount: number;
			color: string;
		}> = [];

		for (const [catId, amount] of byCategory) {
			if (amount <= 0) continue;
			const cat = categories.find(c => c.id === catId);
			if (!cat) continue;
			items.push({
				name: cat.name,
				icon: cat.icon || '📁',
				amount: roundCurrency(amount),
				color: cat.color || '#C45D3A'
			});
		}

		// Sort by amount descending
		items.sort((a, b) => b.amount - a.amount);
		return items;
	});

	let totalSpending = $derived(categoryData.reduce((sum, c) => sum + c.amount, 0));

	// Chart configuration for treemap
	let chartConfig = $derived<ChartConfiguration<'treemap'>>({
		type: 'treemap',
		data: {
			datasets: [{
				tree: categoryData,
				key: 'amount',
				backgroundColor: (ctx) => {
					const item = categoryData[ctx.dataIndex];
					return item?.color || '#C45D3A';
				},
				borderColor: theme.surfaceColor,
				borderWidth: 2,
				spacing: 1,
				labels: {
					display: true,
					align: 'center',
					position: 'middle',
					color: 'white',
					font: {
						size: 14,
						weight: 'bold'
					},
					formatter: (ctx) => {
						const item = categoryData[ctx.dataIndex];
						if (!item) return '';
						const w = ctx.raw.w;
						const h = ctx.raw.h;
						// Tiered display based on box size
						if (w < 40 || h < 30) return ''; // Too small - nothing
						if (w < 65 || h < 45) return item.icon; // Small - just icon
						// Large enough - icon and whole dollar amount
						return [item.icon, `$${Math.round(item.amount).toLocaleString()}`];
					}
				}
			}]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: {
					display: false
				},
				tooltip: {
					callbacks: {
						title: (items) => {
							const item = categoryData[items[0]?.dataIndex];
							return item ? `${item.icon} ${item.name}` : '';
						},
						label: (ctx) => {
							const item = categoryData[ctx.dataIndex];
							if (!item) return '';
							const pct = totalSpending > 0 ? Math.round((item.amount / totalSpending) * 100) : 0;
							return `$${Math.round(item.amount).toLocaleString()} (${pct}%)`;
						}
					}
				}
			}
		}
	});

	let hasData = $derived(categoryData.length > 0);
</script>

{#if hasData}
	<div class="h-[220px]">
		<ChartWrapper config={chartConfig} class="h-full" />
	</div>
{:else}
	<p class="text-sm text-charcoal-muted text-center py-8">No spending data</p>
{/if}
