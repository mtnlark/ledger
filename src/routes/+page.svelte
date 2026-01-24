<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { format, startOfDay, parseISO } from 'date-fns';
	import { getMonthKey, parseMonthKey, type Transaction, type Category, type Settings, type MonthlyBudget, DEFAULT_SETTINGS } from '$lib/db';
	import { initializeStorage } from '$lib/storage';
	import { addTransaction, updateTransaction, deleteTransaction, bulkDeleteTransactions, bulkUpdateCategory, splitTransaction, getTransactionsByMonth, getAllTransactions, getAvailableMonths } from '$lib/stores/transactions';
	import { getAllCategories } from '$lib/stores/categories';
	import { getSettings, cancelSubscription } from '$lib/stores/settings';
	import { getBudgetForMonth, saveBudget } from '$lib/stores/budget';
	import { getSelectedMonth, setSelectedMonth } from '$lib/stores/selectedMonth';
	import { toast } from '$lib/stores/toast';
	import { formatCurrency } from '$lib/utils/modal-helpers';
	import TransactionList from '$lib/components/TransactionList.svelte';
	import TransactionForm, { type TransactionFormData, type SplitTransactionFormData } from '$lib/components/TransactionForm.svelte';
	import CashFlowCard from '$lib/components/CashFlowCard.svelte';
	import BudgetModal from '$lib/components/BudgetModal.svelte';
	import EditTransactionModal, { type TransactionUpdateData } from '$lib/components/EditTransactionModal.svelte';
	import SplitTransactionModal from '$lib/components/SplitTransactionModal.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import HeaderNav from '$lib/components/HeaderNav.svelte';
	import MonthPicker from '$lib/components/MonthPicker.svelte';
	import CashFlowCardSkeleton from '$lib/components/CashFlowCardSkeleton.svelte';
	import TransactionListSkeleton from '$lib/components/TransactionListSkeleton.svelte';
	import TransactionFilters, { type FilterState } from '$lib/components/TransactionFilters.svelte';
	import QuickAddFAB, { type QuickAddData } from '$lib/components/QuickAddFAB.svelte';
	import { Square } from 'lucide-svelte';

	// State
	let isLoading = $state(true);
	let isSelectionMode = $state(false);
	let categories = $state<Category[]>([]);
	let transactions = $state<Transaction[]>([]); // Current month's transactions
	let allTransactions = $state<Transaction[]>([]); // All transactions (for filtering)
	let settings = $state<Settings>(DEFAULT_SETTINGS);
	let budget = $state<MonthlyBudget | null>(null);
	let showBudgetModal = $state(false);
	let editingTransaction = $state<Transaction | null>(null);
	let splittingTransaction = $state<Transaction | null>(null);
	let currentMonth = $state(getMonthKey(new Date()));
	let availableMonths = $state<string[]>([getMonthKey(new Date())]);

	// Confirm dialog state
	let confirmDialog = $state<{
		isOpen: boolean;
		title: string;
		message: string;
		confirmText: string;
		variant: 'danger' | 'warning' | 'default';
		onConfirm: () => void;
	}>({
		isOpen: false,
		title: '',
		message: '',
		confirmText: 'Confirm',
		variant: 'default',
		onConfirm: () => {}
	});

	function showConfirmDialog(options: {
		title: string;
		message: string;
		confirmText?: string;
		variant?: 'danger' | 'warning' | 'default';
		onConfirm: () => void;
	}) {
		confirmDialog = {
			isOpen: true,
			title: options.title,
			message: options.message,
			confirmText: options.confirmText || 'Confirm',
			variant: options.variant || 'default',
			onConfirm: options.onConfirm
		};
	}

	function closeConfirmDialog() {
		confirmDialog = { ...confirmDialog, isOpen: false };
	}

	function handleConfirm() {
		confirmDialog.onConfirm();
		closeConfirmDialog();
	}

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

	// Initial data load - runs once on mount
	$effect(() => {
		loadData();
		// Empty dependency array equivalent - this effect runs once
		return () => {};
	});

	// Load data
	async function loadData() {
		isLoading = true;
		try {
			await initializeStorage();
			// Restore selected month from localStorage
			currentMonth = getSelectedMonth();
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
	// Fetch data first, then update all state atomically to prevent UI mismatch
	async function handleMonthChange(month: string) {
		setSelectedMonth(month);
		try {
			const [txns, monthBudget] = await Promise.all([
				getTransactionsByMonth(month),
				getBudgetForMonth(month)
			]);
			currentMonth = month;
			transactions = txns;
			budget = monthBudget;
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

	// Handle split transaction submission from form (creates multiple transactions)
	async function handleSplitSubmit(data: SplitTransactionFormData) {
		try {
			// Create each split as a separate transaction
			for (const split of data.splits) {
				await addTransaction({
					date: data.date,
					merchant: data.merchant,
					amount: split.amount,
					categoryId: split.categoryId,
					isShared: data.isShared,
					isSettled: data.isSettled,
					splitType: data.splitType,
					splitValue: data.splitValue,
					isEssential: data.isEssential,
					isSubscription: data.isSubscription,
					subscriptionFrequency: data.subscriptionFrequency
				});
			}
			// Reload transactions and available months
			transactions = await getTransactionsByMonth(currentMonth);
			availableMonths = await getAvailableMonths();
			// Also refresh allTransactions if we have it loaded
			if (allTransactions.length > 0) {
				allTransactions = await getAllTransactions();
			}
			toast.success(`${data.splits.length} transactions added`);
		} catch (error) {
			console.error('Failed to add split transactions:', error);
			toast.error('Failed to add transactions');
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

	// Handle cancel subscription
	async function handleCancelSubscription(merchant: string) {
		try {
			await cancelSubscription(merchant);
			toast.success(`${merchant} marked as cancelled`);
		} catch (error) {
			console.error('Failed to cancel subscription:', error);
			toast.error('Failed to cancel subscription');
		}
	}

	// Handle delete
	function handleDelete(id: number) {
		showConfirmDialog({
			title: 'Delete Transaction',
			message: 'Are you sure you want to delete this transaction?',
			confirmText: 'Delete',
			variant: 'danger',
			onConfirm: async () => {
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
		});
	}

	// Handle bulk delete
	function handleBulkDelete(ids: number[]) {
		if (ids.length === 0) return;

		const message = ids.length === 1
			? 'Are you sure you want to delete this transaction?'
			: `Are you sure you want to delete ${ids.length} transactions?`;

		showConfirmDialog({
			title: ids.length === 1 ? 'Delete Transaction' : 'Delete Transactions',
			message,
			confirmText: 'Delete',
			variant: 'danger',
			onConfirm: async () => {
				try {
					await bulkDeleteTransactions(ids);
					// Reload transactions and available months
					transactions = await getTransactionsByMonth(currentMonth);
					availableMonths = await getAvailableMonths();
					// Also refresh allTransactions if we have it loaded
					if (allTransactions.length > 0) {
						allTransactions = await getAllTransactions();
					}
					toast.success(ids.length === 1 ? 'Transaction deleted' : `${ids.length} transactions deleted`);
				} catch (error) {
					console.error('Failed to delete transactions:', error);
					toast.error('Failed to delete transactions');
				}
			}
		});
	}

	// Handle bulk category change
	async function handleBulkCategoryChange(ids: number[], categoryId: number) {
		if (ids.length === 0) return;

		try {
			await bulkUpdateCategory(ids, categoryId);
			// Reload transactions
			transactions = await getTransactionsByMonth(currentMonth);
			// Also refresh allTransactions if we have it loaded
			if (allTransactions.length > 0) {
				allTransactions = await getAllTransactions();
			}
			const category = categories.find(c => c.id === categoryId);
			const categoryName = category?.name || 'selected category';
			toast.success(ids.length === 1
				? `Category changed to ${categoryName}`
				: `${ids.length} transactions moved to ${categoryName}`);
		} catch (error) {
			console.error('Failed to update categories:', error);
			toast.error('Failed to update categories');
		}
	}

	// Handle opening split modal from edit modal
	function handleOpenSplit(transaction: Transaction) {
		editingTransaction = null; // Close edit modal
		splittingTransaction = transaction; // Open split modal
	}

	// Handle split transaction
	async function handleSplitTransaction(id: number, splits: { categoryId: number; amount: number }[]) {
		try {
			await splitTransaction(id, splits);
			// Reload transactions
			transactions = await getTransactionsByMonth(currentMonth);
			// Also refresh allTransactions if we have it loaded
			if (allTransactions.length > 0) {
				allTransactions = await getAllTransactions();
			}
			splittingTransaction = null;
			toast.success(`Transaction split into ${splits.length} parts`);
		} catch (error) {
			console.error('Failed to split transaction:', error);
			toast.error(error instanceof Error ? error.message : 'Failed to split transaction');
		}
	}

	// Refresh categories/settings when navigating back to this page
	// This ensures changes made on Settings page are picked up without full reload
	afterNavigate(async () => {
		// Only refresh if already loaded (not during initial mount)
		if (!isLoading) {
			// Lightweight refresh - just categories and settings
			categories = await getAllCategories();
			settings = await getSettings();
		}
	});
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
			<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] p-6">
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
				onSplitSubmit={handleSplitSubmit}
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
				<div class="flex items-center justify-between mb-4">
					<h2 class="font-display text-xl font-medium text-charcoal">
						{#if filters.searchQuery || filters.categoryId !== null || filters.dateFrom || filters.dateTo}
							Filtered Transactions
						{:else}
							Recent Transactions
						{/if}
					</h2>
					{#if filteredTransactions.length > 0 && !isSelectionMode}
						<button
							type="button"
							onclick={() => isSelectionMode = true}
							class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors text-charcoal-muted hover:text-charcoal hover:bg-cream"
						>
							<Square size={16} />
							<span>Select</span>
						</button>
					{/if}
				</div>
				<TransactionList
					transactions={filteredTransactions}
					{categories}
					{settings}
					onEdit={handleEdit}
					onDelete={handleDelete}
					onBulkDelete={handleBulkDelete}
					onBulkCategoryChange={handleBulkCategoryChange}
					selectionMode={isSelectionMode}
					onSelectionModeChange={(mode) => isSelectionMode = mode}
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
	onSplit={handleOpenSplit}
	onCancelSubscription={handleCancelSubscription}
	onClose={() => editingTransaction = null}
/>

<!-- Split Transaction Modal -->
<SplitTransactionModal
	isOpen={splittingTransaction !== null}
	transaction={splittingTransaction}
	{categories}
	onSplit={handleSplitTransaction}
	onClose={() => splittingTransaction = null}
/>

<!-- Confirm Dialog -->
<ConfirmDialog
	isOpen={confirmDialog.isOpen}
	title={confirmDialog.title}
	message={confirmDialog.message}
	confirmText={confirmDialog.confirmText}
	variant={confirmDialog.variant}
	onConfirm={handleConfirm}
	onCancel={closeConfirmDialog}
/>

<!-- Quick Add FAB -->
{#if !isLoading}
	<QuickAddFAB
		{categories}
		{settings}
		onSubmit={handleQuickAdd}
	/>
{/if}
