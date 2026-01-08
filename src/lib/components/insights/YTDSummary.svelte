<script lang="ts">
	import { format } from 'date-fns';
	import { getMonthKey } from '$lib/db';
	import type { Transaction, Category } from '$lib/db';
	import InsightGroup from './InsightGroup.svelte';
	import CalendarHeatmap from './CalendarHeatmap.svelte';
	import YTDStats from './YTDStats.svelte';

	interface Props {
		transactions: Transaction[];
		categories: Category[];
	}

	let { transactions, categories }: Props = $props();

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
</script>

<InsightGroup title="Year-to-Date Summary" description="{currentYear} spending overview">
	{#snippet preview()}
		<div class="space-y-3">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-2xl font-bold text-gray-900">${totalSpent.toLocaleString()}</p>
					<p class="text-sm text-gray-500">Total spent in {currentYear}</p>
				</div>
				<div class="text-right">
					<p class="text-lg font-semibold text-green-600">{noSpendDays}</p>
					<p class="text-sm text-gray-500">no-spend days</p>
				</div>
			</div>
			<!-- Mini heatmap preview (last 30 days) -->
			<div class="pt-2">
				<p class="text-xs text-gray-500 mb-1">Last 30 days</p>
				<div class="flex gap-1">
					{#each Array.from(recentDailySpending.entries()) as [dateKey, amount]}
						{@const maxAmount = Math.max(...Array.from(recentDailySpending.values()))}
						{@const intensity = amount === 0 ? 0 : Math.min(4, Math.ceil((amount / (maxAmount || 1)) * 4))}
						{@const colors = ['bg-gray-100', 'bg-green-200', 'bg-green-300', 'bg-green-400', 'bg-green-600']}
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
				<h3 class="text-sm font-medium text-gray-700 mb-3">Spending Calendar</h3>
				<CalendarHeatmap {dailySpending} year={currentYear} />
			</div>

			<!-- YTD Stats -->
			<YTDStats transactions={ytdTransactions} {categories} />
		</div>
	{/snippet}
</InsightGroup>
