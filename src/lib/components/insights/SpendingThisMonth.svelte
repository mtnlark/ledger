<script lang="ts">
	import type { Transaction, MonthlyBudget } from '$lib/db';
	import { parseMonthKey, getMonthKey } from '$lib/db';
	import { format } from 'date-fns';
	import { getInsightsEngine } from '$lib/insights';
	import InsightGroup from './InsightGroup.svelte';
	import SavingsRateChart from './SavingsRateChart.svelte';
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

	// Current savings rate
	let currentSavingsRate = $derived(
		budget && budget.income > 0 ? budget.savedAmount / budget.income : null
	);

	// Quick stats
	let sharedCount = $derived(transactions.filter((t) => t.isShared).length);
	let avgTransaction = $derived(transactions.length > 0 ? totalSpent / transactions.length : 0);
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
			{#if currentSavingsRate !== null}
				<div class="text-right">
					<p class="font-mono text-lg font-medium text-success-600">
						{(currentSavingsRate * 100).toFixed(0)}%
					</p>
					<p class="text-sm text-charcoal-muted">savings rate</p>
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

			<!-- Savings Rate Over Time -->
			{#if allBudgets.length > 0}
				<div>
					<h3 class="text-sm font-medium text-charcoal-soft mb-3">Savings Rate Over Time</h3>
					<SavingsRateChart budgets={allBudgets} />
				</div>
			{/if}

			<!-- Monthly Spending Trends -->
			{#if monthlyTrends.size > 0}
				<MonthlyTrendsChart monthlyData={monthlyTrends} />
			{/if}
		</div>
	{/snippet}
</InsightGroup>
