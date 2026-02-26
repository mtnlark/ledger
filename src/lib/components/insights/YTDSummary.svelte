<script lang="ts">
	import type { Transaction, Settings } from '$lib/db';
	import { formatCurrencyWhole } from '$lib/utils/format-helpers';
	import { roundCurrency } from '$lib/utils/currency';
	import { getInsightsEngine } from '$lib/insights';
	import CalendarHeatmap from './CalendarHeatmap.svelte';

	interface Props {
		transactions: Transaction[];
		settings?: Settings | null;
	}

	let { transactions, settings = null }: Props = $props();

	const engine = getInsightsEngine();
	let currentYear = new Date().getFullYear();

	// Compute all YTD stats via the engine (memoized)
	let ytdStats = $derived(engine.getYTDStats(transactions, currentYear));

	// Destructure for template usage
	let totalSpent = $derived(ytdStats.totalSpent);
	let noSpendDays = $derived(ytdStats.noSpendDays);
	let dailySpending = $derived(ytdStats.dailySpending);
	let dailyAvg = $derived(ytdStats.dailyAvg);
	let biggestMonth = $derived(ytdStats.biggestMonth);
	let smallestMonth = $derived(ytdStats.smallestMonth);
	let topMerchant = $derived(ytdStats.topMerchant);


	// Goals completed this year
	let goalsCompletedThisYear = $derived.by(() => {
		if (!settings?.completedGoals) return 0;
		const yearPrefix = String(currentYear);
		return settings.completedGoals.filter((g) => g.completedDate.startsWith(yearPrefix)).length;
	});

	// Shared expense annual summary
	let sharedSummary = $derived.by(() => {
		const yearTransactions = transactions.filter(
			(t) => new Date(t.date).getFullYear() === currentYear && t.isShared
		);

		if (yearTransactions.length === 0) return null;

		let totalShared = 0;
		let totalSettled = 0;
		let totalPartnerShare = 0;

		for (const t of yearTransactions) {
			totalShared += t.amount;
			totalPartnerShare += t.partnerShare;
			if (t.isSettled) {
				totalSettled += t.partnerShare;
			}
		}

		return {
			totalShared: roundCurrency(totalShared),
			totalPartnerShare: roundCurrency(totalPartnerShare),
			totalSettled: roundCurrency(totalSettled),
			count: yearTransactions.length
		};
	});

</script>

<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
	<div class="px-6 py-4">
		<h2 class="font-display text-xl font-medium text-charcoal">Year in Review</h2>
		<p class="text-sm text-charcoal-muted mt-0.5">{currentYear}</p>
	</div>
	<div class="px-6 pb-6 space-y-6">
		<!-- Quick stats preview -->
		<div class="flex items-center justify-between">
			<div>
				<p class="text-2xl font-bold text-charcoal">${totalSpent.toLocaleString()}</p>
				<p class="text-sm text-charcoal-muted">Total spent in {currentYear}</p>
			</div>
			<div class="text-right">
				<p class="text-lg font-semibold text-green-600">{noSpendDays}</p>
				<p class="text-sm text-charcoal-muted">no-spend days</p>
			</div>
		</div>

		<!-- Full calendar heatmap -->
		<div>
			<h3 class="text-sm font-medium text-charcoal-soft mb-3">Spending Calendar</h3>
			<CalendarHeatmap {dailySpending} year={currentYear} />
		</div>

		<!-- Quick Stats Row -->
		<div class="grid grid-cols-3 gap-4">
			<div class="bg-cream-dark rounded-lg p-3 text-center">
				<p class="font-mono text-lg font-medium text-charcoal">{formatCurrencyWhole(dailyAvg)}</p>
				<p class="text-xs text-charcoal-muted">Daily Avg</p>
			</div>
			{#if biggestMonth}
				<div class="bg-cream-dark rounded-lg p-3 text-center">
					<p class="font-mono text-lg font-medium text-charcoal">{biggestMonth.label}</p>
					<p class="text-xs text-charcoal-muted">Biggest Month</p>
				</div>
			{/if}
			{#if topMerchant}
				<div class="bg-cream-dark rounded-lg p-3 text-center">
					<p class="font-mono text-lg font-medium text-charcoal truncate" title={topMerchant.merchant}>{topMerchant.merchant}</p>
					<p class="text-xs text-charcoal-muted">{topMerchant.count}x visits</p>
				</div>
			{/if}
		</div>

		<!-- Best/Worst Months -->
		{#if biggestMonth && smallestMonth}
			<div class="grid grid-cols-2 gap-4">
				<div class="bg-success-500/10 rounded-lg p-4 border border-success-500/20">
					<p class="text-xs text-success-700 font-medium mb-1">Lowest</p>
					<p class="font-mono text-lg font-medium text-charcoal">{formatCurrencyWhole(smallestMonth.amount)}</p>
					<p class="text-sm text-charcoal-muted">{smallestMonth.label}</p>
				</div>
				<div class="bg-warning-500/10 rounded-lg p-4 border border-warning-500/20">
					<p class="text-xs text-warning-700 font-medium mb-1">Highest</p>
					<p class="font-mono text-lg font-medium text-charcoal">{formatCurrencyWhole(biggestMonth.amount)}</p>
					<p class="text-sm text-charcoal-muted">{biggestMonth.label}</p>
				</div>
			</div>
		{/if}

		<!-- Goals Completed This Year -->
		{#if goalsCompletedThisYear > 0}
			<div class="flex items-center gap-3 p-4 bg-success-50 rounded-lg border border-success-200">
				<span class="text-2xl">🎯</span>
				<div>
					<p class="font-semibold text-success-700">{goalsCompletedThisYear} Savings Goal{goalsCompletedThisYear !== 1 ? 's' : ''} Completed</p>
					<p class="text-sm text-success-600">This year</p>
				</div>
			</div>
		{/if}

		<!-- Shared Expense Annual Summary -->
		{#if sharedSummary}
			<div class="bg-cream-dark rounded-lg p-4 border border-dashed border-theme">
				<h3 class="text-sm font-medium text-charcoal-soft mb-3">Shared Expenses This Year</h3>
				<div class="grid grid-cols-3 gap-4">
					<div class="text-center">
						<p class="font-mono text-lg font-medium text-charcoal">{formatCurrencyWhole(sharedSummary.totalShared)}</p>
						<p class="text-xs text-charcoal-muted">Total shared</p>
					</div>
					<div class="text-center">
						<p class="font-mono text-lg font-medium text-charcoal">{formatCurrencyWhole(sharedSummary.totalPartnerShare)}</p>
						<p class="text-xs text-charcoal-muted">Partner's share</p>
					</div>
					<div class="text-center">
						<p class="font-mono text-lg font-medium text-charcoal">{formatCurrencyWhole(sharedSummary.totalSettled)}</p>
						<p class="text-xs text-charcoal-muted">Settled</p>
					</div>
				</div>
				<p class="text-xs text-charcoal-muted mt-3 text-center">
					{sharedSummary.count} shared transaction{sharedSummary.count !== 1 ? 's' : ''}
				</p>
			</div>
		{/if}
	</div>
</div>
