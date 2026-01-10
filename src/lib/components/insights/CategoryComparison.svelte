<script lang="ts">
	import { format } from 'date-fns';
	import { type ChartConfiguration } from 'chart.js/auto';
	import ChartWrapper from '../ChartWrapper.svelte';
	import { parseMonthKey } from '$lib/db';
	import type { Transaction, Category } from '$lib/db';

	interface Props {
		currentMonth: string;
		previousMonth: string;
		currentTransactions: Transaction[];
		previousTransactions: Transaction[];
		categories: Category[];
	}

	let {
		currentMonth,
		previousMonth,
		currentTransactions,
		previousTransactions,
		categories
	}: Props = $props();

	// Calculate spending by category for each month
	function getSpendingByCategory(transactions: Transaction[]): Map<number, number> {
		const spending = new Map<number, number>();
		for (const t of transactions) {
			const amount = t.isShared ? t.amount - t.partnerShare : t.amount;
			spending.set(t.categoryId, (spending.get(t.categoryId) || 0) + amount);
		}
		return spending;
	}

	let comparisonData = $derived.by(() => {
		const currentSpending = getSpendingByCategory(currentTransactions);
		const previousSpending = getSpendingByCategory(previousTransactions);

		// Get categories that have spending in either month
		const categoryIds = new Set([...currentSpending.keys(), ...previousSpending.keys()]);

		// Build comparison data, sorted by current month spending
		const data = Array.from(categoryIds)
			.map((catId) => {
				const cat = categories.find((c) => c.id === catId);
				return {
					categoryId: catId,
					name: cat?.name ?? 'Unknown',
					icon: cat?.icon ?? '',
					current: currentSpending.get(catId) || 0,
					previous: previousSpending.get(catId) || 0
				};
			})
			.sort((a, b) => b.current - a.current)
			.slice(0, 8); // Top 8 categories

		return data;
	});

	let chartConfig = $derived<ChartConfiguration>({
		type: 'bar',
		data: {
			labels: comparisonData.map((d) => d.name),
			datasets: [
				{
					label: format(parseMonthKey(currentMonth), 'MMM yyyy'),
					data: comparisonData.map((d) => d.current),
					backgroundColor: '#3b82f6',
					borderRadius: 4
				},
				{
					label: format(parseMonthKey(previousMonth), 'MMM yyyy'),
					data: comparisonData.map((d) => d.previous),
					backgroundColor: '#94a3b8',
					borderRadius: 4
				}
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
						label: (ctx) => `${ctx.dataset.label}: $${(ctx.parsed.y ?? 0).toLocaleString()}`
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
					grid: { display: false },
					ticks: {
						maxRotation: 45,
						minRotation: 45
					}
				}
			}
		}
	});
</script>

{#if comparisonData.length === 0}
	<div class="text-center py-8 text-charcoal-muted">
		<p>No transaction data available for comparison</p>
	</div>
{:else}
	<div class="h-[300px]">
		<ChartWrapper config={chartConfig} class="h-full" />
	</div>
{/if}
