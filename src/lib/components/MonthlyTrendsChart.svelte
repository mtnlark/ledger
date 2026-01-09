<script lang="ts">
	import { format } from 'date-fns';
	import type { ChartConfiguration } from 'chart.js/auto';
	import type { ComponentType } from 'svelte';
	import { TrendingUp } from 'lucide-svelte';
	import ChartWrapper from './ChartWrapper.svelte';
	import EmptyState from './EmptyState.svelte';
	import { parseMonthKey } from '$lib/db';

	interface Props {
		monthlyData: Map<string, number>;
	}

	let { monthlyData }: Props = $props();

	// Warm Ledger color palette
	const COLORS = {
		belowAverage: '#5B8C5A', // success-500 (sage)
		normal: '#C45D3A',      // primary-500 (terracotta)
		aboveAverage: '#C17B7B' // danger-500 (rose)
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

	// Calculate average and trend
	let average = $derived(
		chartData.values.length > 0
			? chartData.values.reduce((a, b) => a + b, 0) / chartData.values.length
			: 0
	);

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
						v > average * 1.2 ? COLORS.aboveAverage : v < average * 0.8 ? COLORS.belowAverage : COLORS.normal
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
				tooltip: {
					backgroundColor: '#2D2A26',
					titleColor: '#FAF8F5',
					bodyColor: '#FAF8F5',
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
						color: '#8A847C',
						font: {
							family: "'DM Mono', monospace"
						},
						callback: (value) => `$${Number(value).toLocaleString()}`
					},
					grid: {
						color: 'rgba(45, 42, 38, 0.08)'
					}
				},
				x: {
					ticks: {
						color: '#5C5751',
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

	function formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2
		}).format(amount);
	}
</script>

<div class="bg-white rounded-xl shadow-md shadow-gray-200/50 overflow-hidden">
	<div class="px-6 py-4 border-b border-dashed border-gray-200">
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
