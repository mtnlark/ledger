<script lang="ts">
	import { format } from 'date-fns';
	import { type ChartConfiguration } from 'chart.js/auto';
	import ChartWrapper from '../ChartWrapper.svelte';
	import { parseMonthKey } from '$lib/db';
	import type { MonthlyBudget } from '$lib/db';
	import { getChartTheme, type ChartTheme } from '$lib/utils/chart-theme';

	interface Props {
		budgets: MonthlyBudget[];
	}

	let { budgets }: Props = $props();

	// Theme state that reacts to dark mode changes
	let theme = $state<ChartTheme>(getChartTheme());

	// Watch for theme changes via MutationObserver
	$effect(() => {
		if (typeof document === 'undefined') return;

		const observer = new MutationObserver(() => {
			theme = getChartTheme();
		});
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class']
		});
		return () => observer.disconnect();
	});

	// Calculate savings rate for each budget
	let savingsData = $derived.by(() => {
		return budgets
			.filter((b) => b.income > 0)
			.map((b) => ({
				month: b.month,
				label: format(parseMonthKey(b.month), 'MMM yyyy'),
				rate: b.savedAmount / b.income,
				saved: b.savedAmount,
				income: b.income
			}))
			.sort((a, b) => a.month.localeCompare(b.month));
	});

	// Calculate average savings rate
	let avgRate = $derived(
		savingsData.length > 0
			? savingsData.reduce((sum, d) => sum + d.rate, 0) / savingsData.length
			: 0
	);

	let chartConfig = $derived<ChartConfiguration>({
		type: 'line',
		data: {
			labels: savingsData.map((d) => d.label),
			datasets: [
				{
					label: 'Savings Rate',
					data: savingsData.map((d) => d.rate * 100),
					borderColor: '#22c55e',
					backgroundColor: '#22c55e20',
					fill: true,
					tension: 0.3,
					pointRadius: 4,
					pointHoverRadius: 6,
					pointBackgroundColor: '#22c55e'
				},
				{
					label: 'Average',
					data: savingsData.map(() => avgRate * 100),
					borderColor: '#94a3b8',
					borderDash: [5, 5],
					fill: false,
					pointRadius: 0
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
						color: theme.textColor
					}
				},
				tooltip: {
					backgroundColor: theme.tooltipBg,
					titleColor: theme.tooltipText,
					bodyColor: theme.tooltipText,
					callbacks: {
						label: (ctx) => {
							const idx = ctx.dataIndex;
							const yValue = ctx.parsed.y ?? 0;
							if (ctx.datasetIndex === 0) {
								const data = savingsData[idx];
								return [
									`Rate: ${yValue.toFixed(1)}%`,
									`Saved: $${data.saved.toLocaleString()}`,
									`Income: $${data.income.toLocaleString()}`
								];
							}
							return `Average: ${yValue.toFixed(1)}%`;
						}
					}
				}
			},
			scales: {
				y: {
					min: 0,
					max: Math.max(50, ...savingsData.map((d) => d.rate * 100 + 10)),
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

{#if savingsData.length === 0}
	<div class="text-center py-8 text-charcoal-muted">
		<p>No budget data available</p>
		<p class="text-sm mt-1">Set monthly budgets to track your savings rate</p>
	</div>
{:else if savingsData.length === 1}
	<div class="text-center py-8">
		<p class="text-3xl font-bold text-green-600">{(savingsData[0].rate * 100).toFixed(1)}%</p>
		<p class="text-sm text-charcoal-muted mt-1">Savings rate for {savingsData[0].label}</p>
		<p class="text-xs text-charcoal-muted mt-2">Add more months to see trends</p>
	</div>
{:else}
	<div class="h-[250px]">
		<ChartWrapper config={chartConfig} class="h-full" />
	</div>
{/if}
