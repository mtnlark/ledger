<script lang="ts">
	import { onMount } from 'svelte';
	import { format } from 'date-fns';
	import {
		getMonthKey,
		parseMonthKey,
		type Transaction,
		type Category,
		type MonthlyBudget,
		type CancelledSubscription
	} from '$lib/db';
	import { initializeStorage } from '$lib/storage';
	import {
		getTransactionsByMonth,
		getAvailableMonths,
		getMonthlySpendingTrends,
		getAllTransactions,
		getDailySpending
	} from '$lib/stores/transactions';
	import { getAllCategories } from '$lib/stores/categories';
	import { getBudgetForMonth, getAllBudgets } from '$lib/stores/budget';
	import { getSelectedMonth, setSelectedMonth } from '$lib/stores/selectedMonth';
	import HeaderNav from '$lib/components/HeaderNav.svelte';
	import MonthPicker from '$lib/components/MonthPicker.svelte';
	import CategoryBreakdownChart from '$lib/components/CategoryBreakdownChart.svelte';
	import MonthlyTrendsChart from '$lib/components/MonthlyTrendsChart.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import InsightGroup from '$lib/components/insights/InsightGroup.svelte';
	import CategoryDeepDives from '$lib/components/insights/CategoryDeepDives.svelte';
	import PredictiveInsights from '$lib/components/insights/PredictiveInsights.svelte';
	import YTDSummary from '$lib/components/insights/YTDSummary.svelte';
	import RecurringInsights from '$lib/components/insights/RecurringInsights.svelte';
	import NeedsWantsInsights from '$lib/components/insights/NeedsWantsInsights.svelte';
	import { detectRecurringExpenses, type DetectedRecurring } from '$lib/stores/recurring';
	import { getCancelledSubscriptions, getConfirmedActiveSubscriptions } from '$lib/stores/settings';

	// State
	let isLoading = $state(true);
	let categories = $state<Category[]>([]);
	let transactions = $state<Transaction[]>([]);
	let allTransactions = $state<Transaction[]>([]);
	let currentMonth = $state(getMonthKey(new Date()));
	let availableMonths = $state<string[]>([getMonthKey(new Date())]);
	let monthlyTrends = $state<Map<string, number>>(new Map());
	let dailySpending = $state<{ day: number; amount: number; cumulative: number }[]>([]);
	let budget = $state<MonthlyBudget | null>(null);
	let allBudgets = $state<MonthlyBudget[]>([]);
	let recurring = $state<DetectedRecurring[]>([]);
	let cancelledSubscriptions = $state<CancelledSubscription[]>([]);
	let confirmedActiveSubscriptions = $state<string[]>([]);

	// Computed
	let monthDisplay = $derived(format(parseMonthKey(currentMonth), 'MMMM yyyy'));

	// Load data
	async function loadData() {
		isLoading = true;
		try {
			await initializeStorage();
			// Restore selected month from localStorage
			currentMonth = getSelectedMonth();
			categories = await getAllCategories();
			availableMonths = await getAvailableMonths();
			allTransactions = await getAllTransactions();
			allBudgets = await getAllBudgets();
			recurring = await detectRecurringExpenses();
			cancelledSubscriptions = await getCancelledSubscriptions();
			confirmedActiveSubscriptions = await getConfirmedActiveSubscriptions();
			await loadMonthData();
			// Get trends for all available months
			monthlyTrends = await getMonthlySpendingTrends(availableMonths);
		} catch (error) {
			console.error('Failed to load data:', error);
		} finally {
			isLoading = false;
		}
	}

	// Reload subscription-related data when subscriptions change
	async function handleSubscriptionChange() {
		cancelledSubscriptions = await getCancelledSubscriptions();
		confirmedActiveSubscriptions = await getConfirmedActiveSubscriptions();
	}

	// Load month-specific data
	async function loadMonthData() {
		transactions = await getTransactionsByMonth(currentMonth);
		dailySpending = await getDailySpending(currentMonth);
		budget = await getBudgetForMonth(currentMonth);
	}

	// Handle month change
	function handleMonthChange(month: string) {
		currentMonth = month;
		setSelectedMonth(month);
		loadMonthData();
	}

	onMount(() => {
		loadData();
	});
