<script lang="ts">
	import { format } from 'date-fns';
	import type { ChartConfiguration } from 'chart.js/auto';
	import ChartWrapper from './ChartWrapper.svelte';
	import { parseMonthKey } from '$lib/db';

	interface Props {
		monthlyData: Map<string, number>;
	}

	let { monthlyData }: Props = $props();

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
	let chartConfig = $derived<ChartConfiguration>({
		type: 'bar',
		data: {
			labels: chartData.labels,
			datasets: [
				{
					label: 'Monthly Spending',
					data: chartData.values,
					backgroundColor: chartData.values.map((v) =>
						v > average * 1.2 ? '#ef4444' : v < average * 0.8 ? '#22c55e' : '#3b82f6'
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
					callbacks: {
						label: (context) => {
							const value = context.parsed.y;
							return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
						}
					}
				}
			},
			scales: {
				y: {
					beginAtZero: true,
					ticks: {
						callback: (value) => `$${Number(value).toLocaleString()}`
					},
					grid: {
						color: '#f3f4f6'
					}
				},
				x: {
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

<div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
	<div class="px-6 py-4 border-b border-gray-100">
		<h2 class="text-lg font-semibold text-gray-900">Monthly Spending Trends</h2>
		<p class="text-sm text-gray-500 mt-1">
			Average: {formatCurrency(average)}/month
		</p>
	</div>

	<div class="p-6">
		{#if chartData.values.length === 0}
			<div class="text-center py-8 text-gray-500">
				<p>No spending data available</p>
			</div>
		{:else if chartData.values.length === 1}
			<div class="text-center py-8 text-gray-500">
				<p>Add transactions across multiple months to see trends</p>
				<p class="text-2xl font-bold text-gray-900 mt-2">{formatCurrency(chartData.values[0])}</p>
				<p class="text-sm">{chartData.labels[0]}</p>
			</div>
		{:else}
			<div class="h-[250px]">
				<ChartWrapper config={chartConfig} class="h-full" />
			</div>

			<!-- Legend -->
			<div class="flex justify-center gap-6 mt-4 text-xs text-gray-500">
				<div class="flex items-center gap-1.5">
					<div class="w-3 h-3 rounded bg-green-500"></div>
					<span>Below average</span>
				</div>
				<div class="flex items-center gap-1.5">
					<div class="w-3 h-3 rounded bg-blue-500"></div>
					<span>Normal</span>
				</div>
				<div class="flex items-center gap-1.5">
					<div class="w-3 h-3 rounded bg-red-500"></div>
					<span>Above average</span>
				</div>
			</div>
		{/if}
	</div>
</div>
