<script lang="ts">
	import { TrendingUp, TrendingDown, AlertTriangle, Gauge, Receipt, Store } from 'lucide-svelte';
	import { getMonthKey, navigateMonth, parseMonthKey } from '$lib/db';
	import type { Transaction, Category, MonthlyBudget } from '$lib/db';
	import { config } from '$lib/config';
	import { getInsightsEngine } from '$lib/insights';

	interface Props {
		currentMonthTransactions: Transaction[];
		allTransactions: Transaction[];
		categories: Category[];
		availableMonths: string[];
		budget: MonthlyBudget | null;
	}

	let { currentMonthTransactions, allTransactions, categories, availableMonths, budget }: Props =
		$props();

	const engine = getInsightsEngine();

	// Current month key
	let currentMonthKey = getMonthKey(new Date());

	// Get transactions for a specific month from all transactions
	function getTransactionsForMonth(month: string): Transaction[] {
		const monthDate = parseMonthKey(month);
		const year = monthDate.getFullYear();
		const monthNum = monthDate.getMonth();
		return allTransactions.filter((t) => {
			const d = new Date(t.date);
			return d.getFullYear() === year && d.getMonth() === monthNum;
		});
	}

	// Gather recent months for historical comparison (excluding current)
	let recentMonths = $derived.by(() => {
		if (availableMonths.length < 2) return [] as string[];

		const months: string[] = [];
		let month = navigateMonth(currentMonthKey, -1);
		for (let i = 0; i < config.insights.takeaways.monthsToAverage; i++) {
			if (availableMonths.includes(month)) {
				months.push(month);
			}
			month = navigateMonth(month, -1);
		}
		return months;
	});

	// Calculate category stats (mean + stdDev) for anomaly and shift detection
	let categoryStats = $derived.by(() => {
		if (recentMonths.length === 0) return new Map<number, { mean: number; stdDev: number }>();
		return engine.getCategoryStats(getTransactionsForMonth, recentMonths, currentMonthKey);
	});

	// Detect anomalies (categories significantly above average using z-scores)
	let anomalies = $derived.by(() => {
		const currentSpending = engine.getSpendingByCategory(currentMonthTransactions, currentMonthKey);
		return engine.getAnomalies(currentSpending, categoryStats, categories, config.insights.anomaly, currentMonthKey);
	});

	// Calculate pace projection
	let paceProjection = $derived.by(() => {
		const today = new Date();
		const currentDay = today.getDate();
		const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
		const totalSpent = engine.getTotalSpent(currentMonthTransactions, currentMonthKey);
		return engine.getPaceProjection(totalSpent, budget, currentDay, daysInMonth, currentMonthKey);
	});

	// Get previous month for comparison
	let previousMonthKey = $derived(navigateMonth(currentMonthKey, -1));

	// Calculate top category shift (biggest statistically significant change)
	let topShift = $derived.by(() => {
		const prevTransactions = getTransactionsForMonth(previousMonthKey);
		const today = new Date();
		const currentDay = today.getDate();
		return engine.getTopCategoryShift(
			currentMonthTransactions,
			prevTransactions,
			categories,
			currentDay,
			anomalies,
			config.insights.shift,
			currentMonthKey,
			categoryStats
		);
	});

	// Fallback: Needs vs wants ratio
	let needsVsWants = $derived(engine.getNeedsVsWants(currentMonthTransactions, currentMonthKey));

	// Compute historical monthly totals for velocity adaptive threshold
	let historicalMonthlyTotals = $derived.by(() => {
		return recentMonths.map((month) => {
			const txs = getTransactionsForMonth(month);
			return engine.getTotalSpent(txs, month);
		});
	});

	// Fallback: Spending velocity comparison (daily average this month vs last month)
	let velocityComparison = $derived.by(() => {
		const prevTransactions = getTransactionsForMonth(previousMonthKey);
		if (prevTransactions.length === 0) return null;

		const today = new Date();
		const currentDay = today.getDate();
		const currentTotal = engine.getTotalSpent(currentMonthTransactions, currentMonthKey);

		const prevMonthDate = parseMonthKey(previousMonthKey);
		const daysInPrevMonth = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0).getDate();
		const prevTotal = engine.getTotalSpent(prevTransactions, previousMonthKey);

		return engine.getVelocityComparison(
			currentTotal,
			prevTotal,
			currentDay,
			daysInPrevMonth,
			config.insights.velocity.percentThreshold,
			currentMonthKey,
			historicalMonthlyTotals
		);
	});

	// Fallback: Most frequent merchant this month
	let topMerchant = $derived(
		engine.getTopMerchant(currentMonthTransactions, currentMonthKey, config.insights.topMerchant.minVisits)
	);

	// Build takeaways list
	interface Takeaway {
		type: 'anomaly' | 'pace' | 'shift' | 'needsWants' | 'monthComparison' | 'topMerchant';
		icon: typeof AlertTriangle;
		iconColor: string;
		text: string;
	}

	let takeaways = $derived.by(() => {
		const items: Takeaway[] = [];

		// Add anomalies first (highest priority)
		for (const anomaly of anomalies) {
			const percent = Math.round((anomaly.ratio - 1) * 100);
			items.push({
				type: 'anomaly',
				icon: AlertTriangle,
				iconColor: 'text-warning-500',
				text: `${anomaly.name} is ${percent}% higher than usual`
			});
		}

		// Add pace projection
		if (paceProjection) {
			items.push({
				type: 'pace',
				icon: Gauge,
				iconColor: paceProjection.isOverBudget ? 'text-danger-500' : 'text-success-500',
				text: paceProjection.isOverBudget
					? `On pace to spend $${paceProjection.projected.toLocaleString()} (${paceProjection.percentOfBudget}% of budget)`
					: `On pace to spend $${paceProjection.projected.toLocaleString()} this month`
			});
		}

		// Add top category shift
		if (topShift) {
			items.push({
				type: 'shift',
				icon: topShift.isIncrease ? TrendingUp : TrendingDown,
				iconColor: topShift.isIncrease ? 'text-warning-500' : 'text-success-500',
				text: topShift.isIncrease
					? `${topShift.name} up $${Math.abs(topShift.diff).toLocaleString()} from last month`
					: `${topShift.name} down $${Math.abs(topShift.diff).toLocaleString()} from last month`
			});
		}

		// Add fallbacks to reach max count
		if (items.length < config.insights.takeaways.maxCount && velocityComparison) {
			const verb = velocityComparison.isUp ? 'faster' : 'slower';
			items.push({
				type: 'monthComparison',
				icon: velocityComparison.isUp ? TrendingUp : TrendingDown,
				iconColor: velocityComparison.isUp ? 'text-warning-500' : 'text-success-500',
				text: `Spending ${Math.abs(velocityComparison.percentChange)}% ${verb} than last month's pace`
			});
		}

		if (items.length < config.insights.takeaways.maxCount && needsVsWants) {
			items.push({
				type: 'needsWants',
				icon: Receipt,
				iconColor: 'text-primary-500',
				text: `${needsVsWants.needsPercent}% of spending is on needs this month`
			});
		}

		if (items.length < config.insights.takeaways.maxCount && topMerchant) {
			items.push({
				type: 'topMerchant',
				icon: Store,
				iconColor: 'text-charcoal-muted',
				text: `${topMerchant.merchant} visited ${topMerchant.count} times this month`
			});
		}

		return items.slice(0, config.insights.takeaways.maxCount);
	});

	// Check if we have any takeaways to show
	let hasTakeaways = $derived(takeaways.length > 0);
</script>

{#if hasTakeaways}
	<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
		<div class="px-6 py-4">
			<h2 class="font-display text-lg font-medium text-charcoal mb-3">Highlights</h2>
			<div class="space-y-2">
				{#each takeaways as takeaway}
					<div class="flex items-start gap-3">
						<div class="flex-shrink-0 mt-0.5">
							<takeaway.icon size={18} class={takeaway.iconColor} />
						</div>
						<p class="text-sm text-charcoal-soft">{takeaway.text}</p>
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}
