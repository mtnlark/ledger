<script lang="ts">
	import { onMount } from 'svelte';
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
	import HeaderNav from '$lib/components/HeaderNav.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import MonthPicker from '$lib/components/MonthPicker.svelte';
	import SmartTakeaways from '$lib/components/insights/SmartTakeaways.svelte';
	import InsightTabs from '$lib/components/insights/InsightTabs.svelte';
	import QuickStatsRow from '$lib/components/insights/QuickStatsRow.svelte';
	import { detectRecurringExpenses, type DetectedRecurring } from '$lib/stores/recurring';
	import { getCancelledSubscriptions, getConfirmedActiveSubscriptions, getSettings } from '$lib/stores/settings';
	import { getCategoryBudgetsForMonth } from '$lib/stores/categoryBudget';
	import type { CategoryBudget } from '$lib/db';

	// Lazy-loaded chart-heavy components (loaded on tab switch)
	const lazyOverviewCharts = () => Promise.all([
		import('$lib/components/CategoryBreakdownChart.svelte'),
		import('$lib/components/MonthlyTrendsChart.svelte')
	]);
	const lazySpending = () => Promise.all([
		import('$lib/components/insights/SpendingThisMonth.svelte'),
		import('$lib/components/insights/CategoryDeepDives.svelte')
	]);
	const lazySavings = () => import('$lib/components/insights/SavingsInsights.svelte');
	const lazyRecurring = () => import('$lib/components/insights/RecurringInsights.svelte');
	const lazyYearInReview = () => Promise.all([
		import('$lib/components/insights/YTDSummary.svelte'),
		import('$lib/components/insights/NeedsWantsInsights.svelte')
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
	let categoryBudgets = $state<CategoryBudget[]>([]);

	// Tab change handler
	function handleTabChange(tab: string) {
		activeTab = tab;
		localStorage.setItem('ledger-insights-tab', tab);
	}

	// Load data
	async function loadData() {
		if (!hasLoadedOnce) isLoading = true;
		try {
			await initializeStorage();
			selectedMonth = getMonthKey(new Date());
			categories = await getAllCategories();
			availableMonths = await getAvailableMonths();
			allTransactions = await getAllTransactions();
			allBudgets = await getAllBudgets();
			recurring = await detectRecurringExpenses();
			cancelledSubscriptions = await getCancelledSubscriptions();
			confirmedActiveSubscriptions = await getConfirmedActiveSubscriptions();
			// Load savings data
			savingsAccounts = await getAllSavingsAccounts();
			allContributions = await getAllContributions();
			// Load settings for completed goals
			appSettings = await getSettings();
			// Load selected month data
			selectedMonthTransactions = await getTransactionsByMonth(selectedMonth);
			budget = await getBudgetForMonth(selectedMonth);
			selectedMonthContributions = await getAllContributionsForMonth(selectedMonth);
			categoryBudgets = await getCategoryBudgetsForMonth(selectedMonth);
			// Get trends for all available months
			monthlyTrends = await getMonthlySpendingTrends(availableMonths);
		} catch (error) {
			console.error('Failed to load data:', error);
		} finally {
			isLoading = false;
			hasLoadedOnce = true;
		}
	}

	// Handle month change - update transactions and budget for selected month
	// Fetch data first, then update all state atomically to prevent UI mismatch
	async function handleMonthChange(month: string) {
		const [txns, monthBudget, monthContributions, monthCategoryBudgets] = await Promise.all([
			getTransactionsByMonth(month),
			getBudgetForMonth(month),
			getAllContributionsForMonth(month),
			getCategoryBudgetsForMonth(month)
		]);
		selectedMonth = month;
		selectedMonthTransactions = txns;
		budget = monthBudget;
		selectedMonthContributions = monthContributions;
		categoryBudgets = monthCategoryBudgets;
	}

	// Reload subscription-related data when subscriptions change
	async function handleSubscriptionChange() {
		cancelledSubscriptions = await getCancelledSubscriptions();
		confirmedActiveSubscriptions = await getConfirmedActiveSubscriptions();
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

		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	});
</script>

<svelte:head>
	<title>Insights - Ledger</title>
</svelte:head>

<div class="min-h-screen">
	<!-- Header -->
	<HeaderNav title="Insights" showBack={true} />

	<!-- Main Content -->
	<main class="max-w-4xl mx-auto px-4 py-6 space-y-6" aria-live="polite">
		{#if isLoading}
			<!-- Loading skeletons -->
			{#each Array(3) as _}
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
			<!-- Page-level Month Picker -->
			<div class="flex justify-end">
				<MonthPicker
					currentMonth={selectedMonth}
					{availableMonths}
					onMonthChange={handleMonthChange}
				/>
			</div>

			<!-- Tab Navigation -->
			<InsightTabs {activeTab} onTabChange={handleTabChange} />

			<!-- Tab Content -->
			<div id="insights-tabpanel" role="tabpanel" class="space-y-6">
				{#if activeTab === 'overview'}
					<SmartTakeaways
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
					/>
					<QuickStatsRow
						transactions={selectedMonthTransactions}
						{selectedMonth}
						{categoryBudgets}
						{budget}
						contributions={selectedMonthContributions}
					/>

					<!-- Lazy-loaded chart components for overview tab -->
					{#await lazyOverviewCharts() then [CategoryBreakdownChartMod, MonthlyTrendsChartMod]}
						<!-- Category Breakdown -->
						{#if selectedMonthTransactions.length > 0}
							<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
								<div class="px-6 py-4">
									<h2 class="font-display text-xl font-medium text-charcoal">Where It Goes</h2>
									<p class="text-sm text-charcoal-muted mt-0.5">Spending by category</p>
								</div>
								<div class="px-6 pb-6">
									<CategoryBreakdownChartMod.default transactions={selectedMonthTransactions} {categories} />
								</div>
							</div>
						{/if}

						<!-- Monthly Trends -->
						{#if monthlyTrends.size > 1}
							<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
								<div class="px-6 py-4">
									<h2 class="font-display text-xl font-medium text-charcoal">Monthly Trends</h2>
									<p class="text-sm text-charcoal-muted mt-0.5">Spending over time</p>
								</div>
								<div class="px-6 pb-6">
									<MonthlyTrendsChartMod.default monthlyData={monthlyTrends} />
								</div>
							</div>
						{/if}
					{/await}

				{:else if activeTab === 'spending'}
					{#await lazySpending() then [SpendingThisMonthMod, CategoryDeepDivesMod]}
						<SpendingThisMonthMod.default
							currentMonth={selectedMonth}
							transactions={selectedMonthTransactions}
							{budget}
							{allBudgets}
							{monthlyTrends}
						/>
						<CategoryDeepDivesMod.default currentMonth={selectedMonth} transactions={selectedMonthTransactions} {allTransactions} {categories} {availableMonths} />
					{/await}

				{:else if activeTab === 'savings'}
					{#await lazySavings() then SavingsInsightsMod}
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
					{#await lazyRecurring() then RecurringInsightsMod}
						<RecurringInsightsMod.default
							{recurring}
							{categories}
							{allTransactions}
							{cancelledSubscriptions}
							{confirmedActiveSubscriptions}
							onDismiss={async () => { recurring = await detectRecurringExpenses(); }}
							onSubscriptionChange={handleSubscriptionChange}
						/>
					{/await}

				{:else if activeTab === 'year-in-review'}
					{#await lazyYearInReview() then [YTDSummaryMod, NeedsWantsInsightsMod]}
						<YTDSummaryMod.default transactions={allTransactions} {categories} settings={appSettings} />
						<NeedsWantsInsightsMod.default
							transactions={selectedMonthTransactions}
							{categories}
							{allTransactions}
						/>
					{/await}
				{/if}
			</div>
		{/if}
	</main>
</div>
