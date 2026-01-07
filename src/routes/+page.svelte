<script lang="ts">
	import { onMount } from 'svelte';
	import { format } from 'date-fns';
	import { initializeDatabase, getMonthKey, parseMonthKey, type Transaction, type Category, type Settings, type MonthlyBudget, DEFAULT_SETTINGS } from '$lib/db';
	import { addTransaction, deleteTransaction, getTransactionsByMonth, getAvailableMonths } from '$lib/stores/transactions';
	import { getAllCategories } from '$lib/stores/categories';
	import { getSettings } from '$lib/stores/settings';
	import { getBudgetForMonth, saveBudget } from '$lib/stores/budget';
	import TransactionList from '$lib/components/TransactionList.svelte';
	import TransactionForm, { type TransactionFormData } from '$lib/components/TransactionForm.svelte';
	import CashFlowCard from '$lib/components/CashFlowCard.svelte';
	import BudgetModal from '$lib/components/BudgetModal.svelte';
	import HeaderNav from '$lib/components/HeaderNav.svelte';
	import MonthPicker from '$lib/components/MonthPicker.svelte';

	// State
	let isLoading = $state(true);
	let categories = $state<Category[]>([]);
	let transactions = $state<Transaction[]>([]);
	let settings = $state<Settings>(DEFAULT_SETTINGS);
	let budget = $state<MonthlyBudget | null>(null);
	let showBudgetModal = $state(false);
	let currentMonth = $state(getMonthKey(new Date()));
	let availableMonths = $state<string[]>([getMonthKey(new Date())]);

	// Computed
	let monthDisplay = $derived(format(parseMonthKey(currentMonth), 'MMMM yyyy'));
	let totalSpent = $derived(
		transactions.reduce((sum, t) => {
			// For shared transactions, only count your portion
			if (t.isShared) {
				return sum + (t.amount - t.partnerShare);
			}
			return sum + t.amount;
		}, 0)
	);

	// Load data
	async function loadData() {
		isLoading = true;
		try {
			await initializeDatabase();
			categories = await getAllCategories();
			settings = await getSettings();
			transactions = await getTransactionsByMonth(currentMonth);
			budget = await getBudgetForMonth(currentMonth);
			availableMonths = await getAvailableMonths();
		} catch (error) {
			console.error('Failed to load data:', error);
		} finally {
			isLoading = false;
		}
	}

	// Handle month change from picker
	function handleMonthChange(month: string) {
		currentMonth = month;
		loadMonthData();
	}

	// Load just the month-specific data (without re-fetching categories/settings)
	async function loadMonthData() {
		try {
			transactions = await getTransactionsByMonth(currentMonth);
			budget = await getBudgetForMonth(currentMonth);
		} catch (error) {
			console.error('Failed to load month data:', error);
		}
	}

	// Handle budget save
	async function handleSaveBudget(data: { income: number; savedAmount: number; notes?: string }) {
		try {
			await saveBudget(currentMonth, data);
			budget = await getBudgetForMonth(currentMonth);
			showBudgetModal = false;
		} catch (error) {
			console.error('Failed to save budget:', error);
		}
	}

	// Handle form submission
	async function handleAddTransaction(data: TransactionFormData) {
		try {
			await addTransaction({
				...data,
				isSettled: false
			});
			// Reload transactions and available months (in case new month was added)
			transactions = await getTransactionsByMonth(currentMonth);
			availableMonths = await getAvailableMonths();
		} catch (error) {
			console.error('Failed to add transaction:', error);
		}
	}

	// Handle delete
	async function handleDelete(id: number) {
		if (confirm('Are you sure you want to delete this transaction?')) {
			try {
				await deleteTransaction(id);
				// Reload transactions and available months (in case month is now empty)
				transactions = await getTransactionsByMonth(currentMonth);
				availableMonths = await getAvailableMonths();
			} catch (error) {
				console.error('Failed to delete transaction:', error);
			}
		}
	}

	onMount(() => {
		loadData();
	});

	function formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(amount);
	}
</script>

<svelte:head>
	<title>Budget Tracker</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<!-- Header with navigation -->
	<HeaderNav title="Budget Tracker">
		<MonthPicker
			{currentMonth}
			{availableMonths}
			onMonthChange={handleMonthChange}
		/>
	</HeaderNav>

	<!-- Main Content -->
	<main class="max-w-4xl mx-auto px-4 py-6 space-y-6">
		{#if isLoading}
			<div class="flex items-center justify-center py-12">
				<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
			</div>
		{:else}
			<!-- Cash Flow Summary -->
			<CashFlowCard
				{budget}
				{totalSpent}
				{monthDisplay}
				onEditBudget={() => showBudgetModal = true}
			/>

			<!-- Transaction Form -->
			<TransactionForm
				{categories}
				{settings}
				onSubmit={handleAddTransaction}
			/>

			<!-- Transaction List -->
			<div>
				<h2 class="text-lg font-semibold text-gray-900 mb-3">Recent Transactions</h2>
				<TransactionList
					{transactions}
					{categories}
					onDelete={handleDelete}
				/>
			</div>
		{/if}
	</main>
</div>

<!-- Budget Modal -->
<BudgetModal
	isOpen={showBudgetModal}
	{budget}
	month={currentMonth}
	{monthDisplay}
	onSave={handleSaveBudget}
	onClose={() => showBudgetModal = false}
/>
