<script lang="ts">
	import { format } from 'date-fns';
	import type { ChartConfiguration } from 'chart.js/auto';
	import type { ComponentType } from 'svelte';
	import { TrendingUp } from 'lucide-svelte';
	import ChartWrapper from './ChartWrapper.svelte';
	import EmptyState from './EmptyState.svelte';
	import { parseMonthKey } from '$lib/db';
	import { getChartTheme, type ChartTheme } from '$lib/utils/chart-theme';
	import { formatCurrency } from '$lib/utils/modal-helpers';
	import { computeStdDev } from '$lib/insights/calculations/stats';

	interface Props {
		monthlyData: Map<string, number>;
	}

	let { monthlyData }: Props = $props();

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

	// Warm Ledger color palette
	const COLORS = {
		belowAverage: '#5B8C5A', // success-500 (sage)
		normal: '#6B8CA6',      // warm slate blue (neutral)
		aboveAverage: '#C44D4D' // warm red (over budget)
	};

	// Convert map to sorted arrays for chart
	let chartData = $derived.by(() => {
		const entries = Array.from(monthlyData.entries()).sort((a, b) => a[0].localeCompare(b[0]));
		return {
			labels: entries.map(([month]) => format(parseMonthKey(month), 'MMM yyyy')),
			values: entries.map(([, amount]) => amount),
			months: entries.map(([month]) => month)
		};
	});

	// Calculate average and standard deviation for personalized thresholds
	let average = $derived(
		chartData.values.length > 0
			? chartData.values.reduce((a, b) => a + b, 0) / chartData.values.length
			: 0
	);

	let stdDev = $derived(computeStdDev(chartData.values));

	// Chart configuration
	let chartConfig = $derived<ChartConfiguration<'bar'>>({
		type: 'bar',
		data: {
			labels: chartData.labels,
			datasets: [
				{
					label: 'Monthly Spending',
					data: chartData.values,
					backgroundColor: chartData.values.map((v) =>
						v > average + stdDev ? COLORS.aboveAverage : v < average - stdDev ? COLORS.belowAverage : COLORS.normal
					),
					borderRadius: 6,
					borderSkipped: false
				}
			]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: {
					display: false
				},
				annotation: chartData.values.length >= 3 && stdDev > 0 ? {
					annotations: {
						meanLine: {
							type: 'line' as const,
							yMin: average,
							yMax: average,
							borderColor: theme.mutedTextColor,
							borderWidth: 1.5,
							borderDash: [6, 4]
						},
						stdDevBand: {
							type: 'box' as const,
							yMin: Math.max(0, average - stdDev),
							yMax: average + stdDev,
							backgroundColor: theme.gridColor,
							borderWidth: 0
						}
					}
				} : undefined,
				tooltip: {
					backgroundColor: theme.tooltipBg,
					titleColor: theme.tooltipText,
					bodyColor: theme.tooltipText,
					padding: 12,
					cornerRadius: 8,
					callbacks: {
						label: (context) => {
							const value = context.parsed.y ?? 0;
							return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
						}
					}
				}
			},
			scales: {
				y: {
					beginAtZero: true,
					ticks: {
						color: theme.mutedTextColor,
						font: {
							family: "'DM Mono', monospace"
						},
						callback: (value) => `$${Number(value).toLocaleString()}`
					},
					grid: {
						color: theme.gridColor
					}
				},
				x: {
					ticks: {
						color: theme.textColor,
						font: {
							family: "'DM Sans', system-ui"
						}
					},
					grid: {
						display: false
					}
				}
			}
		}
	});
</script>

<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
	<div class="px-6 py-4 border-b border-dashed border-theme-dashed">
		<h2 class="font-display text-xl font-medium text-charcoal">Monthly Spending Trends</h2>
		<p class="text-sm text-charcoal-muted mt-1">
			Average: <span class="font-mono">{formatCurrency(average)}</span>/month
		</p>
	</div>

	<div class="p-6">
		{#if chartData.values.length === 0}
			<EmptyState
				icon={TrendingUp as ComponentType}
				title="No trend data yet"
				description="Track expenses over multiple months to see spending patterns"
			/>
		{:else if chartData.values.length === 1}
			<EmptyState
				icon={TrendingUp as ComponentType}
				title={formatCurrency(chartData.values[0])}
				description={`${chartData.labels[0]} — Add more months to see trends`}
			/>
		{:else}
			<div class="h-[250px]">
				<ChartWrapper config={chartConfig} class="h-full" />
			</div>

			<!-- Legend -->
			<div class="flex justify-center gap-6 mt-4 text-xs text-charcoal-muted">
				<div class="flex items-center gap-1.5">
					<div class="w-3 h-3 rounded" style="background-color: {COLORS.belowAverage};"></div>
					<span>Below average</span>
				</div>
				<div class="flex items-center gap-1.5">
					<div class="w-3 h-3 rounded" style="background-color: {COLORS.normal};"></div>
					<span>Normal</span>
				</div>
				<div class="flex items-center gap-1.5">
					<div class="w-3 h-3 rounded" style="background-color: {COLORS.aboveAverage};"></div>
					<span>Above average</span>
				</div>
			</div>
		{/if}
	</div>
</div>
