<script lang="ts">
	import { TrendingUp, TrendingDown, AlertTriangle, Gauge, Receipt, Store, BarChart3 } from 'lucide-svelte';
	import { getMonthKey, navigateMonth, parseMonthKey } from '$lib/db';
	import type { Transaction, Category, MonthlyBudget } from '$lib/db';
	import { config } from '$lib/config';
	import { getInsightsEngine } from '$lib/insights';
	import { computeStdDev } from '$lib/insights/calculations/stats';

	interface Props {
		currentMonthTransactions: Transaction[];
		allTransactions: Transaction[];
		categories: Category[];
		availableMonths: string[];
		budget: MonthlyBudget | null;
		selectedMonth: string;
	}

	let { currentMonthTransactions, allTransactions, categories, availableMonths, budget, selectedMonth }: Props =
		$props();

	const engine = getInsightsEngine();

	// Determine if viewing current month
	let isCurrentMonth = $derived(selectedMonth === getMonthKey(new Date()));

	// Dynamic title
	let title = $derived(isCurrentMonth ? 'Highlights' : 'Month in Review');

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

	// --- Current month (forward-looking) computations ---

	// Gather recent months for historical comparison (excluding selected)
	let recentMonths = $derived.by(() => {
		if (availableMonths.length < 2) return [] as string[];

		const months: string[] = [];
		let month = navigateMonth(selectedMonth, -1);
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
		return engine.getCategoryStats(getTransactionsForMonth, recentMonths, selectedMonth);
	});

	// Detect anomalies (categories significantly above average using z-scores)
	let anomalies = $derived.by(() => {
		const currentSpending = engine.getSpendingByCategory(currentMonthTransactions, selectedMonth);
		return engine.getAnomalies(currentSpending, categoryStats, categories, config.insights.anomaly, selectedMonth);
	});

	// Calculate pace projection (only meaningful for current month)
	let paceProjection = $derived.by(() => {
		if (!isCurrentMonth) return null;
		const today = new Date();
		const currentDay = today.getDate();
		const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
		const totalSpent = engine.getTotalSpent(currentMonthTransactions, selectedMonth);
		return engine.getPaceProjection(totalSpent, budget, currentDay, daysInMonth, selectedMonth);
	});

	// Get previous month for comparison
	let previousMonthKey = $derived(navigateMonth(selectedMonth, -1));

	// Calculate top category shift (biggest statistically significant change)
	let topShift = $derived.by(() => {
		if (!isCurrentMonth) return null;
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
			selectedMonth,
			categoryStats
		);
	});

	// Fallback: Needs vs wants ratio (current month only)
	let needsVsWants = $derived.by(() => {
		if (!isCurrentMonth) return null;
		return engine.getNeedsVsWants(currentMonthTransactions, selectedMonth);
	});

	// Compute historical monthly totals for velocity adaptive threshold
	let historicalMonthlyTotals = $derived.by(() => {
		return recentMonths.map((month) => {
			const txs = getTransactionsForMonth(month);
			return engine.getTotalSpent(txs, month);
		});
	});

	// Compute historical spending stats for pace projection context
	let monthlyTotalStats = $derived.by(() => {
		if (historicalMonthlyTotals.length < 2) return null;
		const mean = historicalMonthlyTotals.reduce((s, v) => s + v, 0) / historicalMonthlyTotals.length;
		const sd = computeStdDev(historicalMonthlyTotals);
		if (sd === 0) return null;
		return { mean, stdDev: sd };
	});

	// Fallback: Spending velocity comparison (current month only)
	let velocityComparison = $derived.by(() => {
		if (!isCurrentMonth) return null;
		const prevTransactions = getTransactionsForMonth(previousMonthKey);
		if (prevTransactions.length === 0) return null;

		const today = new Date();
		const currentDay = today.getDate();
		const currentTotal = engine.getTotalSpent(currentMonthTransactions, selectedMonth);

		const prevMonthDate = parseMonthKey(previousMonthKey);
		const daysInPrevMonth = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0).getDate();
		const prevTotal = engine.getTotalSpent(prevTransactions, previousMonthKey);

		return engine.getVelocityComparison(
			currentTotal,
			prevTotal,
			currentDay,
			daysInPrevMonth,
			config.insights.velocity.percentThreshold,
			selectedMonth,
			historicalMonthlyTotals
		);
	});

	// Fallback: Most frequent merchant (current month only)
	let topMerchant = $derived.by(() => {
		if (!isCurrentMonth) return null;
		return engine.getTopMerchant(currentMonthTransactions, selectedMonth, config.insights.topMerchant.minVisits);
	});

	// --- Past month (retrospective) computations ---

	let monthReview = $derived.by(() => {
		if (isCurrentMonth) return null;
		const prevTransactions = getTransactionsForMonth(previousMonthKey);
		return engine.getMonthReview(
			selectedMonth,
			currentMonthTransactions,
			prevTransactions,
			allTransactions,
			categories
		);
	});

	// Build takeaways list
	interface Takeaway {
		type: 'anomaly' | 'pace' | 'shift' | 'needsWants' | 'monthComparison' | 'topMerchant' | 'rank' | 'vsAverage' | 'biggestPurchase' | 'categoryStandout' | 'mostVisited';
		icon: typeof AlertTriangle;
		iconColor: string;
		text: string;
	}

	let takeaways = $derived.by(() => {
		const items: Takeaway[] = [];
		const maxCount = config.insights.takeaways.maxCount;

		if (isCurrentMonth) {
			// --- Forward-looking mode ---

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
				const rangeContext = monthlyTotalStats
					? ` (typical: $${Math.round(monthlyTotalStats.mean - monthlyTotalStats.stdDev).toLocaleString()}–$${Math.round(monthlyTotalStats.mean + monthlyTotalStats.stdDev).toLocaleString()})`
					: '';
				items.push({
					type: 'pace',
					icon: Gauge,
					iconColor: paceProjection.isOverBudget ? 'text-danger-500' : 'text-success-500',
					text: paceProjection.isOverBudget
						? `On pace to spend $${paceProjection.projected.toLocaleString()} (${paceProjection.percentOfBudget}% of budget)`
						: `On pace to spend $${paceProjection.projected.toLocaleString()} this month${rangeContext}`
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
			if (items.length < maxCount && velocityComparison) {
				const verb = velocityComparison.isUp ? 'faster' : 'slower';
				items.push({
					type: 'monthComparison',
					icon: velocityComparison.isUp ? TrendingUp : TrendingDown,
					iconColor: velocityComparison.isUp ? 'text-warning-500' : 'text-success-500',
					text: `Spending ${Math.abs(velocityComparison.percentChange)}% ${verb} than last month's pace`
				});
			}

			if (items.length < maxCount && needsVsWants) {
				items.push({
					type: 'needsWants',
					icon: Receipt,
					iconColor: 'text-primary-500',
					text: `${needsVsWants.needsPercent}% of spending is on needs this month`
				});
			}

			if (items.length < maxCount && topMerchant) {
				items.push({
					type: 'topMerchant',
					icon: Store,
					iconColor: 'text-charcoal-muted',
					text: `${topMerchant.merchant} visited ${topMerchant.count} times this month`
				});
			}
		} else {
			// --- Retrospective mode ---

			// Anomalies are still valid retrospectively
			for (const anomaly of anomalies) {
				const percent = Math.round((anomaly.ratio - 1) * 100);
				items.push({
					type: 'anomaly',
					icon: AlertTriangle,
					iconColor: 'text-warning-500',
					text: `${anomaly.name} was ${percent}% higher than usual`
				});
			}

			if (monthReview) {
				// vs Average
				if (monthReview.vsAverage) {
					const { percentDiff, isAbove } = monthReview.vsAverage;
					items.push({
						type: 'vsAverage',
						icon: isAbove ? TrendingUp : TrendingDown,
						iconColor: isAbove ? 'text-warning-500' : 'text-success-500',
						text: `${percentDiff}% ${isAbove ? 'above' : 'below'} your typical month`
					});
				}

				// Biggest purchase
				if (monthReview.biggestPurchase) {
					const { merchant, amount } = monthReview.biggestPurchase;
					items.push({
						type: 'biggestPurchase',
						icon: Receipt,
						iconColor: 'text-primary-500',
						text: `Largest purchase: $${amount.toLocaleString()} at ${merchant}`
					});
				}

				// Category standout
				if (monthReview.categoryStandout) {
					const { name, diff, isIncrease } = monthReview.categoryStandout;
					items.push({
						type: 'categoryStandout',
						icon: isIncrease ? TrendingUp : TrendingDown,
						iconColor: isIncrease ? 'text-warning-500' : 'text-success-500',
						text: `${name} ${isIncrease ? 'up' : 'down'} $${diff.toLocaleString()} from prior month`
					});
				}

				// Historical rank (only show when it's the actual highest or lowest)
				if (monthReview.historicalRank && monthReview.historicalRank.rank === 1) {
					const { total, direction } = monthReview.historicalRank;
					items.push({
						type: 'rank',
						icon: BarChart3,
						iconColor: direction === 'lowest' ? 'text-success-500' : 'text-warning-500',
						text: `Your ${direction} spending month out of ${total}`
					});
				}

				// Most visited merchant
				if (monthReview.mostVisitedMerchant) {
					const { merchant, count } = monthReview.mostVisitedMerchant;
					items.push({
						type: 'mostVisited',
						icon: Store,
						iconColor: 'text-charcoal-muted',
						text: `${merchant} visited ${count} times`
					});
				}

				// Needs vs Wants
				if (monthReview.needsPercent !== null) {
					items.push({
						type: 'needsWants',
						icon: Receipt,
						iconColor: 'text-primary-500',
						text: `${monthReview.needsPercent}% needs, ${100 - monthReview.needsPercent}% wants`
					});
				}
			}
		}

		return isCurrentMonth ? items.slice(0, maxCount) : items;
	});

	// Check if we have any takeaways to show
	let hasTakeaways = $derived(takeaways.length > 0);

	// Helper: ordinal suffix
	function getOrdinal(n: number): string {
		const s = ['th', 'st', 'nd', 'rd'];
		const v = n % 100;
		return n + (s[(v - 20) % 10] || s[v] || s[0]);
	}
</script>

{#if hasTakeaways}
	<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
		<div class="px-6 py-4">
			<h2 class="font-display text-lg font-medium text-charcoal mb-3">{title}</h2>
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
