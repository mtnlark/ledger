<script lang="ts">
	import { type ChartConfiguration } from 'chart.js/auto';
	import ChartWrapper from '../ChartWrapper.svelte';
	import type { MonthlyBudget } from '$lib/db';

	interface DailySpending {
		day: number;
		amount: number;
		cumulative: number;
	}

	interface Props {
		dailySpending: DailySpending[];
		budget: MonthlyBudget | null;
		currentDay: number;
	}

	let { dailySpending, budget, currentDay }: Props = $props();

	// Calculate available budget (income - saved)
	let availableBudget = $derived(budget ? budget.income - budget.savedAmount : 0);
	let daysInMonth = $derived(dailySpending.length);

	// Calculate steady pace line (linear from 0 to budget)
	let steadyPace = $derived(
		Array.from({ length: daysInMonth }, (_, i) => (availableBudget / daysInMonth) * (i + 1))
	);

	// Get spending up to current day for comparison
	let currentCumulative = $derived(
		currentDay > 0 && currentDay <= dailySpending.length
			? dailySpending[currentDay - 1].cumulative
			: 0
	);
	let expectedByNow = $derived(currentDay > 0 ? steadyPace[currentDay - 1] : 0);

	// Velocity ratio (>1 = overspending)
	let velocityRatio = $derived(expectedByNow > 0 ? currentCumulative / expectedByNow : 0);
	let velocityPercent = $derived(((velocityRatio - 1) * 100).toFixed(0));

	let chartConfig = $derived<ChartConfiguration>({
		type: 'line',
		data: {
			labels: dailySpending.map((d) => d.day.toString()),
			datasets: [
				{
					label: 'Actual Spending',
					data: dailySpending.map((d) => d.cumulative),
					borderColor: '#3b82f6',
					backgroundColor: '#3b82f620',
					fill: true,
					tension: 0.1,
					pointRadius: 0,
					pointHoverRadius: 4
				},
				...(budget
					? [
							{
								label: 'Steady Pace',
								data: steadyPace,
								borderColor: '#94a3b8',
								borderDash: [5, 5],
								fill: false,
								pointRadius: 0,
								tension: 0
							}
						]
					: [])
			]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: {
					position: 'top',
					labels: { boxWidth: 12 }
				},
				tooltip: {
					callbacks: {
						title: (items) => `Day ${items[0].label}`,
						label: (ctx) => `${ctx.dataset.label}: $${(ctx.parsed.y ?? 0).toLocaleString()}`
					}
				}
			},
			scales: {
				y: {
					beginAtZero: true,
					ticks: {
						callback: (value) => `$${Number(value).toLocaleString()}`
					}
				},
				x: {
					title: { display: true, text: 'Day of Month' },
					grid: { display: false }
				}
			}
		}
	});
</script>

<div class="space-y-4">
	<!-- Velocity indicator -->
	{#if budget}
		<div
			class="flex items-center justify-between p-3 rounded-lg {velocityRatio > 1.1
				? 'bg-red-50'
				: velocityRatio < 0.9
					? 'bg-green-50'
					: 'bg-gray-50'}"
		>
			<div>
				<p class="text-sm font-medium text-gray-700">Spending Pace</p>
				<p class="text-xs text-gray-500">
					${currentCumulative.toLocaleString()} spent of ${availableBudget.toLocaleString()} available
				</p>
			</div>
			<div
				class="text-right {velocityRatio > 1.1
					? 'text-red-600'
					: velocityRatio < 0.9
						? 'text-green-600'
						: 'text-gray-600'}"
			>
				<p class="text-lg font-bold">
					{velocityRatio > 1 ? '+' : ''}{velocityPercent}%
				</p>
				<p class="text-xs">
					{velocityRatio > 1.1 ? 'ahead' : velocityRatio < 0.9 ? 'behind' : 'on track'}
				</p>
			</div>
		</div>
	{:else}
		<div class="p-3 rounded-lg bg-amber-50">
			<p class="text-sm text-amber-700">Set a monthly budget to see pace comparison</p>
		</div>
	{/if}

	<!-- Chart -->
	<div class="h-[250px]">
		<ChartWrapper config={chartConfig} class="h-full" />
	</div>
</div>
