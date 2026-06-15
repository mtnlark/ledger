<script lang="ts">
	import { format } from 'date-fns';
	import { type ChartConfiguration } from 'chart.js/auto';
	import ChartWrapper from '../ChartWrapper.svelte';
	import { parseMonthKey, getMonthKey, type Transaction } from '$lib/db';
	import { sumCurrency, getUserAmount } from '$lib/utils/currency';
	import { getChartTheme, onThemeChange, type ChartTheme } from '$lib/utils/chart-theme';

	interface Props {
		allTransactions: Transaction[];
		categories: { id?: number; isEssential: boolean }[];
	}

	let { allTransactions, categories }: Props = $props();

	// Theme state that reacts to dark mode changes
	let theme = $state<ChartTheme>(getChartTheme());

	// Watch for theme changes via shared observer
	$effect(() => {
		return onThemeChange(() => {
			theme = getChartTheme();
		});
	});

	// Build a lookup map for category isEssential
	let categoryEssentialMap = $derived(
		new Map(categories.filter((c) => c.id != null).map((c) => [c.id!, c.isEssential]))
	);

	// Calculate needs% and wants% for each month
	let monthlyData = $derived.by(() => {
		// Group transactions by month, tracking needs and total
		const monthNeeds = new Map<string, number>();
		const monthTotals = new Map<string, number>();

		for (const t of allTransactions) {
			const month = getMonthKey(new Date(t.date));
			const userAmount = getUserAmount(t);

			// A transaction is "needs" if t.isEssential OR its category's isEssential
			const isNeeds = t.isEssential || (categoryEssentialMap.get(t.categoryId) ?? false);

			monthTotals.set(month, sumCurrency([monthTotals.get(month) || 0, userAmount]));
			if (isNeeds) {
				monthNeeds.set(month, sumCurrency([monthNeeds.get(month) || 0, userAmount]));
			}
		}

		// Convert to sorted array with percentages
		return Array.from(monthTotals.entries())
			.filter(([, total]) => total > 0)
			.map(([month, total]) => {
				const needs = monthNeeds.get(month) || 0;
				const wants = total - needs;
				return {
					month,
					label: format(parseMonthKey(month), 'MMM yyyy'),
					needsPercent: (needs / total) * 100,
					wantsPercent: (wants / total) * 100,
					needs,
					wants,
					total
				};
			})
			.sort((a, b) => a.month.localeCompare(b.month));
	});

	let chartConfig = $derived<ChartConfiguration>({
		type: 'line',
		data: {
			labels: monthlyData.map((d) => d.label),
			datasets: [
				{
					label: 'Needs',
					data: monthlyData.map((d) => d.needsPercent),
					borderColor: '#C45D3A',
					backgroundColor: '#C45D3A20',
					fill: true,
					tension: 0.3,
					pointRadius: 4,
					pointHoverRadius: 6,
					pointBackgroundColor: '#C45D3A'
				},
				{
					label: 'Wants',
					data: monthlyData.map((d) => d.wantsPercent),
					borderColor: '#8A847C',
					backgroundColor: '#8A847C20',
					fill: true,
					tension: 0.3,
					pointRadius: 4,
					pointHoverRadius: 6,
					pointBackgroundColor: '#8A847C'
				}
			]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: {
					position: 'top',
					labels: {
						boxWidth: 12,
						color: theme.textColor,
						usePointStyle: true,
						pointStyle: 'rect'
					}
				},
				tooltip: {
					backgroundColor: theme.tooltipBg,
					titleColor: theme.tooltipText,
					bodyColor: theme.tooltipText,
					callbacks: {
						label: (ctx) => {
							const idx = ctx.dataIndex;
							const yValue = (ctx.parsed as { y?: number }).y ?? 0;
							const data = monthlyData[idx];
							if (ctx.datasetIndex === 0) {
								return `Needs: ${yValue.toFixed(1)}% ($${data.needs.toLocaleString()})`;
							}
							return `Wants: ${yValue.toFixed(1)}% ($${data.wants.toLocaleString()})`;
						}
					}
				}
			},
			scales: {
				y: {
					min: 0,
					max: 100,
					ticks: {
						color: theme.mutedTextColor,
						callback: (value) => `${value}%`
					},
					grid: {
						color: theme.gridColor
					}
				},
				x: {
					ticks: {
						color: theme.textColor
					},
					grid: { display: false }
				}
			}
		}
	});
</script>

{#if monthlyData.length === 0}
	<div class="text-center py-8 text-charcoal-muted">
		<p>No spending data available</p>
		<p class="text-sm mt-1">Add transactions to see your needs vs wants trend</p>
	</div>
{:else if monthlyData.length === 1}
	<div class="text-center py-8">
		<p class="text-charcoal-soft">
			<span class="font-mono font-medium text-primary-600">{monthlyData[0].needsPercent.toFixed(1)}%</span> needs /
			<span class="font-mono font-medium text-charcoal-muted">{monthlyData[0].wantsPercent.toFixed(1)}%</span> wants
		</p>
		<p class="text-sm text-charcoal-muted mt-1">for {monthlyData[0].label}</p>
		<p class="text-xs text-charcoal-muted mt-2">Add more months to see trends</p>
	</div>
{:else}
	<div class="h-[250px]">
		<ChartWrapper config={chartConfig} class="h-full" />
	</div>
{/if}
