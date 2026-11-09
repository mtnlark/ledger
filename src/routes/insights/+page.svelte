<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import {
		getMonthKey,
		type Transaction,
		type Category,
		type MonthlyBudget,
		type CancelledSubscription,
		type SavingsAccount,
		type SavingsContribution,
		type Settings
	} from '$lib/db';
	import { initializeStorage } from '$lib/storage';
	import {
		getTransactionsByMonth,
		getAvailableMonths,
		getMonthlySpendingTrends,
		getAllTransactions
	} from '$lib/stores/transactions';
	import { getAllCategories } from '$lib/stores/categories';
	import { getBudgetForMonth, getAllBudgets } from '$lib/stores/budget';
	import { getAllSavingsAccounts } from '$lib/stores/savingsAccounts';
	import { getAllContributionsForMonth, getAllContributions } from '$lib/stores/savingsContributions';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import MonthPicker from '$lib/components/MonthPicker.svelte';
	import SmartTakeaways from '$lib/components/insights/SmartTakeaways.svelte';
	import { getForecastPlanning } from '$lib/stores/forecast';
	import { emptyPlanning } from '$lib/planning/types';
	import InsightTabs from '$lib/components/insights/InsightTabs.svelte';
	import VarianceBreakdown from '$lib/components/insights/VarianceBreakdown.svelte';
	import NetWorthOverviewCard from '$lib/components/insights/NetWorthOverviewCard.svelte';
	import NetWorthYearCard from '$lib/components/insights/NetWorthYearCard.svelte';
	import { getAllLinkedAccounts, getAllSnapshots } from '$lib/stores/linkedAccounts';
	import type { LinkedAccount, BalanceSnapshot } from '$lib/db';
	import QuickStatsRow from '$lib/components/insights/QuickStatsRow.svelte';
	import { detectRecurringExpenses, type DetectedRecurring } from '$lib/stores/recurring';
	import { getCancelledSubscriptions, getConfirmedActiveSubscriptions, getSettings } from '$lib/stores/settings';
	import { getEffectiveBudgetsForMonth } from '$lib/stores/categoryBudget';
	import type { RolloverResult } from '$lib/utils/budget-rollover';
	import type { CategoryBudget } from '$lib/db';
	import { format } from 'date-fns';
	import ReportCardModal, { type ReportStat } from '$lib/components/ReportCardModal.svelte';
	import { computeMerchantReport, computeTagReport } from '$lib/utils/report-cards';
	import { formatCurrency } from '$lib/utils/format-helpers';

	// Lazy-loaded chart-heavy components (loaded on tab switch)
	const lazyOverviewCharts = () => Promise.all([
		import('$lib/components/insights/TopCategoriesBar.svelte'),
		import('$lib/components/MonthlyTrendsChart.svelte')
	]);
	const lazySpending = () => Promise.all([
		import('$lib/components/insights/SpendingThisMonth.svelte'),
		import('$lib/components/insights/CategoryDeepDives.svelte'),
		import('$lib/components/insights/NeedsWantsInsights.svelte')
	]);
	const lazySavings = () => import('$lib/components/insights/SavingsInsights.svelte');
	const lazyRecurring = () => import('$lib/components/insights/RecurringInsights.svelte');
	const lazyYearInReview = () => Promise.all([
		import('$lib/components/insights/YTDSummary.svelte'),
		import('$lib/components/insights/TagsYearSummary.svelte')
	]);

	// State
	let isLoading = $state(true);
	let hasLoadedOnce = false;
	let categories = $state<Category[]>([]);
	let selectedMonthTransactions = $state<Transaction[]>([]);
	let allTransactions = $state<Transaction[]>([]);
	let selectedMonth = $state(getMonthKey(new Date()));
	let availableMonths = $state<string[]>([getMonthKey(new Date())]);
	let monthlyTrends = $state<Map<string, number>>(new Map());
	let budget = $state<MonthlyBudget | null>(null);
	let allBudgets = $state<MonthlyBudget[]>([]);
	let recurring = $state<DetectedRecurring[]>([]);
	let cancelledSubscriptions = $state<CancelledSubscription[]>([]);
	let confirmedActiveSubscriptions = $state<string[]>([]);
	let savingsAccounts = $state<SavingsAccount[]>([]);
	let selectedMonthContributions = $state<SavingsContribution[]>([]);
	let allContributions = $state<SavingsContribution[]>([]);
	let appSettings = $state<Settings | null>(null);
	let activeTab = $state('overview');
	let forecastPlanning = $state(emptyPlanning());
	let categoryBudgets = $state<CategoryBudget[]>([]);
	let rolloverAdjustment = $state(0);
	let linkedAccounts = $state<LinkedAccount[]>([]);
	let balanceSnapshots = $state<BalanceSnapshot[]>([]);

	// Derived: fixed recurring amounts as a Map for easy lookup
	let fixedRecurringAmounts = $derived.by(() => {
		const map = new Map<string, number>();
		if (appSettings?.fixedRecurringAmounts) {
			for (const { merchant, amount } of appSettings.fixedRecurringAmounts) {
				map.set(merchant, amount);
			}
		}
		return map;
	});

	// Year in Review follows the selected month's year
	let selectedYear = $derived(Number(selectedMonth.slice(0, 4)));

	// Income per month (for the trends chart's income line)
	let incomeByMonth = $derived(
		new Map(allBudgets.filter((b) => b.income > 0).map((b) => [b.month, b.income]))
	);

	// Cross-links: merchant/tag report cards + deep-dive category jumps
	let merchantReportFor = $state<string | null>(null);
	let tagReportFor = $state<string | null>(null);
	let deepDiveCategoryId = $state<number | null>(null);

	let merchantReport = $derived(
		merchantReportFor ? computeMerchantReport(allTransactions, categories, merchantReportFor) : null
	);
	let merchantReportStats = $derived.by((): ReportStat[] => {
		if (!merchantReport) return [];
		return [
			{ label: 'Total spent', value: formatCurrency(merchantReport.total), sub: 'your share, all time' },
			{ label: 'Visits', value: String(merchantReport.visits) },
			{ label: 'Average per visit', value: formatCurrency(merchantReport.average) },
			{ label: 'Last visit', value: format(merchantReport.lastDate, 'MMM d, yyyy') }
		];
	});
	let tagReport = $derived(
		tagReportFor ? computeTagReport(allTransactions, categories, tagReportFor) : null
	);
	let tagReportStats = $derived.by((): ReportStat[] => {
		if (!tagReport) return [];
		return [
			{ label: 'Total spent', value: formatCurrency(tagReport.total), sub: 'your share, all time' },
			{ label: 'Transactions', value: String(tagReport.count) },
			{ label: 'First used', value: format(tagReport.firstDate, 'MMM d, yyyy') },
			{ label: 'Last used', value: format(tagReport.lastDate, 'MMM d, yyyy') }
		];
	});

	// "What Changed" row click → Spending tab with that category's deep dive open
	function jumpToDeepDive(categoryId: number) {
		deepDiveCategoryId = categoryId;
		handleTabChange('spending');
	}

	// Tab change handler
	function handleTabChange(tab: string) {
		activeTab = tab;
		localStorage.setItem('ledger-insights-tab', tab);
	}

	let requestedMonth = getMonthKey(new Date());
	let refreshGeneration = 0;
	let destroyed = false;
	onDestroy(() => { destroyed = true; refreshGeneration++; });
	async function loadData(month = requestedMonth) {
		requestedMonth = month;
		const generation = ++refreshGeneration;
		const isCurrent = () => !destroyed && generation === refreshGeneration;
		if (!hasLoadedOnce) isLoading = true;
		try {
			await initializeStorage();
			const [categoryList, months, transactions, budgets, cancelled, confirmed, accounts, contributions, settings, txns, monthBudget, monthContributions, effective, linked, snapshots] = await Promise.all([
				getAllCategories(), getAvailableMonths(), getAllTransactions(), getAllBudgets(),
				getCancelledSubscriptions(), getConfirmedActiveSubscriptions(), getAllSavingsAccounts(),
				getAllContributions(), getSettings(), getTransactionsByMonth(month), getBudgetForMonth(month),
				getAllContributionsForMonth(month), getEffectiveBudgetsForMonth(month), getAllLinkedAccounts(), getAllSnapshots()
			]);
			const [patterns, planning, trends] = await Promise.all([
				detectRecurringExpenses(transactions), getForecastPlanning(month, transactions), getMonthlySpendingTrends(months)
			]);
			if (!isCurrent()) return;
			selectedMonth = month; categories = categoryList; availableMonths = months;
			allTransactions = transactions; allBudgets = budgets; recurring = patterns;
			cancelledSubscriptions = cancelled; confirmedActiveSubscriptions = confirmed;
			savingsAccounts = accounts; allContributions = contributions; appSettings = settings;
			forecastPlanning = planning; selectedMonthTransactions = txns; budget = monthBudget;
			selectedMonthContributions = monthContributions; categoryBudgets = effectiveBudgetRows(effective, month);
			rolloverAdjustment = effective.carryoverTotal - effective.deficitCarried;
			monthlyTrends = trends; linkedAccounts = linked; balanceSnapshots = snapshots;
		} catch (error) {
			if (isCurrent()) console.error('Could not refresh insights:', error);
		} finally {
			if (isCurrent()) { isLoading = false; hasLoadedOnce = true; }
		}
	}

	// Mean spending over the last 6 completed months (current month excluded) — runway denominator
	let avgMonthlySpend = $derived.by(() => {
		const currentKey = getMonthKey(new Date());
		const completed = [...monthlyTrends.entries()]
			.filter(([month]) => month < currentKey)
			.sort((a, b) => b[0].localeCompare(a[0]))
			.slice(0, 6);
		if (completed.length === 0) return 0;
		return completed.reduce((sum, [, total]) => sum + total, 0) / completed.length;
	});

	// Present effective budgets (base + rollover) in the CategoryBudget shape that
	// QuickStatsRow / SmartTakeaways consume — they only read budgetAmount.
	function effectiveBudgetRows(result: RolloverResult, month: string): CategoryBudget[] {
		return [...result.byCategory.values()].map((e) => ({
			month,
			categoryId: e.categoryId,
			budgetAmount: e.effective,
			createdAt: new Date(),
			updatedAt: new Date()
		}));
	}

	// Handle month change - update transactions and budget for selected month
	// Fetch data first, then update all state atomically to prevent UI mismatch
	async function handleMonthChange(month: string) {
		await loadData(month);
	}

	async function handleSubscriptionChange() {
		await loadData();
	}

	// Reload data when navigating to this page (handles in-app navigation)
	afterNavigate(() => {
		loadData();
	});

	onMount(() => {
		const validTabs = ['overview', 'spending', 'savings', 'recurring', 'year-in-review'];
		const savedTab = localStorage.getItem('ledger-insights-tab');
		if (savedTab && validTabs.includes(savedTab)) activeTab = savedTab;

		// Reload data when page becomes visible (e.g., switching browser tabs)
		function handleVisibilityChange() {
			if (document.visibilityState === 'visible' && !isLoading) {
				loadData();
			}
		}

		document.addEventListener('visibilitychange', handleVisibilityChange);
		const refresh = () => void loadData();
		window.addEventListener('ledger:transactions-changed', refresh);

		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			window.removeEventListener('ledger:transactions-changed', refresh);
		};
	});
