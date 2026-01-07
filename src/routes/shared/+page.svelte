<script lang="ts">
	import { onMount } from 'svelte';
	import { initializeDatabase, type Transaction, type Category, type Settings, DEFAULT_SETTINGS } from '$lib/db';
	import { getUnsettledTransactions, calculateOutstandingBalance, markAsSettled } from '$lib/stores/transactions';
	import { getAllCategories } from '$lib/stores/categories';
	import { getSettings } from '$lib/stores/settings';
	import SettlementTracker from '$lib/components/SettlementTracker.svelte';
	import HeaderNav from '$lib/components/HeaderNav.svelte';

	// State
	let isLoading = $state(true);
	let categories = $state<Category[]>([]);
	let unsettledTransactions = $state<Transaction[]>([]);
	let outstandingBalance = $state(0);
	let settings = $state<Settings>(DEFAULT_SETTINGS);

	// Load data
	async function loadData() {
		isLoading = true;
		try {
			await initializeDatabase();
			categories = await getAllCategories();
			settings = await getSettings();
			unsettledTransactions = await getUnsettledTransactions();
			outstandingBalance = await calculateOutstandingBalance();
		} catch (error) {
			console.error('Failed to load data:', error);
		} finally {
			isLoading = false;
		}
	}

	// Handle marking transactions as settled
	async function handleMarkSettled(ids: number[]) {
		try {
			await markAsSettled(ids);
			// Reload data
			unsettledTransactions = await getUnsettledTransactions();
			outstandingBalance = await calculateOutstandingBalance();
		} catch (error) {
			console.error('Failed to mark as settled:', error);
		}
	}

	onMount(() => {
		loadData();
	});
</script>

<svelte:head>
	<title>Shared Expenses - Budget Tracker</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<!-- Header -->
	<HeaderNav title="Shared" showBack={true} />

	<!-- Main Content -->
	<main class="max-w-4xl mx-auto px-4 py-6 space-y-6">
		{#if isLoading}
			<div class="flex items-center justify-center py-12">
				<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
			</div>
		{:else}
			<SettlementTracker
				transactions={unsettledTransactions}
				{categories}
				{settings}
				{outstandingBalance}
				onMarkSettled={handleMarkSettled}
			/>

			<!-- Quick Tips -->
			<div class="bg-blue-50 rounded-xl p-5 border border-blue-100">
				<h3 class="font-medium text-blue-900 mb-2">Tips</h3>
				<ul class="text-sm text-blue-800 space-y-1">
					<li>• Select transactions and mark them as settled after Venmo'ing</li>
					<li>• Use "Select All" to settle everything at once</li>
					<li>• Settled transactions won't appear in this list</li>
				</ul>
			</div>
		{/if}
	</main>
</div>
