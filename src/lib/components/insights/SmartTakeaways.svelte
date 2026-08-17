<script lang="ts">
	import { TrendingUp, TrendingDown, AlertTriangle, Gauge, Receipt, Store, BarChart3, PiggyBank, ChevronDown, ChevronUp, Trophy, Flame, PartyPopper } from 'lucide-svelte';
	import { getMonthKey, navigateMonth, parseMonthKey } from '$lib/db';
	import { CONTRIBUTION_SOURCES, type Transaction, type Category, type MonthlyBudget, type SavingsContribution, type CompletedGoal, type Settings, type CategoryBudget } from '$lib/db';
	import { config } from '$lib/config';
	import { getInsightsEngine } from '$lib/insights';
	import { computeStdDev } from '$lib/insights/calculations/stats';
	import { computeSavingsReview } from '$lib/insights/calculations/month-review';
	import { formatCurrency, formatPercentage } from '$lib/utils/format-helpers';
	import { filterUpToDate } from '$lib/utils/date-helpers';
	import { getBudgetStatus } from '$lib/utils/budget-status';
	import { sumCurrency, roundCurrency } from '$lib/utils/currency';
	import { getUserAmount } from '$lib/insights/calculations/spending';
	import { groupTransactionsIntoPurchases } from '$lib/utils/transaction-grouping';

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
		// Settings for completed goals
		settings?: Settings | null;
		// Category budgets for budget context
		categoryBudgets?: CategoryBudget[];
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
		allBudgets = [],
		settings = null,
		categoryBudgets = []
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

	// Anomaly and category-shift detection live in the "What Changed" card
	// (VarianceBreakdown) on the Overview tab — not duplicated here.

	// Transactions up to today (excludes future-dated recurring entries) for pace calculations
	let pastTransactions = $derived(isCurrentMonth ? filterUpToDate(currentMonthTransactions) : []);

	// Calculate savings that affect available (bank_transfer and other sources only)
	let savedFromContributions = $derived.by(() => {
		const affectingAvailable = contributions.filter(
			(c) => CONTRIBUTION_SOURCES[c.source]?.affectsAvailable
		);
		return sumCurrency(affectingAvailable.map((c) => c.amount));
	});

	// Calculate pace projection (only meaningful for current month)
	let paceProjection = $derived.by(() => {
		if (!isCurrentMonth) return null;
		const today = new Date();
		const currentDay = today.getDate();
		const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
		const totalSpent = engine.getTotalSpent(pastTransactions, `${selectedMonth}-past`);
		return engine.getPaceProjection(totalSpent, budget, savedFromContributions, currentDay, daysInMonth, config.insights.pace.minMonthFraction, selectedMonth);
	});

	// Get previous month for comparison
	let previousMonthKey = $derived(navigateMonth(selectedMonth, -1));

	// Fallback: Needs vs wants ratio (current month only)
	let needsVsWants = $derived.by(() => {
		if (!isCurrentMonth) return null;
		return engine.getNeedsVsWants(currentMonthTransactions, categories, selectedMonth);
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
		const currentTotal = engine.getTotalSpent(pastTransactions, `${selectedMonth}-past`);

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

	// --- Budget context for month review ---

	let budgetSummary = $derived.by(() => {
		if (categoryBudgets.length === 0) return null;

		// Compute spending by category for this month
		const spendingByCategory = new Map<number, number>();
		for (const t of currentMonthTransactions) {
			const amount = getUserAmount(t);
			spendingByCategory.set(t.categoryId, (spendingByCategory.get(t.categoryId) || 0) + amount);
		}

		let overCount = 0;
		let totalBudgeted = 0;
		let totalSpentInBudgeted = 0;

		for (const cb of categoryBudgets) {
			if (cb.budgetAmount <= 0) continue;
			totalBudgeted += cb.budgetAmount;
			const spent = spendingByCategory.get(cb.categoryId) || 0;
			totalSpentInBudgeted += spent;
			const status = getBudgetStatus(spent, cb.budgetAmount);
			if (status.status === 'over') overCount++;
		}

		const budgetedCount = categoryBudgets.filter((cb) => cb.budgetAmount > 0).length;
		if (budgetedCount === 0) return null;

		const overallDiff = roundCurrency(totalSpentInBudgeted - totalBudgeted);

		return { overCount, budgetedCount, overallDiff };
	});

	// --- Retrospective mode: Hero stat and grouped insights ---

	// Compute total spent for the month
	let totalSpent = $derived(engine.getTotalSpent(currentMonthTransactions, selectedMonth));
	let transactionCount = $derived(groupTransactionsIntoPurchases(currentMonthTransactions).length);

	// Get goals completed this month
	let goalsCompletedThisMonth = $derived.by(() => {
		if (!settings?.completedGoals) return [] as CompletedGoal[];
		return settings.completedGoals.filter((g) => g.completedDate.startsWith(selectedMonth));
	});

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

		// Priority 1.5: Goal completions (emotionally significant)
		if (goalsCompletedThisMonth.length > 0) {
			if (goalsCompletedThisMonth.length === 1) {
				const goal = goalsCompletedThisMonth[0];
				return {
					type: 'goalCompleted' as const,
					icon: PartyPopper,
					iconColor: 'text-success-500',
					headline: `Reached your ${goal.accountName} goal!`,
					subtext: `${formatCurrency(goal.targetAmount)} target achieved`
				};
			}
			return {
				type: 'goalCompleted' as const,
				icon: PartyPopper,
				iconColor: 'text-success-500',
				headline: `Reached ${goalsCompletedThisMonth.length} savings goals!`,
				subtext: goalsCompletedThisMonth.map((g) => g.accountName).join(', ')
			};
		}

		// Priority 2: Highest savings month
		if (savingsReview?.isHighestMonth && savingsReview.totalSaved > 0) {
			return {
				type: 'savingsHighest' as const,
				icon: Trophy,
				iconColor: 'text-success-500',
				headline: 'Your highest savings month!',
				subtext: `${formatCurrency(savingsReview.totalSaved)} saved${savingsReview.savingsRate !== null ? ` · ${formatPercentage(savingsReview.savingsRate)} savings rate` : ''}`
			};
		}

		// Priority 3: Significant vs-average (spending)
		if (monthReview?.vsAverage && monthReview.vsAverage.percentDiff >= 15) {
			const { percentDiff, isAbove, weightedMean, sampleSize } = monthReview.vsAverage;
			const sampleNote = sampleSize >= 2 ? ` · based on ${sampleSize} months` : '';
			return {
				type: 'vsAverage' as const,
				icon: isAbove ? TrendingUp : TrendingDown,
				iconColor: isAbove ? 'text-warning-500' : 'text-success-500',
				headline: `${percentDiff}% ${isAbove ? 'above' : 'below'} your typical month`,
				subtext: `${formatCurrency(totalSpent)} total · typical ${formatCurrency(Math.round(weightedMean))}${sampleNote}`
			};
		}

		// Priority 4: Historical rank (top/bottom quartile, meaningful sample)
		if (monthReview?.historicalRank && monthReview.historicalRank.total >= 4) {
			const { rank, total, direction } = monthReview.historicalRank;
			const quartile = Math.ceil(total / 4);
			if (rank <= quartile) {
				return {
					type: 'rank' as const,
					icon: BarChart3,
					iconColor: direction === 'lowest' ? 'text-success-500' : 'text-warning-500',
					headline: `Your ${getOrdinal(rank)} ${direction} spending month`,
					subtext: `${formatCurrency(totalSpent)} total · out of ${total} months`
				};
			}
		}

		// Priority 5: Savings above average rate
		if (savingsReview?.vsAverage) {
			const ratePercent = savingsReview.savingsRate !== null ? Math.round(savingsReview.savingsRate * 100) : null;
			return {
				type: 'savingsAboveAvg' as const,
				icon: PiggyBank,
				iconColor: 'text-success-500',
				headline: ratePercent !== null
					? `${ratePercent}% savings rate · ${savingsReview.vsAverage.percentDiff}% above average`
					: `Saved ${savingsReview.vsAverage.percentDiff}% more than usual`,
				subtext: `${formatCurrency(savingsReview.totalSaved)} saved this month`
			};
		}

		// Priority 6: Category standout (notable category change)
		if (monthReview?.categoryStandout && monthReview.categoryStandout.diff >= 50) {
			const { name, diff, isIncrease } = monthReview.categoryStandout;
			return {
				type: 'categoryStandout' as const,
				icon: isIncrease ? TrendingUp : TrendingDown,
				iconColor: isIncrease ? 'text-warning-500' : 'text-success-500',
				headline: `${name} ${isIncrease ? 'up' : 'down'} ${formatCurrency(diff)}`,
				subtext: `Biggest category change from prior month`
			};
		}

		// Fallback: Just show the total
		return {
			type: 'total' as const,
			icon: BarChart3,
			iconColor: 'text-charcoal-muted',
			headline: `${formatCurrency(totalSpent)} spent`,
			subtext: `${transactionCount} transaction${transactionCount !== 1 ? 's' : ''}`
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
			const { percentDiff, isAbove, weightedMean, sampleSize } = monthReview.vsAverage;
			const sampleNote = sampleSize >= 2 ? ` · based on ${sampleSize} months` : '';
			items.push({ text: `${percentDiff}% ${isAbove ? 'above' : 'below'} your typical month (${formatCurrency(totalSpent)} vs ${formatCurrency(Math.round(weightedMean))} avg${sampleNote})` });
		}

		// Category standout (if not already hero)
		if (monthReview.categoryStandout && heroStat?.type !== 'categoryStandout') {
			const { name, diff, isIncrease } = monthReview.categoryStandout;
			items.push({ text: `${name} ${isIncrease ? 'up' : 'down'} ${formatCurrency(diff)} from prior month` });
		}

		// Budget context
		if (budgetSummary) {
			const { overCount, budgetedCount, overallDiff } = budgetSummary;
			if (overCount > 0) {
				items.push({ text: `${overCount} of ${budgetedCount} budgeted categories over budget · ${formatCurrency(Math.abs(overallDiff))} over overall` });
			} else {
				items.push({ text: `All ${budgetedCount} budgeted categories within budget` });
			}
		}

		return items;
	});

	let savingsInsights = $derived.by(() => {
		if (isCurrentMonth || !savingsReview) return [] as GroupedInsight[];
		const items: GroupedInsight[] = [];

		// Skip if already hero
		if (heroStat?.type === 'savingsHighest' || heroStat?.type === 'savingsAboveAvg') return items;

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

		// Goals completed this month (skip if already hero)
		if (heroStat?.type !== 'goalCompleted') {
			for (const goal of goalsCompletedThisMonth) {
				items.push({ text: `🎉 Reached ${goal.accountName} goal!` });
			}
		}

		// Biggest purchase
		if (monthReview.biggestPurchase) {
			const { merchant, amount } = monthReview.biggestPurchase;
			items.push({ text: `Biggest purchase: ${formatCurrency(amount)} at ${merchant}` });
		}

		// Most visited merchant (with spending total)
		if (monthReview.mostVisitedMerchant) {
			const { merchant, count, totalSpent: merchantTotal } = monthReview.mostVisitedMerchant;
			items.push({ text: `Most visited: ${merchant} (${count} times, ${formatCurrency(merchantTotal)})` });
		}

		// Needs vs Wants (only show when skewed > 75% or < 25%)
		if (monthReview.needsPercent !== null) {
			if (monthReview.needsPercent > 75) {
				items.push({ text: `Mostly essentials: ${monthReview.needsPercent}% needs, ${100 - monthReview.needsPercent}% wants` });
			} else if (monthReview.needsPercent < 25) {
				items.push({ text: `Mostly discretionary: ${monthReview.needsPercent}% needs, ${100 - monthReview.needsPercent}% wants` });
			}
		}

		return items;
	});

	// Check if there are any grouped insights to show
	let hasGroupedInsights = $derived(
		spendingInsights.length > 0 || savingsInsights.length > 0 || highlightInsights.length > 0
	);

	// Build takeaways list (for current month / Highlights mode only)
	interface Takeaway {
		type: 'pace' | 'needsWants' | 'monthComparison' | 'topMerchant' | 'savingsHighest' | 'savingsAboveAvg' | 'goalCompleted';
		icon: typeof AlertTriangle;
		iconColor: string;
		text: string;
	}

	let takeaways = $derived.by(() => {
		if (!isCurrentMonth) return [] as Takeaway[];

		const items: Takeaway[] = [];
		const maxCount = config.insights.takeaways.maxCount;

		// Add goal completions first (highest priority - celebration!)
		for (const goal of goalsCompletedThisMonth) {
			items.push({
				type: 'goalCompleted',
				icon: PartyPopper,
				iconColor: 'text-success-500',
				text: `You reached your ${goal.accountName} goal!`
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
	<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
		<div class="px-6 py-4">
			<h2 class="font-display text-xl font-medium text-charcoal mb-3">{title}</h2>

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
							class="flex items-center gap-1 text-sm text-primary-600 font-medium px-3 py-1 rounded-full bg-surface-alt hover:bg-cream-dark transition-colors"
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
