<script lang="ts">
	import { format } from 'date-fns';
	import { type ChartConfiguration } from 'chart.js/auto';
	import ChartWrapper from '../ChartWrapper.svelte';
	import { parseMonthKey, getMonthKey, type MonthlyBudget, type SavingsContribution } from '$lib/db';
	import { sumCurrency } from '$lib/utils/currency';
	import { getChartTheme, onThemeChange, type ChartTheme } from '$lib/utils/chart-theme';

	interface Props {
		contributions: SavingsContribution[];
		budgets: MonthlyBudget[];
	}

	let { contributions, budgets }: Props = $props();

	// Theme state that reacts to dark mode changes
	let theme = $state<ChartTheme>(getChartTheme());

	// Watch for theme changes via shared observer
	$effect(() => {
		return onThemeChange(() => {
			theme = getChartTheme();
		});
	});

	// Sources that affect available to spend (and thus count toward savings rate)
	const SOURCES_AFFECTING_AVAILABLE = ['bank_transfer', 'other'];

	// Calculate savings rate for each month using contributions
	let savingsData = $derived.by(() => {
		// Group contributions by month
		const contribByMonth = new Map<string, number>();
		for (const c of contributions) {
			// Only count contributions that affect available spending
			if (!SOURCES_AFFECTING_AVAILABLE.includes(c.source)) continue;
			const month = getMonthKey(new Date(c.date));
			contribByMonth.set(month, (contribByMonth.get(month) || 0) + c.amount);
		}

		// Create data points for months with both income and contributions
		return budgets
			.filter((b) => b.income > 0)
			.map((b) => {
				const saved = sumCurrency([contribByMonth.get(b.month) || 0]);
				return {
					month: b.month,
					label: format(parseMonthKey(b.month), 'MMM yyyy'),
					rate: saved / b.income,
					saved,
					income: b.income
				};
			})
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
					borderColor: '#5B8C5A',
					backgroundColor: '#5B8C5A20',
					fill: true,
					tension: 0.3,
					pointRadius: 4,
					pointHoverRadius: 6,
					pointBackgroundColor: '#5B8C5A'
				},
				{
					label: 'Average',
					data: savingsData.map(() => avgRate * 100),
					borderColor: '#8A847C',
					borderDash: [5, 5],
					fill: false,
					pointRadius: 0,
					pointStyle: 'line'
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
		<p>No savings data available</p>
		<p class="text-sm mt-1">Add contributions to track your savings rate</p>
	</div>
{:else if savingsData.length === 1}
	<div class="text-center py-8">
		<p class="text-3xl font-bold text-success-600">{(savingsData[0].rate * 100).toFixed(1)}%</p>
		<p class="text-sm text-charcoal-muted mt-1">Savings rate for {savingsData[0].label}</p>
		<p class="text-xs text-charcoal-muted mt-2">Add more months to see trends</p>
	</div>
{:else}
	<div class="h-[250px]">
		<ChartWrapper config={chartConfig} class="h-full" />
	</div>
{/if}
