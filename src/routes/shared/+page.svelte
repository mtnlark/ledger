<script lang="ts">
	import { onMount } from 'svelte';
	import { type Transaction, type Category, type Settings, DEFAULT_SETTINGS } from '$lib/db';
	import { initializeStorage } from '$lib/storage';
	import { getUnsettledTransactions, calculateOutstandingBalance, markAsSettled } from '$lib/stores/transactions';
	import { getAllCategories } from '$lib/stores/categories';
	import { getSettings } from '$lib/stores/settings';
	import { toast } from '$lib/stores/toast';
	import SettlementTracker from '$lib/components/SettlementTracker.svelte';
	import HeaderNav from '$lib/components/HeaderNav.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';

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
			await initializeStorage();
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
			toast.success(`Marked ${ids.length} transaction${ids.length === 1 ? '' : 's'} as settled`);
		} catch (error) {
			console.error('Failed to mark as settled:', error);
			toast.error('Failed to mark as settled');
		}
	}

	onMount(() => {
		loadData();
	});
</script>

<svelte:head>
	<title>Shared Expenses - Ledger</title>
</svelte:head>

<div class="min-h-screen">
	<!-- Header -->
	<HeaderNav title="Shared" showBack={true} />

	<!-- Main Content -->
	<main class="max-w-4xl mx-auto px-4 py-6 space-y-6">
		{#if isLoading}
			<!-- Settlement tracker skeleton -->
			<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
				<div class="px-6 py-5 border-b border-dashed border-theme-dashed bg-gradient-to-r from-success-50 to-success-100/50">
					<Skeleton class="h-4 mb-2" width="180px" rounded="sm" />
					<Skeleton class="h-8 mb-1" width="120px" rounded="sm" />
					<Skeleton class="h-4" width="80px" rounded="sm" />
				</div>
				<div class="divide-y divide-gray-100">
					{#each Array(3) as _}
						<div class="px-6 py-4 flex items-center gap-4">
							<Skeleton class="w-5 h-5" rounded="sm" />
							<Skeleton class="w-10 h-10" rounded="lg" />
							<div class="flex-1 space-y-2">
								<Skeleton class="h-4" width="60%" rounded="sm" />
								<Skeleton class="h-3" width="40%" rounded="sm" />
							</div>
							<div class="text-right space-y-1">
								<Skeleton class="h-5 ml-auto" width="60px" rounded="sm" />
								<Skeleton class="h-3 ml-auto" width="50px" rounded="sm" />
							</div>
						</div>
					{/each}
				</div>
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
			<div class="bg-primary-50 rounded-xl p-5 border border-primary-100">
				<h3 class="font-medium text-primary-800 mb-2">Tips</h3>
				<ul class="text-sm text-primary-700 space-y-1">
					<li>• Select transactions and mark them as settled after Venmo'ing</li>
					<li>• Use "Select All" to settle everything at once</li>
					<li>• Settled transactions won't appear in this list</li>
				</ul>
			</div>
		{/if}
	</main>
</div>
