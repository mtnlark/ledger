<script lang="ts">
	import type { Transaction, MonthlyBudget } from '$lib/db';
	import { parseMonthKey, getMonthKey } from '$lib/db';
	import { format, getDaysInMonth, getDate } from 'date-fns';
	import { TrendingUp, TrendingDown, Minus } from 'lucide-svelte';
	import { getInsightsEngine } from '$lib/insights';
	import { calculateVelocityComparison } from '$lib/insights/calculations/velocity';
	import InsightGroup from './InsightGroup.svelte';
	import MonthlyTrendsChart from '../MonthlyTrendsChart.svelte';

	interface Props {
		currentMonth: string;
		transactions: Transaction[];
		budget: MonthlyBudget | null;
		allBudgets: MonthlyBudget[];
		monthlyTrends: Map<string, number>;
	}

	let {
		currentMonth,
		transactions,
		budget,
		allBudgets,
		monthlyTrends
	}: Props = $props();

	const engine = getInsightsEngine();

	// Check if viewing current month
	let isCurrentMonth = $derived(currentMonth === getMonthKey(new Date()));

	// Month display
	let monthDisplay = $derived(format(parseMonthKey(currentMonth), 'MMMM yyyy'));

	// Calculate totals
	let totalSpent = $derived(engine.getTotalSpent(transactions, currentMonth));

	// Quick stats
	let sharedCount = $derived(transactions.filter((t) => t.isShared).length);
	let avgTransaction = $derived(transactions.length > 0 ? totalSpent / transactions.length : 0);

	// Spending velocity comparison
	let velocityComparison = $derived.by(() => {
		// Get previous month key
		const currentDate = parseMonthKey(currentMonth);
		const prevDate = new Date(currentDate);
		prevDate.setMonth(prevDate.getMonth() - 1);
		const prevMonthKey = getMonthKey(prevDate);

		// Get previous month's total from trends
		const prevTotal = monthlyTrends.get(prevMonthKey);
		if (prevTotal === undefined) return null;

		// Calculate days
		const isViewingCurrentMonth = currentMonth === getMonthKey(new Date());
		const currentDays = isViewingCurrentMonth
			? getDate(new Date()) // Days elapsed so far this month
			: getDaysInMonth(currentDate); // Full month if viewing past
		const prevDays = getDaysInMonth(prevDate);

		// Get historical totals for adaptive threshold
		const historicalTotals = Array.from(monthlyTrends.values());

		return calculateVelocityComparison(
			totalSpent,
			prevTotal,
			currentDays,
			prevDays,
			10, // 10% minimum threshold
			historicalTotals
		);
	});
</script>

<InsightGroup
	title="Spending This Month"
	description={isCurrentMonth ? 'Current month overview' : monthDisplay}
	defaultExpanded={true}
>
	{#snippet preview()}
		<div class="flex items-center justify-between">
			<div>
				<p class="font-mono text-2xl font-medium text-charcoal">
					${totalSpent.toLocaleString()}
				</p>
				<p class="text-sm text-charcoal-muted">
					{transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
				</p>
			</div>
			{#if velocityComparison}
				<div class="text-right flex items-center gap-2">
					{#if velocityComparison.isUp}
						<TrendingUp size={18} class="text-warning-500" />
					{:else}
						<TrendingDown size={18} class="text-success-500" />
					{/if}
					<div>
						<p class="font-mono text-lg font-medium {velocityComparison.isUp ? 'text-warning-600' : 'text-success-600'}">
							{Math.abs(velocityComparison.percentChange)}%
						</p>
						<p class="text-sm text-charcoal-muted">
							{velocityComparison.isUp ? 'faster' : 'slower'}
						</p>
					</div>
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet children()}
		<div class="space-y-6">
			<!-- Quick Stats -->
			{#if transactions.length > 0}
				<div class="bg-cream-dark rounded-lg p-4 border border-dashed border-theme">
					<h3 class="text-sm font-medium text-charcoal-soft mb-3">Quick Stats</h3>
					<div class="grid grid-cols-3 gap-4">
						<div class="text-center">
							<p class="font-mono text-xl font-medium text-charcoal">{transactions.length}</p>
							<p class="text-xs text-charcoal-muted">Transactions</p>
						</div>
						<div class="text-center">
							<p class="font-mono text-xl font-medium text-charcoal">
								${avgTransaction.toFixed(0)}
							</p>
							<p class="text-xs text-charcoal-muted">Avg Transaction</p>
						</div>
						<div class="text-center">
							<p class="font-mono text-xl font-medium text-charcoal">{sharedCount}</p>
							<p class="text-xs text-charcoal-muted">Shared</p>
						</div>
					</div>
				</div>
			{/if}

			<!-- Spending Velocity -->
			{#if velocityComparison}
				<div class="bg-surface-alt rounded-lg p-4 border border-theme">
					<h3 class="text-sm font-medium text-charcoal-soft mb-3">Spending Pace</h3>
					<div class="flex items-center gap-4">
						<div class="w-12 h-12 rounded-full flex items-center justify-center {velocityComparison.isUp ? 'bg-warning-100' : 'bg-success-100'}">
							{#if velocityComparison.isUp}
								<TrendingUp size={24} class="text-warning-600" />
							{:else}
								<TrendingDown size={24} class="text-success-600" />
							{/if}
						</div>
						<div>
							<p class="text-charcoal">
								<span class="font-medium {velocityComparison.isUp ? 'text-warning-600' : 'text-success-600'}">
									{Math.abs(velocityComparison.percentChange)}% {velocityComparison.isUp ? 'faster' : 'slower'}
								</span>
								than last month
							</p>
							<p class="text-sm text-charcoal-muted mt-0.5">
								${velocityComparison.currentDailyAvg.toFixed(0)}/day vs ${velocityComparison.prevDailyAvg.toFixed(0)}/day last month
							</p>
						</div>
					</div>
				</div>
			{:else if monthlyTrends.size < 2}
				<div class="bg-surface-alt rounded-lg p-4 border border-theme text-center">
					<Minus size={20} class="text-charcoal-muted mx-auto mb-2" />
					<p class="text-sm text-charcoal-muted">Need more data to compare spending pace</p>
				</div>
			{/if}

			<!-- Monthly Spending Trends -->
			{#if monthlyTrends.size > 0}
				<MonthlyTrendsChart monthlyData={monthlyTrends} />
			{/if}
		</div>
	{/snippet}
</InsightGroup>
