<script lang="ts">
	import { onMount } from 'svelte';
	import { format, startOfDay, parseISO } from 'date-fns';
	import { getMonthKey, parseMonthKey, type Transaction, type Category, type Settings, type MonthlyBudget, DEFAULT_SETTINGS } from '$lib/db';
	import { initializeStorage } from '$lib/storage';
	import { addTransaction, updateTransaction, deleteTransaction, getTransactionsByMonth, getAllTransactions, getAvailableMonths } from '$lib/stores/transactions';
	import { getAllCategories } from '$lib/stores/categories';
	import { getSettings } from '$lib/stores/settings';
	import { getBudgetForMonth, saveBudget } from '$lib/stores/budget';
	import { toast } from '$lib/stores/toast';
	import TransactionList from '$lib/components/TransactionList.svelte';
	import TransactionForm, { type TransactionFormData } from '$lib/components/TransactionForm.svelte';
	import CashFlowCard from '$lib/components/CashFlowCard.svelte';
	import BudgetModal from '$lib/components/BudgetModal.svelte';
	import EditTransactionModal, { type TransactionUpdateData } from '$lib/components/EditTransactionModal.svelte';
	import HeaderNav from '$lib/components/HeaderNav.svelte';
	import MonthPicker from '$lib/components/MonthPicker.svelte';
	import CashFlowCardSkeleton from '$lib/components/CashFlowCardSkeleton.svelte';
	import TransactionListSkeleton from '$lib/components/TransactionListSkeleton.svelte';
	import TransactionFilters, { type FilterState } from '$lib/components/TransactionFilters.svelte';
	import QuickAddFAB, { type QuickAddData } from '$lib/components/QuickAddFAB.svelte';

	// State
	let isLoading = $state(true);
	let categories = $state<Category[]>([]);
	let transactions = $state<Transaction[]>([]); // Current month's transactions
	let allTransactions = $state<Transaction[]>([]); // All transactions (for filtering)
	let settings = $state<Settings>(DEFAULT_SETTINGS);
	let budget = $state<MonthlyBudget | null>(null);
	let showBudgetModal = $state(false);
	let editingTransaction = $state<Transaction | null>(null);
	let currentMonth = $state(getMonthKey(new Date()));
	let availableMonths = $state<string[]>([getMonthKey(new Date())]);

	// Filter state
	let filters = $state<FilterState>({
		searchQuery: '',
		categoryId: null,
		dateFrom: '',
		dateTo: ''
	});

	// Check if we're using date filters (which require all transactions)
	let hasDateFilters = $derived(filters.dateFrom !== '' || filters.dateTo !== '');

	// Determine which transaction set to filter from
	let baseTransactions = $derived(hasDateFilters ? allTransactions : transactions);

	// Filtered transactions
	let filteredTransactions = $derived.by(() => {
		let result = baseTransactions;

		// Filter by search query (merchant name)
		if (filters.searchQuery.trim()) {
			const query = filters.searchQuery.toLowerCase().trim();
			result = result.filter(t => t.merchant.toLowerCase().includes(query));
		}

		// Filter by category
		if (filters.categoryId !== null) {
			result = result.filter(t => t.categoryId === filters.categoryId);
		}

		// Filter by date range
		if (filters.dateFrom) {
			const fromDate = startOfDay(parseISO(filters.dateFrom));
			result = result.filter(t => startOfDay(new Date(t.date)) >= fromDate);
		}

		if (filters.dateTo) {
			const toDate = startOfDay(parseISO(filters.dateTo));
			result = result.filter(t => startOfDay(new Date(t.date)) <= toDate);
		}

		return result;
	});

	async function handleFilterChange(newFilters: FilterState) {
		// If date filters are being applied, load all transactions
		const needsAllTransactions = newFilters.dateFrom !== '' || newFilters.dateTo !== '';
		if (needsAllTransactions && allTransactions.length === 0) {
			allTransactions = await getAllTransactions();
		}
		filters = newFilters;
	}

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
			await initializeStorage();
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
			toast.success('Budget saved');
		} catch (error) {
			console.error('Failed to save budget:', error);
			toast.error('Failed to save budget');
		}
	}

	// Handle form submission
	async function handleAddTransaction(data: TransactionFormData) {
		try {
			await addTransaction({
				...data,
				isSettled: data.isSettled
			});
			// Reload transactions and available months (in case new month was added)
			transactions = await getTransactionsByMonth(currentMonth);
			availableMonths = await getAvailableMonths();
			// Also refresh allTransactions if we have it loaded
			if (allTransactions.length > 0) {
				allTransactions = await getAllTransactions();
			}
			toast.success('Transaction added');
		} catch (error) {
			console.error('Failed to add transaction:', error);
			toast.error('Failed to add transaction');
		}
	}

	// Handle quick add (from FAB)
	async function handleQuickAdd(data: QuickAddData) {
		try {
			await addTransaction({
				...data,
				isSettled: data.isSettled
			});
			// Reload transactions and available months
			transactions = await getTransactionsByMonth(currentMonth);
			availableMonths = await getAvailableMonths();
			// Also refresh allTransactions if we have it loaded
			if (allTransactions.length > 0) {
				allTransactions = await getAllTransactions();
			}
			toast.success('Transaction added');
		} catch (error) {
			console.error('Failed to add transaction:', error);
			toast.error('Failed to add transaction');
		}
	}

	// Handle edit - open modal
	function handleEdit(transaction: Transaction) {
		editingTransaction = transaction;
	}

	// Handle save edit
	async function handleSaveEdit(id: number, data: TransactionUpdateData) {
		try {
			await updateTransaction(id, {
				...data,
				isSettled: editingTransaction?.isSettled ?? false
			});
			// Reload transactions and available months (in case date changed)
			transactions = await getTransactionsByMonth(currentMonth);
			availableMonths = await getAvailableMonths();
			editingTransaction = null;
			toast.success('Transaction updated');
		} catch (error) {
			console.error('Failed to update transaction:', error);
			toast.error('Failed to update transaction');
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
				toast.success('Transaction deleted');
			} catch (error) {
				console.error('Failed to delete transaction:', error);
				toast.error('Failed to delete transaction');
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
	<title>Ledger</title>
</svelte:head>

<div class="min-h-screen">
	<!-- Header with month picker -->
	<HeaderNav title="">
		<MonthPicker
			{currentMonth}
			{availableMonths}
			onMonthChange={handleMonthChange}
		/>
	</HeaderNav>

	<!-- Main Content -->
	<main class="max-w-4xl mx-auto px-4 py-6 space-y-6">
		{#if isLoading}
			<!-- Skeleton loading states -->
			<CashFlowCardSkeleton />
			<div class="bg-white rounded-xl shadow-md shadow-gray-200/50 p-6">
				<div class="animate-pulse h-6 w-32 bg-cream-dark rounded mb-4"></div>
				<div class="space-y-4">
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div class="h-10 bg-cream-dark rounded-lg"></div>
						<div class="h-10 bg-cream-dark rounded-lg"></div>
					</div>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div class="h-10 bg-cream-dark rounded-lg"></div>
						<div class="h-10 bg-cream-dark rounded-lg"></div>
					</div>
				</div>
			</div>
			<div>
				<div class="animate-pulse h-6 w-40 bg-cream-dark rounded mb-3"></div>
				<TransactionListSkeleton count={4} />
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

			<!-- Transaction Search & Filters -->
			<TransactionFilters
				{categories}
				{filters}
				onFilterChange={handleFilterChange}
				resultCount={filteredTransactions.length}
				totalCount={transactions.length}
			/>

			<!-- Transaction List -->
			<div>
				<h2 class="font-display text-xl font-medium text-charcoal mb-4">
					{#if filters.searchQuery || filters.categoryId !== null || filters.dateFrom || filters.dateTo}
						Filtered Transactions
					{:else}
						Recent Transactions
					{/if}
				</h2>
				<TransactionList
					transactions={filteredTransactions}
					{categories}
					{settings}
					onEdit={handleEdit}
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

<!-- Edit Transaction Modal -->
<EditTransactionModal
	isOpen={editingTransaction !== null}
	transaction={editingTransaction}
	{categories}
	{settings}
	onSave={handleSaveEdit}
	onClose={() => editingTransaction = null}
/>

<!-- Quick Add FAB -->
{#if !isLoading}
	<QuickAddFAB
		{categories}
		{settings}
		onSubmit={handleQuickAdd}
	/>
{/if}
