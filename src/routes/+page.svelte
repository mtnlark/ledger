<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { format, startOfDay, parseISO } from 'date-fns';
	import { getMonthKey, parseMonthKey, type Transaction, type Category, type Settings, type MonthlyBudget, DEFAULT_SETTINGS } from '$lib/db';
	import { initializeStorage } from '$lib/storage';
	import { addTransaction, updateTransaction, deleteTransaction, bulkDeleteTransactions, bulkUpdateCategory, splitTransaction, getTransactionsByMonth, getAllTransactions, getAvailableMonths } from '$lib/stores/transactions';
	import { getAllCategories } from '$lib/stores/categories';
	import { getSettings, cancelSubscription, dismissRecurringSuggestionsForMonth } from '$lib/stores/settings';
	import { getBudgetForMonth, saveBudget } from '$lib/stores/budget';
	import { getContributionsAffectingAvailable } from '$lib/stores/savingsContributions';
	import { getRecurringSuggestions, shouldShowRecurringBanner, type RecurringSuggestion } from '$lib/stores/recurringSuggestions';
	import { sumCurrency } from '$lib/utils/currency';
	import { getSelectedMonth, setSelectedMonth } from '$lib/stores/selectedMonth';
	import { toast } from '$lib/stores/toast';
	import { formatCurrency } from '$lib/utils/format-helpers';
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
	import KeyboardShortcuts from '$lib/components/KeyboardShortcuts.svelte';
	import RecurringSuggestionsBanner from '$lib/components/RecurringSuggestionsBanner.svelte';
	import RecurringSuggestionsModal from '$lib/components/RecurringSuggestionsModal.svelte';
	import DashboardInsightWidget from '$lib/components/DashboardInsightWidget.svelte';
	import { Square } from 'lucide-svelte';
	import { getDaysInMonth } from 'date-fns';

	// State
	let isLoading = $state(true);
	let isSelectionMode = $state(false);
	let quickAddOpen = $state(false);
	let searchInputRef = $state<HTMLInputElement | null>(null);
	let categories = $state<Category[]>([]);
	let transactions = $state<Transaction[]>([]); // Current month's transactions
	let allTransactions = $state<Transaction[]>([]); // All transactions (for filtering)
	let settings = $state<Settings>(DEFAULT_SETTINGS);
	let budget = $state<MonthlyBudget | null>(null);
	let savedFromContributions = $state(0);
	let showBudgetModal = $state(false);
	let editingTransaction = $state<Transaction | null>(null);
	let splittingTransaction = $state<Transaction | null>(null);
	let currentMonth = $state(getMonthKey(new Date()));
	let availableMonths = $state<string[]>([getMonthKey(new Date())]);

	// Recurring suggestions state
	let showRecurringBanner = $state(false);
	let showRecurringSuggestionsModal = $state(false);
	let recurringSuggestions = $state<RecurringSuggestion[]>([]);

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
		dateTo: '',
		searchAllTime: false
	});

	// Check if we're using filters that require all transactions
	let needsAllTransactions = $derived(
		filters.dateFrom !== '' ||
		filters.dateTo !== '' ||
		filters.searchAllTime
	);

	// Determine which transaction set to filter from
	let baseTransactions = $derived(needsAllTransactions ? allTransactions : transactions);

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
		// If all-time search or date filters are being applied, load all transactions
		const needsAll = newFilters.dateFrom !== '' || newFilters.dateTo !== '' || newFilters.searchAllTime;
		if (needsAll && allTransactions.length === 0) {
			allTransactions = await getAllTransactions();
		}
		filters = newFilters;
	}

	// Computed
	let monthDisplay = $derived(format(parseMonthKey(currentMonth), 'MMMM yyyy'));
	let daysInCurrentMonth = $derived(getDaysInMonth(parseMonthKey(currentMonth)));
	let currentDayOfMonth = $derived(new Date().getDate());
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
			// Load savings contributions that affect available to spend
			const contributions = await getContributionsAffectingAvailable(currentMonth);
			savedFromContributions = sumCurrency(contributions.map(c => c.amount));

			// Check for recurring suggestions
			if (shouldShowRecurringBanner(currentMonth, settings.lastAutoSuggestedMonth)) {
				recurringSuggestions = await getRecurringSuggestions(currentMonth);
				showRecurringBanner = recurringSuggestions.length > 0;
			} else {
				showRecurringBanner = false;
			}
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
			const [txns, monthBudget, contributions] = await Promise.all([
				getTransactionsByMonth(month),
				getBudgetForMonth(month),
				getContributionsAffectingAvailable(month)
			]);
			currentMonth = month;
			transactions = txns;
			budget = monthBudget;
			savedFromContributions = sumCurrency(contributions.map(c => c.amount));
		} catch (error) {
			console.error('Failed to load month data:', error);
		}
	}

	// Handle budget save
	async function handleSaveBudget(data: { income: number; notes?: string }) {
		try {
			// Keep existing savedAmount for backward compatibility (not used in calculations anymore)
			await saveBudget(currentMonth, { ...data, savedAmount: budget?.savedAmount ?? 0 });
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

	// Handle adding selected recurring suggestions
	async function handleAddSelectedSuggestions(items: Array<RecurringSuggestion & { date: Date }>) {
		try {
			for (const item of items) {
				await addTransaction({
					date: item.date,
					merchant: item.merchant,
					amount: item.expectedAmount,
					categoryId: item.categoryId,
					isShared: item.isShared,
					isSettled: false,
					splitType: item.splitType,
					splitValue: item.splitValue,
					isEssential: item.isEssential,
					isSubscription: item.isSubscription,
					subscriptionFrequency: item.frequency === 'annual' ? 'annual' : 'monthly'
				});
			}

			// Reload transactions
			transactions = await getTransactionsByMonth(currentMonth);
			availableMonths = await getAvailableMonths();
			if (allTransactions.length > 0) {
				allTransactions = await getAllTransactions();
			}

			// Refresh suggestions (remove added ones)
			recurringSuggestions = await getRecurringSuggestions(currentMonth);

			// Only dismiss if all suggestions have been added
			if (recurringSuggestions.length === 0) {
				await dismissRecurringSuggestionsForMonth(currentMonth);
				settings = await getSettings();
			}

			showRecurringBanner = recurringSuggestions.length > 0;
			showRecurringSuggestionsModal = false;

			toast.success(items.length === 1
				? 'Transaction added'
				: `${items.length} transactions added`);
		} catch (error) {
			console.error('Failed to add recurring suggestions:', error);
			toast.error('Failed to add transactions');
		}
	}

	// Handle dismissing recurring suggestions for this month
	async function handleDismissRecurringSuggestions() {
		try {
			await dismissRecurringSuggestionsForMonth(currentMonth);
			settings = await getSettings();
			showRecurringBanner = false;
			showRecurringSuggestionsModal = false;
		} catch (error) {
			console.error('Failed to dismiss recurring suggestions:', error);
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

	// Keyboard shortcut handlers
	function handleOpenQuickAdd() {
		if (!isLoading) {
			quickAddOpen = true;
		}
	}

	function handleFocusSearch() {
		searchInputRef?.focus();
	}

	// Expose ref setter for TransactionFilters to use
	function setSearchInputRef(el: HTMLInputElement | null) {
		searchInputRef = el;
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

	<!-- Recurring Suggestions Banner -->
	{#if showRecurringBanner && !isLoading}
		<div class="max-w-4xl mx-auto px-4 pt-4">
			<RecurringSuggestionsBanner
				suggestionCount={recurringSuggestions.length}
				onReview={() => showRecurringSuggestionsModal = true}
				onDismiss={handleDismissRecurringSuggestions}
			/>
		</div>
	{/if}

	<!-- Main Content -->
	<main class="max-w-4xl mx-auto px-4 py-6 space-y-6" aria-live="polite">
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
			<!-- Quick Insight Widget -->
			<DashboardInsightWidget
				{currentMonth}
				{transactions}
				{budget}
				{savedFromContributions}
				currentDay={currentDayOfMonth}
				daysInMonth={daysInCurrentMonth}
			/>

			<!-- Cash Flow Summary -->
			<CashFlowCard
				{budget}
				{totalSpent}
				{savedFromContributions}
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
				allTimeCount={allTransactions.length}
				onSearchInputRef={setSearchInputRef}
			/>

			<!-- Transaction List -->
			<div>
				<div class="flex items-center justify-between mb-4">
					<h2 class="font-display text-xl font-medium text-charcoal">
						{#if filters.searchAllTime}
							All Transactions
						{:else if filters.searchQuery || filters.categoryId !== null || filters.dateFrom || filters.dateTo}
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
					onAddTransaction={handleOpenQuickAdd}
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
	{savedFromContributions}
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

<!-- Recurring Suggestions Modal -->
<RecurringSuggestionsModal
	isOpen={showRecurringSuggestionsModal}
	suggestions={recurringSuggestions}
	{categories}
	{settings}
	{currentMonth}
	onAddSelected={handleAddSelectedSuggestions}
	onDismiss={handleDismissRecurringSuggestions}
	onClose={() => showRecurringSuggestionsModal = false}
/>

<!-- Quick Add FAB -->
{#if !isLoading}
	<QuickAddFAB
		{categories}
		{settings}
		onSubmit={handleQuickAdd}
		bind:isOpen={quickAddOpen}
	/>
{/if}

<!-- Keyboard Shortcuts -->
<KeyboardShortcuts
	onOpenQuickAdd={handleOpenQuickAdd}
	onFocusSearch={handleFocusSearch}
/>
