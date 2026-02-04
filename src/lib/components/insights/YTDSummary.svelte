<script lang="ts">
	import { format } from 'date-fns';
	import type { Transaction, Settings } from '$lib/db';
	import { formatCurrencyWhole } from '$lib/utils/format-helpers';
	import { extractTags } from '$lib/utils/tags';
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
			totalShared,
			totalPartnerShare,
			totalSettled,
			count: yearTransactions.length
		};
	});

	// Tag spending summary for the year
	let tagSummary = $derived.by(() => {
		const tagTotals = new Map<string, { total: number; count: number }>();
		const yearTransactions = transactions.filter(
			(t) => new Date(t.date).getFullYear() === currentYear
		);

		for (const t of yearTransactions) {
			const tags = extractTags(t.notes);
			if (tags.length === 0) continue;
			const userAmount = t.isShared ? t.amount - t.partnerShare : t.amount;

			for (const tag of tags) {
				const existing = tagTotals.get(tag) || { total: 0, count: 0 };
				existing.total += userAmount;
				existing.count += 1;
				tagTotals.set(tag, existing);
			}
		}

		return Array.from(tagTotals.entries())
			.map(([tag, { total, count }]) => ({ tag, total, count }))
			.sort((a, b) => b.total - a.total);
	});
</script>

<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
	<div class="px-6 py-4">
		<h2 class="font-display text-xl font-medium text-charcoal">Year in Review</h2>
		<p class="text-sm text-charcoal-muted mt-0.5">{currentYear}</p>
	</div>
	<div class="px-6 pb-6 space-y-6">
		<!-- Quick stats preview -->
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

		<!-- Needs vs Wants Summary (compact) -->
		{#if needsWantsStats.total > 0}
			<div class="flex items-center justify-between p-4 bg-cream-dark rounded-lg border border-dashed border-theme">
				<span class="text-sm text-charcoal-soft">All-time needs vs wants:</span>
				<span class="font-mono text-sm text-charcoal">
					{needsWantsStats.needsPercent.toFixed(0)}% needs / {needsWantsStats.wantsPercent.toFixed(0)}% wants
				</span>
			</div>
		{/if}

		<!-- Tag Spending Summary -->
		{#if tagSummary.length > 0}
			<div>
				<h3 class="text-sm font-medium text-charcoal-soft mb-3">Tags This Year</h3>
				<div class="space-y-2">
					{#each tagSummary as { tag, total, count }}
						<div class="flex items-center justify-between py-1.5">
							<span class="text-sm text-primary-600 font-medium">#{tag}</span>
							<div class="text-right">
								<span class="font-mono text-sm text-charcoal">{formatCurrencyWhole(total)}</span>
								<span class="text-xs text-charcoal-muted ml-2">{count} txn{count !== 1 ? 's' : ''}</span>
							</div>
						</div>
					{/each}
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
