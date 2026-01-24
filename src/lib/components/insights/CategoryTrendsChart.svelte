<script lang="ts">
	import { format } from 'date-fns';
	import { type ChartConfiguration } from 'chart.js/auto';
	import ChartWrapper from '../ChartWrapper.svelte';
	import { parseMonthKey } from '$lib/db';

	interface Props {
		categoryName: string;
		categoryColor: string;
		trendData: Map<string, number>;
		mean?: number;
		stdDev?: number;
	}

	let { categoryName, categoryColor, trendData, mean, stdDev }: Props = $props();

	let chartData = $derived.by(() => {
		const entries = Array.from(trendData.entries()).sort((a, b) => a[0].localeCompare(b[0]));
		return {
			labels: entries.map(([month]) => format(parseMonthKey(month), 'MMM yyyy')),
			values: entries.map(([, amount]) => amount)
		};
	});

	let chartConfig = $derived<ChartConfiguration>({
		type: 'line',
		data: {
			labels: chartData.labels,
			datasets: [
				{
					label: categoryName,
					data: chartData.values,
					borderColor: categoryColor,
					backgroundColor: `${categoryColor}20`,
					fill: true,
					tension: 0.3,
					pointRadius: 4,
					pointHoverRadius: 6,
					pointBackgroundColor: categoryColor
				}
			]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: { display: false },
				annotation: mean !== undefined && stdDev !== undefined && stdDev > 0 && chartData.values.length >= 3 ? {
					annotations: {
						meanLine: {
							type: 'line' as const,
							yMin: mean,
							yMax: mean,
							borderColor: '#8A847C',
							borderWidth: 1.5,
							borderDash: [6, 4]
						},
						stdDevBand: {
							type: 'box' as const,
							yMin: Math.max(0, mean - stdDev),
							yMax: mean + stdDev,
							backgroundColor: 'rgba(45, 42, 38, 0.06)',
							borderWidth: 0
						}
					}
				} : undefined,
				tooltip: {
					callbacks: {
						label: (ctx) => `$${(ctx.parsed.y ?? 0).toLocaleString()}`
					}
				}
			},
			scales: {
				y: {
					beginAtZero: true,
					ticks: {
						callback: (value) => `$${value}`
					}
				},
				x: {
					grid: { display: false }
				}
			}
		}
	});
</script>

<div class="h-[250px]">
	<ChartWrapper config={chartConfig} class="h-full" />
</div>
