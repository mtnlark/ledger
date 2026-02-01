<script lang="ts">
	import { TrendingUp, TrendingDown, AlertTriangle, Gauge, Receipt, Store, BarChart3, PiggyBank, ChevronDown, ChevronUp, Trophy, Flame } from 'lucide-svelte';
	import { getMonthKey, navigateMonth, parseMonthKey } from '$lib/db';
	import type { Transaction, Category, MonthlyBudget, SavingsContribution } from '$lib/db';
	import { config } from '$lib/config';
	import { getInsightsEngine } from '$lib/insights';
	import { computeStdDev } from '$lib/insights/calculations/stats';
	import { computeSavingsReview } from '$lib/insights/calculations/month-review';
	import { formatCurrency } from '$lib/utils/format-helpers';
	import { filterUpToDate } from '$lib/utils/date-helpers';

	interface Props {
		currentMonthTransactions: Transaction[];
		allTransactions: Transaction[];
		categories: Category[];
		availableMonths: string[];
		budget: MonthlyBudget | null;
		selectedMonth: string;
		// Savings data (optional for backwards compatibility)
		contributions?: SavingsContribution[];
		allContributions?: SavingsContribution[];
		allBudgets?: MonthlyBudget[];
	}

	let {
		currentMonthTransactions,
		allTransactions,
		categories,
		availableMonths,
		budget,
		selectedMonth,
		contributions = [],
		allContributions = [],
		allBudgets = []
	}: Props = $props();

	const engine = getInsightsEngine();

	// Determine if viewing current month
	let isCurrentMonth = $derived(selectedMonth === getMonthKey(new Date()));

	// Dynamic title
	let title = $derived(isCurrentMonth ? 'Highlights' : 'Month in Review');

	// Expand/collapse state for retrospective mode
	let isExpanded = $state(false);

	// Reset expanded state when month changes
	$effect(() => {
		selectedMonth; // track dependency
		isExpanded = false;
	});

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
		if (recentMonths.length === 0) return new Map<number, { mean: number; stdDev: number; sampleCount: number }>();
		return engine.getCategoryStats(getTransactionsForMonth, recentMonths, selectedMonth);
	});

	// Detect anomalies (categories significantly above average using z-scores)
	let anomalies = $derived.by(() => {
		const currentSpending = engine.getSpendingByCategory(currentMonthTransactions, selectedMonth);
		return engine.getAnomalies(currentSpending, categoryStats, categories, config.insights.anomaly, selectedMonth);
	});

	// Transactions up to today (excludes future-dated recurring entries) for pace calculations
	let pastTransactions = $derived(isCurrentMonth ? filterUpToDate(currentMonthTransactions) : []);

	// Calculate pace projection (only meaningful for current month)
	let paceProjection = $derived.by(() => {
		if (!isCurrentMonth) return null;
		const today = new Date();
		const currentDay = today.getDate();
		const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
		const totalSpent = engine.getTotalSpent(pastTransactions, selectedMonth);
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
		const currentTotal = engine.getTotalSpent(pastTransactions, selectedMonth);

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

	// Compute savings review (positive insights only)
	let savingsReview = $derived.by(() => {
		if (contributions.length === 0) return null;
		return computeSavingsReview(
			selectedMonth,
			contributions,
			allContributions,
			budget?.income ?? null,
			allBudgets
		);
	});

	// --- Retrospective mode: Hero stat and grouped insights ---

	// Compute total spent for the month
	let totalSpent = $derived(engine.getTotalSpent(currentMonthTransactions, selectedMonth));

	// Hero stat for retrospective mode (the most important/interesting insight)
	let heroStat = $derived.by(() => {
		if (isCurrentMonth) return null;

		// Priority 1: Rank superlative (highest or lowest spending month)
		if (monthReview?.historicalRank?.rank === 1) {
			const { total, direction } = monthReview.historicalRank;
			return {
				type: 'rank' as const,
				icon: direction === 'lowest' ? TrendingDown : Flame,
				iconColor: direction === 'lowest' ? 'text-success-500' : 'text-warning-500',
				headline: direction === 'lowest' ? 'Your lowest spending month!' : 'Your highest spending month',
				subtext: `${formatCurrency(totalSpent)} total · out of ${total} months`
			};
		}

		// Priority 2: Highest savings month
		if (savingsReview?.isHighestMonth && savingsReview.totalSaved > 0) {
			return {
				type: 'savingsHighest' as const,
				icon: Trophy,
				iconColor: 'text-success-500',
				headline: 'Your highest savings month!',
				subtext: `${formatCurrency(savingsReview.totalSaved)} saved${savingsReview.savingsRate !== null ? ` · ${Math.round(savingsReview.savingsRate * 100)}% savings rate` : ''}`
			};
		}

		// Priority 3: Significant vs-average (spending)
		if (monthReview?.vsAverage && monthReview.vsAverage.percentDiff >= 15) {
			const { percentDiff, isAbove } = monthReview.vsAverage;
			return {
				type: 'vsAverage' as const,
				icon: isAbove ? TrendingUp : TrendingDown,
				iconColor: isAbove ? 'text-warning-500' : 'text-success-500',
				headline: `${percentDiff}% ${isAbove ? 'above' : 'below'} your typical month`,
				subtext: `${formatCurrency(totalSpent)} total spending`
			};
		}

		// Priority 4: Historical rank (if noteworthy, e.g., top 3)
		if (monthReview?.historicalRank && monthReview.historicalRank.rank <= 3) {
			const { rank, total, direction } = monthReview.historicalRank;
			return {
				type: 'rank' as const,
				icon: BarChart3,
				iconColor: direction === 'lowest' ? 'text-success-500' : 'text-warning-500',
				headline: `Your ${getOrdinal(rank)} ${direction} spending month`,
				subtext: `${formatCurrency(totalSpent)} total · out of ${total} months`
			};
		}

		// Fallback: Just show the total
		return {
			type: 'total' as const,
			icon: BarChart3,
			iconColor: 'text-charcoal-muted',
			headline: `${formatCurrency(totalSpent)} spent`,
			subtext: `${currentMonthTransactions.length} transaction${currentMonthTransactions.length !== 1 ? 's' : ''}`
		};
	});

	// Grouped insights for retrospective mode
	interface GroupedInsight {
		text: string;
	}

	let spendingInsights = $derived.by(() => {
		if (isCurrentMonth || !monthReview) return [] as GroupedInsight[];
		const items: GroupedInsight[] = [];

		// vs Average (if not already hero)
		if (monthReview.vsAverage && heroStat?.type !== 'vsAverage') {
			const { percentDiff, isAbove } = monthReview.vsAverage;
			items.push({ text: `${percentDiff}% ${isAbove ? 'above' : 'below'} your typical month` });
		}

		// Category standout
		if (monthReview.categoryStandout) {
			const { name, diff, isIncrease } = monthReview.categoryStandout;
			items.push({ text: `${name} ${isIncrease ? 'up' : 'down'} ${formatCurrency(diff)} from prior month` });
		}

		// Anomalies
		for (const anomaly of anomalies) {
			const percent = Math.round((anomaly.ratio - 1) * 100);
			items.push({ text: `${anomaly.name} was ${percent}% higher than usual` });
		}

		return items;
	});

	let savingsInsights = $derived.by(() => {
		if (isCurrentMonth || !savingsReview) return [] as GroupedInsight[];
		const items: GroupedInsight[] = [];

		// Skip if already hero
		if (heroStat?.type === 'savingsHighest') return items;

		if (savingsReview.isHighestMonth && savingsReview.totalSaved > 0) {
			items.push({ text: `Highest savings month: ${formatCurrency(savingsReview.totalSaved)}` });
		} else if (savingsReview.vsAverage) {
			const ratePercent = savingsReview.savingsRate !== null ? Math.round(savingsReview.savingsRate * 100) : null;
			items.push({
				text: ratePercent !== null
					? `${ratePercent}% savings rate · ${savingsReview.vsAverage.percentDiff}% above average`
					: `Saved ${savingsReview.vsAverage.percentDiff}% more than usual`
			});
		} else if (savingsReview.totalSaved >= 100) {
			items.push({ text: `${formatCurrency(savingsReview.totalSaved)} saved this month` });
		}

		return items;
	});

	let highlightInsights = $derived.by(() => {
		if (isCurrentMonth || !monthReview) return [] as GroupedInsight[];
		const items: GroupedInsight[] = [];

		// Biggest purchase
		if (monthReview.biggestPurchase) {
			const { merchant, amount } = monthReview.biggestPurchase;
			items.push({ text: `Biggest purchase: ${formatCurrency(amount)} at ${merchant}` });
		}

		// Most visited merchant
		if (monthReview.mostVisitedMerchant) {
			const { merchant, count } = monthReview.mostVisitedMerchant;
			items.push({ text: `Most visited merchant: ${merchant} (${count} times)` });
		}

		// Needs vs Wants
		if (monthReview.needsPercent !== null) {
			items.push({ text: `${monthReview.needsPercent}% needs, ${100 - monthReview.needsPercent}% wants` });
		}

		return items;
	});

	// Check if there are any grouped insights to show
	let hasGroupedInsights = $derived(
		spendingInsights.length > 0 || savingsInsights.length > 0 || highlightInsights.length > 0
	);

	// Build takeaways list (for current month / Highlights mode only)
	interface Takeaway {
		type: 'anomaly' | 'pace' | 'shift' | 'needsWants' | 'monthComparison' | 'topMerchant' | 'savingsHighest' | 'savingsAboveAvg';
		icon: typeof AlertTriangle;
		iconColor: string;
		text: string;
	}

	let takeaways = $derived.by(() => {
		if (!isCurrentMonth) return [] as Takeaway[];

		const items: Takeaway[] = [];
		const maxCount = config.insights.takeaways.maxCount;

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
				? ` (typical: ${formatCurrency(Math.round(monthlyTotalStats.mean - monthlyTotalStats.stdDev))}–${formatCurrency(Math.round(monthlyTotalStats.mean + monthlyTotalStats.stdDev))})`
				: '';
			items.push({
				type: 'pace',
				icon: Gauge,
				iconColor: paceProjection.isOverBudget ? 'text-danger-500' : 'text-success-500',
				text: paceProjection.isOverBudget
					? `On pace to spend ${formatCurrency(paceProjection.projected)} (${paceProjection.percentOfBudget}% of budget)`
					: `On pace to spend ${formatCurrency(paceProjection.projected)} this month${rangeContext}`
			});
		}

		// Add top category shift
		if (topShift) {
			items.push({
				type: 'shift',
				icon: topShift.isIncrease ? TrendingUp : TrendingDown,
				iconColor: topShift.isIncrease ? 'text-warning-500' : 'text-success-500',
				text: topShift.isIncrease
					? `${topShift.name} up ${formatCurrency(Math.abs(topShift.diff))} from last month`
					: `${topShift.name} down ${formatCurrency(Math.abs(topShift.diff))} from last month`
			});
		}

		// Add positive savings insights (never flag low rates)
		if (savingsReview) {
			if (savingsReview.isHighestMonth && savingsReview.totalSaved > 0) {
				items.push({
					type: 'savingsHighest',
					icon: Trophy,
					iconColor: 'text-success-500',
					text: `Your highest savings month! ${formatCurrency(savingsReview.totalSaved)} saved`
				});
			} else if (savingsReview.vsAverage) {
				items.push({
					type: 'savingsAboveAvg',
					icon: PiggyBank,
					iconColor: 'text-success-500',
					text: `Saving ${savingsReview.vsAverage.percentDiff}% more than usual this month`
				});
			}
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

		return items.slice(0, maxCount);
	});

	// Check if we have content to show
	let hasContent = $derived(
		isCurrentMonth ? takeaways.length > 0 : heroStat !== null
	);

	// Helper: ordinal suffix
	function getOrdinal(n: number): string {
		const s = ['th', 'st', 'nd', 'rd'];
		const v = n % 100;
		return n + (s[(v - 20) % 10] || s[v] || s[0]);
	}
</script>

{#if hasContent}
	<div class="bg-surface rounded-xl overflow-hidden card-primary">
		<div class="px-6 py-4">
			<h2 class="font-display text-lg font-medium text-charcoal mb-3">{title}</h2>

			{#if isCurrentMonth}
				<!-- Current month: bullet list format -->
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
			{:else if heroStat}
				<!-- Retrospective: Hero stat + expandable grouped insights -->
				<div class="space-y-4">
					<!-- Hero stat -->
					<div class="flex items-center gap-4">
						<div class="w-12 h-12 rounded-full bg-cream-dark flex items-center justify-center shrink-0">
							<heroStat.icon size={24} class={heroStat.iconColor} />
						</div>
						<div>
							<p class="font-medium text-charcoal text-lg">{heroStat.headline}</p>
							<p class="text-sm text-charcoal-muted">{heroStat.subtext}</p>
						</div>
					</div>

					<!-- Expand toggle (if there are more insights) -->
					{#if hasGroupedInsights}
						<button
							type="button"
							onclick={() => isExpanded = !isExpanded}
							class="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
						>
							{isExpanded ? 'Show less' : 'See more'}
							{#if isExpanded}
								<ChevronUp size={16} />
							{:else}
								<ChevronDown size={16} />
							{/if}
						</button>

						{#if isExpanded}
							<div class="space-y-4 pt-3 border-t border-theme">
								<!-- Spending insights -->
								{#if spendingInsights.length > 0}
									<div>
										<h3 class="text-sm font-semibold text-charcoal mb-1.5">Spending</h3>
										<ul class="space-y-1 pl-4">
											{#each spendingInsights as insight}
												<li class="text-sm text-charcoal-soft list-disc">{insight.text}</li>
											{/each}
										</ul>
									</div>
								{/if}

								<!-- Savings insights -->
								{#if savingsInsights.length > 0}
									<div>
										<h3 class="text-sm font-semibold text-charcoal mb-1.5">Savings</h3>
										<ul class="space-y-1 pl-4">
											{#each savingsInsights as insight}
												<li class="text-sm text-charcoal-soft list-disc">{insight.text}</li>
											{/each}
										</ul>
									</div>
								{/if}

								<!-- Highlights -->
								{#if highlightInsights.length > 0}
									<div>
										<h3 class="text-sm font-semibold text-charcoal mb-1.5">Highlights</h3>
										<ul class="space-y-1 pl-4">
											{#each highlightInsights as insight}
												<li class="text-sm text-charcoal-soft list-disc">{insight.text}</li>
											{/each}
										</ul>
									</div>
								{/if}
							</div>
						{/if}
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}
