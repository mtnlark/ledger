<script lang="ts">
	import { format } from 'date-fns';
	import { parseMonthKey, getMonthKey } from '$lib/db';
	import type { Transaction, Category } from '$lib/db';
	import InsightMetric from './InsightMetric.svelte';

	interface Props {
		transactions: Transaction[];
		categories: Category[];
	}

	let { transactions, categories }: Props = $props();

	// Filter to current year transactions
	let currentYear = new Date().getFullYear();
	let ytdTransactions = $derived(
		transactions.filter((t) => new Date(t.date).getFullYear() === currentYear)
	);

	// Calculate total spent (user's portion)
	let totalSpent = $derived(
		ytdTransactions.reduce((sum, t) => sum + (t.isShared ? t.amount - t.partnerShare : t.amount), 0)
	);

	// Calculate spending by category
	let categorySpending = $derived.by(() => {
		const spending = new Map<number, number>();
		for (const t of ytdTransactions) {
			const amount = t.isShared ? t.amount - t.partnerShare : t.amount;
			spending.set(t.categoryId, (spending.get(t.categoryId) || 0) + amount);
		}
		return spending;
	});

	// Top 3 categories
	let topCategories = $derived.by(() => {
		return Array.from(categorySpending.entries())
			.map(([catId, amount]) => {
				const cat = categories.find((c) => c.id === catId);
				return {
					name: cat?.name ?? 'Unknown',
					icon: cat?.icon ?? '',
					amount
				};
			})
			.sort((a, b) => b.amount - a.amount)
			.slice(0, 3);
	});

	// Spending by month to find biggest month
	let monthlySpending = $derived.by(() => {
		const spending = new Map<string, number>();
		for (const t of ytdTransactions) {
			const monthKey = getMonthKey(new Date(t.date));
			const amount = t.isShared ? t.amount - t.partnerShare : t.amount;
			spending.set(monthKey, (spending.get(monthKey) || 0) + amount);
		}
		return spending;
	});

	let biggestMonth = $derived.by(() => {
		let max = { month: '', amount: 0 };
		for (const [month, amount] of monthlySpending) {
			if (amount > max.amount) {
				max = { month, amount };
			}
		}
		return max.month ? { label: format(parseMonthKey(max.month), 'MMMM'), amount: max.amount } : null;
	});

	// Most frequent merchant
	let merchantFrequency = $derived.by(() => {
		const freq = new Map<string, number>();
		for (const t of ytdTransactions) {
			freq.set(t.merchant, (freq.get(t.merchant) || 0) + 1);
		}
		return freq;
	});

	let topMerchant = $derived.by(() => {
		let max = { merchant: '', count: 0 };
		for (const [merchant, count] of merchantFrequency) {
			if (count > max.count) {
				max = { merchant, count };
			}
		}
		return max.merchant ? max : null;
	});

	// No-spend days calculation (only count days up to today)
	let spendDays = $derived.by(() => {
		const today = format(new Date(), 'yyyy-MM-dd');
		const days = new Set<string>();
		for (const t of ytdTransactions) {
			const dateKey = format(new Date(t.date), 'yyyy-MM-dd');
			if (dateKey <= today) {
				days.add(dateKey);
			}
		}
		return days;
	});

	let daysInYearSoFar = $derived.by(() => {
		const start = new Date(currentYear, 0, 1);
		const today = new Date();
		const diff = today.getTime() - start.getTime();
		return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
	});

	let noSpendDays = $derived(daysInYearSoFar - spendDays.size);
</script>

<div class="space-y-6">
	<!-- Key metrics grid -->
	<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
		<div class="bg-surface-hover rounded-lg p-4">
			<InsightMetric value="${totalSpent.toLocaleString()}" label="Total YTD" size="md" />
		</div>
		<div class="bg-surface-hover rounded-lg p-4">
			<InsightMetric value={ytdTransactions.length.toString()} label="Transactions" size="md" />
		</div>
		<div class="bg-surface-hover rounded-lg p-4">
			<InsightMetric value={noSpendDays.toString()} label="No-Spend Days" size="md" />
		</div>
		<div class="bg-surface-hover rounded-lg p-4">
			<InsightMetric
				value="${Math.round(totalSpent / (daysInYearSoFar || 1)).toLocaleString()}"
				label="Daily Avg"
				size="md"
			/>
		</div>
	</div>

	<!-- Top categories -->
	<div>
		<h4 class="text-sm font-medium text-charcoal-soft mb-3">Top Categories</h4>
		<div class="space-y-2">
			{#each topCategories as cat, i}
				<div class="flex items-center justify-between p-3 bg-surface-hover rounded-lg">
					<div class="flex items-center gap-3">
						<span class="text-lg">{cat.icon}</span>
						<span class="font-medium text-charcoal">{cat.name}</span>
					</div>
					<span class="font-semibold text-charcoal">${cat.amount.toLocaleString()}</span>
				</div>
			{/each}
		</div>
	</div>

	<!-- Additional stats -->
	<div class="grid grid-cols-2 gap-4">
		{#if biggestMonth}
			<div class="bg-surface-hover rounded-lg p-4">
				<p class="text-sm text-charcoal-muted">Biggest Month</p>
				<p class="font-semibold text-charcoal">{biggestMonth.label}</p>
				<p class="text-sm text-charcoal-soft">${biggestMonth.amount.toLocaleString()}</p>
			</div>
		{/if}
		{#if topMerchant}
			<div class="bg-surface-hover rounded-lg p-4">
				<p class="text-sm text-charcoal-muted">Most Frequent</p>
				<p class="font-semibold text-charcoal truncate">{topMerchant.merchant}</p>
				<p class="text-sm text-charcoal-soft">{topMerchant.count} visits</p>
			</div>
		{/if}
	</div>
</div>
