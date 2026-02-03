<script lang="ts">
	import { format } from 'date-fns';
	import type { Transaction, Settings } from '$lib/db';
	import { formatCurrencyWhole } from '$lib/utils/format-helpers';
	import { getInsightsEngine } from '$lib/insights';
	import InsightGroup from './InsightGroup.svelte';
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
	let topMerchant = $derived(ytdStats.topMerchant);

	// Recent 30 days for mini heatmap (UI-only, not worth memoizing in engine)
	let recentDailySpending = $derived.by(() => {
		const recent = new Map<string, number>();
		const today = new Date();
		for (let i = 29; i >= 0; i--) {
			const date = new Date(today);
			date.setDate(date.getDate() - i);
			const dateKey = format(date, 'yyyy-MM-dd');
			recent.set(dateKey, dailySpending.get(dateKey) || 0);
		}
		return recent;
	});

	// All-time needs vs wants
	let needsWantsStats = $derived(engine.getNeedsVsWantsFull(transactions, 'ytd-all-time'));

	// Goals completed this year
	let goalsCompletedThisYear = $derived.by(() => {
		if (!settings?.completedGoals) return 0;
		const yearPrefix = String(currentYear);
		return settings.completedGoals.filter((g) => g.completedDate.startsWith(yearPrefix)).length;
	});
</script>

<InsightGroup title="Year in Review" description="{currentYear} spending overview">
	{#snippet preview()}
		<div class="space-y-3">
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
			<!-- Mini heatmap preview (last 30 days) -->
			<div class="pt-2">
				<p class="text-xs text-charcoal-muted mb-1">Last 30 days</p>
				<div class="flex gap-1">
					{#each Array.from(recentDailySpending.entries()) as [dateKey, amount]}
						{@const maxAmount = Math.max(...Array.from(recentDailySpending.values()))}
						{@const intensity = amount === 0 ? 0 : Math.min(6, Math.max(1, Math.ceil((Math.log(amount + 1) / Math.log(maxAmount + 1)) * 6)))}
						{@const colors = ['bg-surface-alt', 'bg-success-100', 'bg-success-200', 'bg-success-300', 'bg-success-400', 'bg-success-500', 'bg-success-700']}
						<div
							class="{colors[intensity]} rounded-sm"
							style="width: 8px; height: 8px;"
							title="{dateKey}: ${amount.toLocaleString()}"
						></div>
					{/each}
				</div>
			</div>
		</div>
	{/snippet}

	{#snippet children()}
		<div class="space-y-6">
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

			<!-- Needs vs Wants Summary (compact) -->
			{#if needsWantsStats.total > 0}
				<div class="flex items-center justify-between p-4 bg-cream-dark rounded-lg border border-dashed border-theme">
					<span class="text-sm text-charcoal-soft">All-time needs vs wants:</span>
					<span class="font-mono text-sm text-charcoal">
						{needsWantsStats.needsPercent.toFixed(0)}% needs / {needsWantsStats.wantsPercent.toFixed(0)}% wants
					</span>
				</div>
			{/if}
		</div>
	{/snippet}
</InsightGroup>