</script>

<svelte:head>
	<title>Insights - Ledger</title>
</svelte:head>

<div class="min-h-screen">
	<!-- Main Content -->
	<main class="max-w-6xl mx-auto px-6 py-6 space-y-6" aria-live="polite">
		<!-- Title + month picker -->
		<div class="flex items-center justify-between">
			<h1 class="font-display text-2xl font-medium text-charcoal">Insights</h1>
			{#if !isLoading && activeTab !== 'recurring'}
				<MonthPicker
					currentMonth={selectedMonth}
					{availableMonths}
					onMonthChange={handleMonthChange}
				/>
			{/if}
		</div>
		{#if isLoading}
			<!-- Loading skeletons -->
			{#each Array(3) as _, index (index)}
				<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
					<div class="px-6 py-4 flex items-center justify-between">
						<div>
							<Skeleton class="h-6 mb-2" width="180px" rounded="sm" />
							<Skeleton class="h-4" width="120px" rounded="sm" />
						</div>
						<Skeleton class="w-5 h-5" rounded="sm" />
					</div>
					<div class="px-6 pb-4">
						<Skeleton class="h-16 w-full" rounded="lg" />
					</div>
				</div>
			{/each}
		{:else}
			<!-- Tab Navigation -->
			<InsightTabs {activeTab} onTabChange={handleTabChange} />

			{#snippet tabLoading()}
				<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] p-6">
					<Skeleton class="h-6 mb-4" width="180px" rounded="sm" />
					<Skeleton class="h-40 w-full" rounded="lg" />
				</div>
			{/snippet}

			<!-- Tab Content -->
			<div id="insights-tabpanel" role="tabpanel" class="space-y-6">
				{#if activeTab === 'overview'}
					<SmartTakeaways
						{forecastPlanning}
						currentMonthTransactions={selectedMonthTransactions}
						{allTransactions}
						{categories}
						{availableMonths}
						{budget}
						{selectedMonth}
						contributions={selectedMonthContributions}
						{allContributions}
						{allBudgets}
						settings={appSettings}
						{rolloverAdjustment}
						{categoryBudgets}
					/>
					<QuickStatsRow
						transactions={selectedMonthTransactions}
						{selectedMonth}
						{categoryBudgets}
						{budget}
						contributions={selectedMonthContributions}
					/>

					<!-- Why is this month different? -->
					<VarianceBreakdown
						transactions={allTransactions}
						{categories}
						{selectedMonth}
						onCategoryClick={jumpToDeepDive}
					/>

					<!-- Actual wealth: net worth, monthly delta, runway -->
					<NetWorthOverviewCard
						accounts={linkedAccounts}
						snapshots={balanceSnapshots}
						{selectedMonth}
						{avgMonthlySpend}
					/>

					<!-- Lazy-loaded chart components for overview tab -->
					{#await lazyOverviewCharts()}
						{@render tabLoading()}
					{:then [TopCategoriesBarMod, MonthlyTrendsChartMod]}
						<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
						<!-- Where It Goes - Top Categories -->
						{#if selectedMonthTransactions.length > 0}
							<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
								<div class="px-6 py-4">
									<h2 class="font-display text-xl font-medium text-charcoal">Where It Goes</h2>
									<p class="text-sm text-charcoal-muted mt-0.5">Top spending categories</p>
								</div>
								<div class="px-6 pb-6">
									<TopCategoriesBarMod.default
										transactions={selectedMonthTransactions}
										{categories}
									/>
								</div>
							</div>
						{/if}

						<!-- Monthly Trends (component renders its own card) -->
						{#if monthlyTrends.size > 1}
							<MonthlyTrendsChartMod.default monthlyData={monthlyTrends} {incomeByMonth} />
						{/if}
						</div>
					{/await}

				{:else if activeTab === 'spending'}
					{#await lazySpending()}
						{@render tabLoading()}
					{:then [SpendingThisMonthMod, CategoryDeepDivesMod, NeedsWantsInsightsMod]}
						<SpendingThisMonthMod.default
							currentMonth={selectedMonth}
							transactions={selectedMonthTransactions}
							{budget}
							{allBudgets}
							{monthlyTrends}
							onMerchantClick={(m: string) => merchantReportFor = m}
						/>
						<CategoryDeepDivesMod.default currentMonth={selectedMonth} transactions={selectedMonthTransactions} {allTransactions} {categories} {availableMonths} initialCategoryId={deepDiveCategoryId} />
						<NeedsWantsInsightsMod.default
							transactions={selectedMonthTransactions}
							{categories}
							{allTransactions}
						/>
					{/await}

				{:else if activeTab === 'savings'}
					{#await lazySavings()}
						{@render tabLoading()}
					{:then SavingsInsightsMod}
						<SavingsInsightsMod.default
							currentMonth={selectedMonth}
							contributions={selectedMonthContributions}
							accounts={savingsAccounts}
							{budget}
							{allContributions}
							{allBudgets}
						/>
					{/await}

				{:else if activeTab === 'recurring'}
					{#await lazyRecurring()}
						{@render tabLoading()}
					{:then RecurringInsightsMod}
						<RecurringInsightsMod.default
							{recurring}
							{categories}
							{allTransactions}
							{cancelledSubscriptions}
							{confirmedActiveSubscriptions}
							{fixedRecurringAmounts}
							onDismiss={async () => {
								recurring = await detectRecurringExpenses();
								appSettings = await getSettings(); // Refresh fixed amounts
							}}
							onSubscriptionChange={handleSubscriptionChange}
						/>
					{/await}

				{:else if activeTab === 'year-in-review'}
					{#await lazyYearInReview()}
						{@render tabLoading()}
					{:then [YTDSummaryMod, TagsYearSummaryMod]}
						<YTDSummaryMod.default transactions={allTransactions} settings={appSettings} year={selectedYear} onMerchantClick={(m: string) => merchantReportFor = m} />
						<NetWorthYearCard accounts={linkedAccounts} snapshots={balanceSnapshots} year={selectedYear} />
						<TagsYearSummaryMod.default transactions={allTransactions} year={selectedYear} onTagClick={(t: string) => tagReportFor = t} />
					{/await}
				{/if}
			</div>
		{/if}
	</main>
</div>

<!-- Merchant / Tag report cards -->
{#if merchantReport}
	<ReportCardModal
		isOpen={true}
		title={merchantReport.merchant}
		stats={merchantReportStats}
		monthly={merchantReport.monthly}
		topCategories={merchantReport.topCategories}
		onClose={() => merchantReportFor = null}
	/>
{/if}
{#if tagReport}
	<ReportCardModal
		isOpen={true}
		title={'#' + tagReport.tag}
		stats={tagReportStats}
		monthly={tagReport.monthly}
		topCategories={tagReport.topCategories}
		onClose={() => tagReportFor = null}
	/>
{/if}
