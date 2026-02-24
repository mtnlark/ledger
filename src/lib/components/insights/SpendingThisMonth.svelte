<script lang="ts">
	import type { Transaction, MonthlyBudget } from '$lib/db';
	import { parseMonthKey, getMonthKey } from '$lib/db';
	import { format, getDaysInMonth, getDate } from 'date-fns';
	import { TrendingUp, TrendingDown, Minus } from 'lucide-svelte';
	import { getInsightsEngine } from '$lib/insights';
	import { formatCurrency } from '$lib/utils/format-helpers';
	import { roundCurrency } from '$lib/utils/currency';
	import { filterUpToDate } from '$lib/utils/date-helpers';

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

	// Transactions up to today (excludes future-dated recurring entries) for current month
	// For past months, use all transactions
	let displayTransactions = $derived(isCurrentMonth ? filterUpToDate(transactions) : transactions);

	// Calculate totals using filtered transactions for consistency
	let totalSpent = $derived(engine.getTotalSpent(displayTransactions, isCurrentMonth ? `${currentMonth}-past` : currentMonth));

	// Quick stats
	let sharedCount = $derived(displayTransactions.filter((t) => t.isShared).length);
	let avgTransaction = $derived(displayTransactions.length > 0 ? totalSpent / displayTransactions.length : 0);

	// Basic pace stats (always computed when we have previous month data)
	let paceStats = $derived.by(() => {
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

		if (currentDays === 0 || prevDays === 0) return null;

		const currentDailyAvg = totalSpent / currentDays;
		const prevDailyAvg = prevTotal / prevDays;

		// Calculate percentage change (for display, even if not "significant")
		let percentChange = 0;
		if (prevDailyAvg > 0) {
			percentChange = Math.round(((currentDailyAvg - prevDailyAvg) / prevDailyAvg) * 100);
		}

		return {
			currentDailyAvg,
			prevDailyAvg,
			percentChange,
			isUp: percentChange > 0
		};
	});

	// Whether the pace change is significant (for highlighting)
	let isPaceSignificant = $derived.by(() => {
		if (!paceStats) return false;

		// Get historical totals for adaptive threshold
		const historicalTotals = Array.from(monthlyTrends.values());

		// Use the same adaptive threshold logic
		let threshold = 10; // Base 10%
		if (historicalTotals.length >= 2) {
			const mean = historicalTotals.reduce((s, v) => s + v, 0) / historicalTotals.length;
			if (mean > 0) {
				const variance = historicalTotals.reduce((s, v) => s + (v - mean) ** 2, 0) / historicalTotals.length;
				const sd = Math.sqrt(variance);
				const cv = (sd / mean) * 100;
				threshold = Math.max(cv, 10);
			}
		}

		return Math.abs(paceStats.percentChange) >= threshold;
	});

	// Top 5 merchants by spending (user's portion)
	let topMerchants = $derived.by(() => {
		const merchantTotals = new Map<string, number>();
		for (const t of displayTransactions) {
			if (!t.merchant) continue;
			const userAmount = t.isShared ? t.amount - t.partnerShare : t.amount;
			merchantTotals.set(t.merchant, (merchantTotals.get(t.merchant) || 0) + userAmount);
		}
		return Array.from(merchantTotals.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5)
			.map(([merchant, amount]) => ({ merchant, amount: roundCurrency(amount) }));
	});

	// Shared vs personal breakdown
	let sharedBreakdown = $derived.by(() => {
		let personal = 0;
		let sharedUserPortion = 0;
		for (const t of displayTransactions) {
			if (t.isShared) {
				sharedUserPortion += t.amount - t.partnerShare;
			} else {
				personal += t.amount;
			}
		}
		return {
			personal: roundCurrency(personal),
			shared: roundCurrency(sharedUserPortion),
			hasShared: sharedUserPortion > 0
		};
	});
</script>

