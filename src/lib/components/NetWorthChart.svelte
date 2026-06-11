<script lang="ts">
	import type { ChartConfiguration } from 'chart.js';
	import { format } from 'date-fns';
	import ChartWrapper from './ChartWrapper.svelte';
	import { getChartTheme, onThemeChange } from '$lib/utils/chart-theme';
	import { formatCurrencyWhole } from '$lib/utils/format-helpers';
	import type { NetWorthPoint } from '$lib/utils/net-worth';

	interface Props {
		series: NetWorthPoint[];
	}

	let { series }: Props = $props();

	let theme = $state(getChartTheme());
	$effect(() => {
		return onThemeChange(() => {
			theme = getChartTheme();
		});
	});

	let chartConfig = $derived<ChartConfiguration>({
		type: 'line',
		data: {
			labels: series.map((p) => format(new Date(`${p.date}T12:00:00`), 'MMM d, yyyy')),
			datasets: [
				{
					label: 'Net worth',
					data: series.map((p) => p.total),
					borderColor: '#C45D3A',
					backgroundColor: '#C45D3A1A',
					fill: true,
					tension: 0.25,
					pointRadius: series.length > 60 ? 0 : 3,
					pointHoverRadius: 5,
					pointBackgroundColor: '#C45D3A'
				}
			]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: { display: false },
				tooltip: {
					backgroundColor: theme.tooltipBg,
					titleColor: theme.tooltipText,
					bodyColor: theme.tooltipText,
					callbacks: {
						label: (ctx) => formatCurrencyWhole((ctx.parsed as { y?: number }).y ?? 0)
					}
				}
			},
			scales: {
				y: {
					ticks: {
						color: theme.mutedTextColor,
						callback: (value) => `$${Number(value).toLocaleString()}`
					},
					grid: { color: theme.gridColor }
				},
				x: {
					ticks: { color: theme.textColor, maxTicksLimit: 8, maxRotation: 0 },
					grid: { display: false }
				}
			}
		}
	});
</script>

{#if series.length < 2}
	<div class="text-center py-10 text-charcoal-muted">
		<p class="text-sm">History builds as balances change</p>
		<p class="text-xs mt-1">The chart appears once balances exist on two different days</p>
	</div>
{:else}
	<div class="h-[260px]">
		<ChartWrapper config={chartConfig} class="h-full" />
	</div>
{/if}