</script>

<svelte:head>
	<title>Insights - Ledger</title>
</svelte:head>

<div class="min-h-screen">
	<!-- Header -->
	<HeaderNav title="Insights" showBack={true}>
		<MonthPicker {currentMonth} {availableMonths} onMonthChange={handleMonthChange} />
	</HeaderNav>

	<!-- Main Content -->
	<main class="max-w-4xl mx-auto px-4 py-6 space-y-6">
		{#if isLoading}
			<!-- Loading skeletons -->
			{#each Array(3) as _}
				<div class="bg-white rounded-xl shadow-md shadow-gray-200/50 overflow-hidden">
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
			<!-- Monthly Overview (existing charts, default expanded) -->
			<InsightGroup
				title="Monthly Overview"
				description={monthDisplay}
				defaultExpanded={true}
			>
				{#snippet preview()}
					{@const totalSpent = transactions.reduce(
						(sum, t) => sum + (t.isShared ? t.amount - t.partnerShare : t.amount),
						0
					)}
					<div class="flex items-center justify-between">
						<div>
							<p class="font-mono text-2xl font-medium text-charcoal">${totalSpent.toLocaleString()}</p>
							<p class="text-sm text-charcoal-muted">Total spent this month</p>
						</div>
						<div class="text-right">
							<p class="font-mono text-lg font-medium text-charcoal">{transactions.length}</p>
							<p class="text-sm text-charcoal-muted">transactions</p>
						</div>
					</div>
				{/snippet}

				{#snippet children()}
					<div class="space-y-6">
						<!-- Category Breakdown -->
						<CategoryBreakdownChart {transactions} {categories} />

						<!-- Monthly Trends -->
						<MonthlyTrendsChart monthlyData={monthlyTrends} />

						<!-- Quick Stats -->
						{#if transactions.length > 0}
							{@const totalSpent = transactions.reduce(
								(sum, t) => sum + (t.isShared ? t.amount - t.partnerShare : t.amount),
								0
							)}
							{@const sharedCount = transactions.filter((t) => t.isShared).length}
							{@const avgTransaction = totalSpent / transactions.length}
							{@const uniqueCategories = new Set(transactions.map((t) => t.categoryId)).size}
							<div class="bg-cream-dark rounded-lg p-4 border border-dashed border-gray-200">
								<h3 class="text-sm font-medium text-charcoal-soft mb-3">Quick Stats</h3>
								<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
									<div class="text-center">
										<p class="font-mono text-xl font-medium text-charcoal">{transactions.length}</p>
										<p class="text-xs text-charcoal-muted">Transactions</p>
									</div>
									<div class="text-center">
										<p class="font-mono text-xl font-medium text-charcoal">${avgTransaction.toFixed(0)}</p>
										<p class="text-xs text-charcoal-muted">Avg Transaction</p>
									</div>
									<div class="text-center">
										<p class="font-mono text-xl font-medium text-charcoal">{sharedCount}</p>
										<p class="text-xs text-charcoal-muted">Shared</p>
									</div>
									<div class="text-center">
										<p class="font-mono text-xl font-medium text-charcoal">{uniqueCategories}</p>
										<p class="text-xs text-charcoal-muted">Categories</p>
									</div>
								</div>
							</div>
						{/if}
					</div>
				{/snippet}
			</InsightGroup>

			<!-- Category Deep Dives -->
			<CategoryDeepDives {currentMonth} {transactions} {categories} {availableMonths} />

			<!-- Predictive Insights -->
			<PredictiveInsights {currentMonth} {dailySpending} {budget} {allBudgets} />

			<!-- Recurring Expenses (subscriptions + auto-detected bills) -->
			<RecurringInsights
				{recurring}
				{categories}
				{allTransactions}
				{cancelledSubscriptions}
				{confirmedActiveSubscriptions}
				onDismiss={async () => { recurring = await detectRecurringExpenses(); }}
				onSubscriptionChange={handleSubscriptionChange}
			/>

			<!-- Needs vs Wants -->
			<NeedsWantsInsights {transactions} {categories} {allTransactions} />

			<!-- Year-to-Date Summary -->
			<YTDSummary transactions={allTransactions} {categories} />
		{/if}
	</main>
</div>