<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
	<div class="px-6 py-4">
		<h2 class="font-display text-xl font-medium text-charcoal">Spending This Month</h2>
		<p class="text-sm text-charcoal-muted mt-0.5">{isCurrentMonth ? 'Current month overview' : monthDisplay}</p>
	</div>
	<div class="px-6 pb-6 space-y-6">
		<!-- Total + Velocity Badge -->
		<div class="flex items-center justify-between">
			<div>
				<p class="font-mono text-2xl font-medium text-charcoal">
					{formatCurrency(totalSpent)}
				</p>
				<p class="text-sm text-charcoal-muted">
					{displayTransactions.length} transaction{transactions.length !== 1 ? 's' : ''}
				</p>
			</div>
			{#if paceStats && paceStats.percentChange !== 0}
				<div class="text-right flex items-center gap-2">
					{#if paceStats.isUp}
						<TrendingUp size={18} class={isPaceSignificant ? 'text-warning-500' : 'text-charcoal-muted'} />
					{:else}
						<TrendingDown size={18} class={isPaceSignificant ? 'text-success-500' : 'text-charcoal-muted'} />
					{/if}
					<div>
						<p class="font-mono text-lg font-medium {isPaceSignificant ? (paceStats.isUp ? 'text-warning-600' : 'text-success-600') : 'text-charcoal-soft'}">
							{Math.abs(paceStats.percentChange)}%
						</p>
						<p class="text-sm text-charcoal-muted">
							{paceStats.isUp ? 'faster' : 'slower'}
						</p>
					</div>
				</div>
			{/if}
		</div>

		<!-- Quick Stats -->
		{#if transactions.length > 0}
			<div class="grid grid-cols-3 gap-3">
				<div class="bg-surface-alt rounded-lg p-3 text-center">
					<p class="font-mono text-lg font-medium text-charcoal">{displayTransactions.length}</p>
					<p class="text-xs text-charcoal-muted">Transactions</p>
				</div>
				<div class="bg-surface-alt rounded-lg p-3 text-center">
					<p class="font-mono text-lg font-medium text-charcoal">
						{formatCurrency(roundCurrency(avgTransaction))}
					</p>
					<p class="text-xs text-charcoal-muted">Avg Transaction</p>
				</div>
				<div class="bg-surface-alt rounded-lg p-3 text-center">
					<p class="font-mono text-lg font-medium text-charcoal">{sharedCount}</p>
					<p class="text-xs text-charcoal-muted">Shared</p>
				</div>
			</div>
		{/if}

		<!-- Spending Pace -->
		{#if paceStats}
			<div class="bg-surface-alt rounded-lg p-4 border border-theme">
				<h3 class="text-sm font-medium text-charcoal-soft mb-3">Spending Pace</h3>
				<div class="flex items-center gap-4">
					<div class="w-12 h-12 rounded-full flex items-center justify-center {isPaceSignificant ? (paceStats.isUp ? 'bg-warning-100' : 'bg-success-100') : 'bg-surface'}">
						{#if paceStats.isUp}
							<TrendingUp size={24} class={isPaceSignificant ? 'text-warning-600' : 'text-charcoal-muted'} />
						{:else if paceStats.percentChange < 0}
							<TrendingDown size={24} class={isPaceSignificant ? 'text-success-600' : 'text-charcoal-muted'} />
						{:else}
							<Minus size={24} class="text-charcoal-muted" />
						{/if}
					</div>
					<div>
						<p class="text-charcoal">
							{#if paceStats.percentChange === 0}
								<span class="font-medium">Same pace</span> as last month
							{:else}
								<span class="font-medium {isPaceSignificant ? (paceStats.isUp ? 'text-warning-600' : 'text-success-600') : ''}">
									{Math.abs(paceStats.percentChange)}% {paceStats.isUp ? 'faster' : 'slower'}
								</span>
								than last month
							{/if}
						</p>
						<p class="text-sm text-charcoal-muted mt-0.5">
							${paceStats.currentDailyAvg.toFixed(0)}/day vs. ${paceStats.prevDailyAvg.toFixed(0)}/day last month
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

		<!-- Top Merchants -->
		{#if topMerchants.length > 0}
			{@const maxMerchant = topMerchants[0]?.amount || 1}
			<div>
				<h3 class="text-sm font-medium text-charcoal-soft mb-3">Top Merchants</h3>
				<div class="rounded-lg overflow-hidden">
					{#each topMerchants as { merchant, amount }, i}
						{@const pct = (amount / maxMerchant) * 100}
						<div class="relative flex items-center px-4 py-3 bg-surface">
							<!-- Fill bar background -->
							<div
								class="absolute inset-y-0 left-0 bg-gradient-to-r from-primary-500/15 via-primary-500/7 to-transparent transition-all duration-500"
								style="width: {pct}%"
							></div>
							<!-- Rank -->
							<span
								class="relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono shrink-0
									{i === 0 ? 'bg-primary-500 text-white font-medium' : i <= 2 ? 'border-2 border-primary-300 text-primary-700 bg-surface' : 'bg-surface-alt text-charcoal-muted'}"
							>
								{i + 1}
							</span>
							<!-- Name -->
							<span class="relative z-10 text-sm text-charcoal truncate ml-3 min-w-0">{merchant}</span>
							<!-- Ledger dot leader -->
							<span class="ledger-line relative z-10"></span>
							<!-- Amount + percentage -->
							<span class="relative z-10 font-mono text-sm font-medium text-charcoal shrink-0">{formatCurrency(amount)}</span>
							{#if topMerchants.length > 1}
								<span class="relative z-10 text-xs text-charcoal-muted ml-1.5 shrink-0">{Math.round((amount / totalSpent) * 100)}%</span>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Personal vs. Shared -->
		{#if sharedBreakdown.hasShared}
			{@const personalPercent = totalSpent > 0 ? Math.round((sharedBreakdown.personal / totalSpent) * 100) : 0}
			{@const sharedPercent = 100 - personalPercent}
			<div>
				<h3 class="text-sm font-medium text-charcoal-soft mb-3">Personal vs. Shared</h3>
				<div class="rounded-lg border border-theme overflow-hidden bg-surface">
					<!-- Proportional bar -->
					<div class="h-3 flex rounded-full overflow-hidden mx-4 mt-4">
						<div
							class="bg-neutral-500 transition-all duration-500"
							style="width: {personalPercent}%"
						></div>
						<div
							class="bg-primary-400 transition-all duration-500"
							style="width: {sharedPercent}%"
						></div>
					</div>
					<!-- Stats -->
					<div class="grid grid-cols-2">
						<div class="px-4 py-3">
							<div class="flex items-center gap-2 mb-1">
								<div class="w-2.5 h-2.5 rounded-sm bg-neutral-500 shrink-0"></div>
								<span class="text-xs text-charcoal-muted uppercase tracking-wide">Personal</span>
							</div>
							<p class="font-mono {sharedBreakdown.personal >= sharedBreakdown.shared ? 'text-lg' : 'text-base'} font-medium text-charcoal">{formatCurrency(sharedBreakdown.personal)}</p>
							<p class="text-xs text-charcoal-muted mt-0.5">{personalPercent}% of spending</p>
						</div>
						<div class="px-4 py-3">
							<div class="flex items-center gap-2 mb-1">
								<div class="w-2.5 h-2.5 rounded-sm bg-primary-400 shrink-0"></div>
								<span class="text-xs text-charcoal-muted uppercase tracking-wide">Shared</span>
							</div>
							<p class="font-mono {sharedBreakdown.shared >= sharedBreakdown.personal ? 'text-lg' : 'text-base'} font-medium text-charcoal">{formatCurrency(sharedBreakdown.shared)}</p>
							<p class="text-xs text-charcoal-muted mt-0.5">{sharedPercent}% · your portion</p>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
