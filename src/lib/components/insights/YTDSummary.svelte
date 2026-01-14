<script lang="ts">
	import { format } from 'date-fns';
	import { getMonthKey } from '$lib/db';
	import type { Transaction } from '$lib/db';
	import { formatCurrencyWhole } from '$lib/utils/modal-helpers';
	import InsightGroup from './InsightGroup.svelte';
	import CalendarHeatmap from './CalendarHeatmap.svelte';

	interface Props {
		transactions: Transaction[];
	}

	let { transactions }: Props = $props();

	let currentYear = new Date().getFullYear();

	// Filter to current year
	let ytdTransactions = $derived(
		transactions.filter((t) => new Date(t.date).getFullYear() === currentYear)
	);

	// Build daily spending map
	let dailySpending = $derived.by(() => {
		const spending = new Map<string, number>();
		for (const t of ytdTransactions) {
			const dateKey = format(new Date(t.date), 'yyyy-MM-dd');
			const amount = t.isShared ? t.amount - t.partnerShare : t.amount;
			spending.set(dateKey, (spending.get(dateKey) || 0) + amount);
		}
		return spending;
	});

	// Calculate preview metrics
	let totalSpent = $derived(
		ytdTransactions.reduce((sum, t) => sum + (t.isShared ? t.amount - t.partnerShare : t.amount), 0)
	);

	let spendDays = $derived.by(() => {
		const days = new Set<string>();
		for (const t of ytdTransactions) {
			days.add(format(new Date(t.date), 'yyyy-MM-dd'));
		}
		return days.size;
	});

	let daysInYearSoFar = $derived.by(() => {
		const start = new Date(currentYear, 0, 1);
		const today = new Date();
		return Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
	});

	let noSpendDays = $derived(daysInYearSoFar - spendDays);

	// Recent 30 days for mini heatmap
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

	// Daily average
	let dailyAvg = $derived(daysInYearSoFar > 0 ? totalSpent / daysInYearSoFar : 0);

	// Biggest spending month (calculated from transactions)
	let biggestMonth = $derived.by(() => {
		const monthlySpending = new Map<string, number>();
		for (const t of ytdTransactions) {
			const monthKey = getMonthKey(new Date(t.date));
			const amount = t.isShared ? t.amount - t.partnerShare : t.amount;
			monthlySpending.set(monthKey, (monthlySpending.get(monthKey) || 0) + amount);
		}
		if (monthlySpending.size === 0) return null;
		let max = { month: '', amount: 0 };
		for (const [month, amount] of monthlySpending) {
			if (amount > max.amount) {
				max = { month, amount };
			}
		}
		if (!max.month) return null;
		const [year, monthNum] = max.month.split('-').map(Number);
		const monthName = new Date(year, monthNum - 1).toLocaleString('default', { month: 'long' });
		return { label: monthName, amount: max.amount };
	});

	// Most frequent merchant
	let topMerchant = $derived.by(() => {
		const freq = new Map<string, number>();
		for (const t of ytdTransactions) {
			freq.set(t.merchant, (freq.get(t.merchant) || 0) + 1);
		}
		let max = { merchant: '', count: 0 };
		for (const [merchant, count] of freq) {
			if (count > max.count) {
				max = { merchant, count };
			}
		}
		return max.merchant ? max : null;
	});

	// Calculate all-time needs vs wants
	let needsWantsStats = $derived.by(() => {
		let needs = 0;
		let wants = 0;

		for (const tx of transactions) {
			const userAmount = tx.isShared ? tx.amount - tx.partnerShare : tx.amount;

			if (tx.isEssential) {
				needs += userAmount;
			} else {
				wants += userAmount;
			}
		}

		const total = needs + wants;
		const needsPercent = total > 0 ? (needs / total) * 100 : 0;
		const wantsPercent = total > 0 ? (wants / total) * 100 : 0;

		return { needs, wants, total, needsPercent, wantsPercent };
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
						{@const intensity = amount === 0 ? 0 : Math.min(4, Math.ceil((amount / (maxAmount || 1)) * 4))}
						{@const colors = ['bg-surface-alt', 'bg-green-200', 'bg-green-300', 'bg-green-400', 'bg-green-600']}
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
