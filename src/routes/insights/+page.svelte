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
		type SavingsContribution
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
	import SpendingThisMonth from '$lib/components/insights/SpendingThisMonth.svelte';
	import SavingsInsights from '$lib/components/insights/SavingsInsights.svelte';
	import CategoryDeepDives from '$lib/components/insights/CategoryDeepDives.svelte';
	import YTDSummary from '$lib/components/insights/YTDSummary.svelte';
	import RecurringInsights from '$lib/components/insights/RecurringInsights.svelte';
	import { detectRecurringExpenses, type DetectedRecurring } from '$lib/stores/recurring';
	import { getCancelledSubscriptions, getConfirmedActiveSubscriptions } from '$lib/stores/settings';

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
			// Load selected month data
			selectedMonthTransactions = await getTransactionsByMonth(selectedMonth);
			budget = await getBudgetForMonth(selectedMonth);
			selectedMonthContributions = await getAllContributionsForMonth(selectedMonth);
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
		const [txns, monthBudget, monthContributions] = await Promise.all([
			getTransactionsByMonth(month),
			getBudgetForMonth(month),
			getAllContributionsForMonth(month)
		]);
		selectedMonth = month;
		selectedMonthTransactions = txns;
		budget = monthBudget;
		selectedMonthContributions = monthContributions;
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

			<!-- Smart Takeaways (always visible at top) -->
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
			/>

			<!-- Spending This Month -->
			<SpendingThisMonth
				currentMonth={selectedMonth}
				transactions={selectedMonthTransactions}
				{budget}
				{allBudgets}
				{monthlyTrends}
			/>

			<!-- Savings This Month -->
			<SavingsInsights
				currentMonth={selectedMonth}
				contributions={selectedMonthContributions}
				accounts={savingsAccounts}
				{budget}
				{allContributions}
				{allBudgets}
			/>

			<!-- Category Deep Dives -->
			<CategoryDeepDives currentMonth={selectedMonth} transactions={selectedMonthTransactions} {allTransactions} {categories} {availableMonths} />

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

			<!-- Year in Review -->
			<YTDSummary transactions={allTransactions} />
		{/if}
	</main>
</div>
