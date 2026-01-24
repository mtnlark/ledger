<script lang="ts">
	import { format } from 'date-fns';
	import { type ChartConfiguration } from 'chart.js/auto';
	import ChartWrapper from '../ChartWrapper.svelte';
	import { parseMonthKey } from '$lib/db';
	import type { Transaction, Category } from '$lib/db';

	interface CategoryStats {
		mean: number;
		stdDev: number;
	}

	interface Props {
		currentMonth: string;
		previousMonth: string;
		currentTransactions: Transaction[];
		previousTransactions: Transaction[];
		categories: Category[];
		categoryStats?: Map<number, CategoryStats>;
	}

	let {
		currentMonth,
		previousMonth,
		currentTransactions,
		previousTransactions,
		categories,
		categoryStats
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

		// Build comparison data with significance scoring
		const data = Array.from(categoryIds)
			.map((catId) => {
				const cat = categories.find((c) => c.id === catId);
				const current = currentSpending.get(catId) || 0;
				const previous = previousSpending.get(catId) || 0;
				const absDiff = Math.abs(current - previous);
				const stats = categoryStats?.get(catId);

				// Score: prioritize statistically significant changes
				// If change > 1σ, boost the score significantly
				let significance = absDiff;
				if (stats && stats.stdDev > 0) {
					const zScore = absDiff / stats.stdDev;
					if (zScore > 1) {
						significance = absDiff * (1 + zScore);
					}
				}

				return {
					categoryId: catId,
					name: cat?.name ?? 'Unknown',
					icon: cat?.icon ?? '',
					current,
					previous,
					significance
				};
			})
			.sort((a, b) => b.significance - a.significance)
			.slice(0, 8);

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
					backgroundColor: '#C45D3A',
					borderRadius: 4
				},
				{
					label: format(parseMonthKey(previousMonth), 'MMM yyyy'),
					data: comparisonData.map((d) => d.previous),
					backgroundColor: '#D4AD9C',
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
