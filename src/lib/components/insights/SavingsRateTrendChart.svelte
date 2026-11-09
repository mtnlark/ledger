<script lang="ts">
	import { format } from 'date-fns';
	import { type ChartConfiguration } from 'chart.js/auto';
	import { goto } from '$app/navigation';
	import ChartWrapper from '../ChartWrapper.svelte';
	import { parseMonthKey, getMonthKey, type MonthlyBudget, type SavingsContribution } from '$lib/db';
	import { summarizeSavings } from '$lib/utils/savings-summary';
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

	// Group events once so every month uses the shared signed cash summary.
	let savingsData = $derived.by(() => {
		const contribByMonth = new Map<string, SavingsContribution[]>();
		for (const c of contributions) {
			const month = getMonthKey(c.date);
			const events = contribByMonth.get(month) ?? [];
			events.push(c); contribByMonth.set(month, events);
		}

		// Create data points for months with both income and contributions
		return budgets
			.filter((b) => b.income > 0)
			.map((b) => {
				const saved = summarizeSavings(contribByMonth.get(b.month) ?? []).netCashSaved;
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
					label: 'Net savings rate',
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
							const yValue = (ctx.parsed as { y?: number }).y ?? 0;
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
					min: Math.min(0, ...savingsData.map(d => d.rate < 0 ? d.rate * 100 - 10 : 0)),
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
		<p class="text-sm mt-1">Add contributions to track your net savings rate</p>
		<button
			onclick={() => goto('/savings')}
			class="mt-3 px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 transition-colors"
		>
			Go to Savings
		</button>
	</div>
{:else if savingsData.length === 1}
	<div class="text-center py-8">
		<p class="text-3xl font-bold text-success-600">{(savingsData[0].rate * 100).toFixed(1)}%</p>
		<p class="text-sm text-charcoal-muted mt-1">Net savings rate for {savingsData[0].label}</p>
		<p class="text-xs text-charcoal-muted mt-2">Add more months to see trends</p>
	</div>
{:else}
	<div class="h-[250px]">
		<ChartWrapper config={chartConfig} class="h-full" />
	</div>
{/if}
