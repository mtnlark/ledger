<script lang="ts">
	import { onMount } from 'svelte';
	import { format } from 'date-fns';
	import { initializeDatabase, getMonthKey, parseMonthKey, type Transaction, type Category } from '$lib/db';
	import { getTransactionsByMonth, getAvailableMonths, getMonthlySpendingTrends } from '$lib/stores/transactions';
	import { getAllCategories } from '$lib/stores/categories';
	import HeaderNav from '$lib/components/HeaderNav.svelte';
	import MonthPicker from '$lib/components/MonthPicker.svelte';
	import CategoryBreakdownChart from '$lib/components/CategoryBreakdownChart.svelte';
	import MonthlyTrendsChart from '$lib/components/MonthlyTrendsChart.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';

	// State
	let isLoading = $state(true);
	let categories = $state<Category[]>([]);
	let transactions = $state<Transaction[]>([]);
	let currentMonth = $state(getMonthKey(new Date()));
	let availableMonths = $state<string[]>([getMonthKey(new Date())]);
	let monthlyTrends = $state<Map<string, number>>(new Map());

	// Computed
	let monthDisplay = $derived(format(parseMonthKey(currentMonth), 'MMMM yyyy'));

	// Load data
	async function loadData() {
		isLoading = true;
		try {
			await initializeDatabase();
			categories = await getAllCategories();
			availableMonths = await getAvailableMonths();
			await loadMonthData();
			// Get trends for all available months
			monthlyTrends = await getMonthlySpendingTrends(availableMonths);
		} catch (error) {
			console.error('Failed to load data:', error);
		} finally {
			isLoading = false;
		}
	}

	// Load month-specific data
	async function loadMonthData() {
		transactions = await getTransactionsByMonth(currentMonth);
	}

	// Handle month change
	function handleMonthChange(month: string) {
		currentMonth = month;
		loadMonthData();
	}

	onMount(() => {
		loadData();
	});
</script>

<svelte:head>
	<title>Insights - Budget Tracker</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<!-- Header -->
	<HeaderNav title="Insights" showBack={true}>
		<MonthPicker
			{currentMonth}
			{availableMonths}
			onMonthChange={handleMonthChange}
		/>
	</HeaderNav>

	<!-- Main Content -->
	<main class="max-w-4xl mx-auto px-4 py-6 space-y-6">
		{#if isLoading}
			<!-- Chart skeleton -->
			<div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
				<div class="px-6 py-4 border-b border-gray-100">
					<Skeleton class="h-6 mb-2" width="180px" rounded="sm" />
					<Skeleton class="h-4" width="100px" rounded="sm" />
				</div>
				<div class="p-6">
					<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div class="flex items-center justify-center">
							<Skeleton class="w-[200px] h-[200px]" rounded="full" />
						</div>
						<div class="space-y-3">
							{#each Array(5) as _}
								<div class="flex items-center gap-3 p-2">
									<Skeleton class="w-3 h-3" rounded="full" />
									<Skeleton class="w-6 h-6" rounded="lg" />
									<Skeleton class="h-4 flex-1" rounded="sm" />
									<Skeleton class="h-4" width="80px" rounded="sm" />
								</div>
							{/each}
						</div>
					</div>
				</div>
			</div>

			<!-- Trends skeleton -->
			<div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
				<div class="px-6 py-4 border-b border-gray-100">
					<Skeleton class="h-6 mb-2" width="200px" rounded="sm" />
					<Skeleton class="h-4" width="120px" rounded="sm" />
				</div>
				<div class="p-6">
					<Skeleton class="h-[250px] w-full" rounded="lg" />
				</div>
			</div>
		{:else}
			<!-- Category Breakdown for selected month -->
			<CategoryBreakdownChart {transactions} {categories} />

			<!-- Monthly Trends -->
			<MonthlyTrendsChart monthlyData={monthlyTrends} />

			<!-- Quick Stats -->
			{#if transactions.length > 0}
				{@const totalSpent = transactions.reduce((sum, t) => sum + (t.isShared ? t.amount - t.partnerShare : t.amount), 0)}
				{@const sharedCount = transactions.filter(t => t.isShared).length}
				{@const avgTransaction = totalSpent / transactions.length}
				{@const uniqueCategories = new Set(transactions.map(t => t.categoryId)).size}
				<div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
					<div class="px-6 py-4 border-b border-gray-100">
						<h2 class="text-lg font-semibold text-gray-900">Quick Stats for {monthDisplay}</h2>
					</div>
					<div class="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
						<div class="text-center">
							<p class="text-2xl font-bold text-gray-900">{transactions.length}</p>
							<p class="text-sm text-gray-500">Transactions</p>
						</div>
						<div class="text-center">
							<p class="text-2xl font-bold text-gray-900">${avgTransaction.toFixed(0)}</p>
							<p class="text-sm text-gray-500">Avg Transaction</p>
						</div>
						<div class="text-center">
							<p class="text-2xl font-bold text-gray-900">{sharedCount}</p>
							<p class="text-sm text-gray-500">Shared</p>
						</div>
						<div class="text-center">
							<p class="text-2xl font-bold text-gray-900">{uniqueCategories}</p>
							<p class="text-sm text-gray-500">Categories</p>
						</div>
					</div>
				</div>
			{/if}
		{/if}
	</main>
</div>
