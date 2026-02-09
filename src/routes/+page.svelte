<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { format, startOfDay, parseISO } from 'date-fns';
	import { getMonthKey, parseMonthKey, type Transaction, type Category, type Settings, type MonthlyBudget, DEFAULT_SETTINGS } from '$lib/db';
	import { initializeStorage } from '$lib/storage';
	import { addTransaction, getTransactionsByMonth, getTransactionsByMonthFromCache, getAllTransactions, getAvailableMonths } from '$lib/stores/transactions';
	import { setupDashboardActions } from '$lib/stores/dashboardActions';
	import { getAllCategories } from '$lib/stores/categories';
	import { getSettings, dismissRecurringSuggestionsForMonth } from '$lib/stores/settings';
	import { getBudgetForMonth, saveBudget } from '$lib/stores/budget';
	import { getContributionsAffectingAvailable } from '$lib/stores/savingsContributions';
	import { getRecurringSuggestions, shouldShowRecurringBanner, type RecurringSuggestion } from '$lib/stores/recurringSuggestions';
	import { sumCurrency, calculateTotalSpent } from '$lib/utils/currency';
	import { matchesTag } from '$lib/utils/tags';
	import { getSelectedMonth, setSelectedMonth } from '$lib/stores/selectedMonth';
	import { toast } from '$lib/stores/toast';
	import { handleError } from '$lib/utils/error-handler';
	import TransactionList from '$lib/components/TransactionList.svelte';
	import TransactionForm from '$lib/components/TransactionForm.svelte';
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
	import QuickAddFAB from '$lib/components/QuickAddFAB.svelte';
	import KeyboardShortcuts from '$lib/components/KeyboardShortcuts.svelte';
	import RecurringSuggestionsBanner from '$lib/components/RecurringSuggestionsBanner.svelte';
	import RecurringSuggestionsModal from '$lib/components/RecurringSuggestionsModal.svelte';
	import DashboardInsightWidget from '$lib/components/DashboardInsightWidget.svelte';
	import WeekInReviewCard from '$lib/components/WeekInReviewCard.svelte';
	import { Plus, Square } from 'lucide-svelte';
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

	// Transaction form state
	let formExpanded = $state(false);

	// Recurring suggestions state
	let showRecurringBanner = $state(false);
	let showRecurringSuggestionsModal = $state(false);
	let recurringSuggestions = $state<RecurringSuggestion[]>([]);

	// Transaction CRUD actions (extracted module)
	const actions = setupDashboardActions({
		getCurrentMonth: () => currentMonth,
		hasAllTransactions: () => allTransactions.length > 0,
		reload: (data) => {
			transactions = data.transactions;
			availableMonths = data.availableMonths;
			if (data.allTransactions) {
				allTransactions = data.allTransactions;
			}
		}
	});

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
		searchAllTime: false,
		tags: [],
		amountMin: '',
		amountMax: ''
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

		// Filter by search query (merchant name and notes)
		if (filters.searchQuery.trim()) {
			const query = filters.searchQuery.toLowerCase().trim();
			result = result.filter(t =>
				t.merchant.toLowerCase().includes(query) ||
				(t.notes?.toLowerCase().includes(query) ?? false)
			);
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

		// Filter by tags (OR logic - show transactions with ANY selected tag)
		if (filters.tags.length > 0) {
			result = result.filter(tx => filters.tags.some(tag => matchesTag(tx, tag)));
		}

		// Filter by amount range
		if (filters.amountMin) {
			const min = parseFloat(filters.amountMin);
			if (!isNaN(min)) result = result.filter(t => t.amount >= min);
		}
		if (filters.amountMax) {
			const max = parseFloat(filters.amountMax);
			if (!isNaN(max)) result = result.filter(t => t.amount <= max);
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
	let totalSpent = $derived(calculateTotalSpent(transactions));

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
			// Load all transactions first (populates cache and tag index)
			allTransactions = await getAllTransactions();
			// Use cache for current month (avoids redundant DB query)
			transactions = getTransactionsByMonthFromCache(currentMonth) ?? await getTransactionsByMonth(currentMonth);
			budget = await getBudgetForMonth(currentMonth);
			availableMonths = await getAvailableMonths();
			// Load savings contributions that affect available to spend
			const contributions = await getContributionsAffectingAvailable(currentMonth);
			savedFromContributions = sumCurrency(contributions.map(c => c.amount));

			// Check for recurring suggestions — pass allTransactions to avoid redundant DB scans
			if (shouldShowRecurringBanner(currentMonth, settings.lastAutoSuggestedMonth)) {
				recurringSuggestions = await getRecurringSuggestions(currentMonth, allTransactions);
				showRecurringBanner = recurringSuggestions.length > 0;
			} else {
				showRecurringBanner = false;
			}
		} catch (error) {
			handleError(error, { context: 'loadData', showToast: false });
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
			handleError(error, { context: 'handleMonthChange', showToast: false });
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
			handleError(error, { context: 'handleSaveBudget', userMessage: 'Failed to save budget' });
		}
	}

	// Handle edit - open modal
	function handleEdit(transaction: Transaction) {
		editingTransaction = transaction;
	}

	// Handle save edit — delegates to actions, then clears editing state on success
	async function handleSaveEdit(id: number, data: TransactionUpdateData) {
		const success = await actions.saveEdit(id, data, editingTransaction?.isSettled ?? false);
		if (success) editingTransaction = null;
	}

	// Handle delete — wraps the action in a confirm dialog
	function handleDelete(id: number) {
		showConfirmDialog({
			title: 'Delete Transaction',
			message: 'Are you sure you want to delete this transaction?',
			confirmText: 'Delete',
			variant: 'danger',
			onConfirm: () => actions.deleteTransaction(id)
		});
	}

	// Handle bulk delete — wraps the action in a confirm dialog
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
			onConfirm: () => actions.bulkDelete(ids)
		});
	}

	// Handle bulk category change — delegates to actions with categories for toast
	async function handleBulkCategoryChange(ids: number[], categoryId: number) {
		if (ids.length === 0) return;
		await actions.bulkCategoryChange(ids, categoryId, categories);
	}

	// Handle opening split modal from edit modal
	function handleOpenSplit(transaction: Transaction) {
		editingTransaction = null; // Close edit modal
		splittingTransaction = transaction; // Open split modal
	}

	// Handle split transaction — delegates to actions, then clears splitting state on success
	async function handleSplitTransaction(id: number, splits: { categoryId: number; amount: number }[]) {
		const success = await actions.splitTransaction(id, splits);
		if (success) splittingTransaction = null;
	}

	// Handle adding selected recurring suggestions
	async function handleAddSelectedSuggestions(items: Array<RecurringSuggestion & { date: Date }>) {
		try {
			const results = await Promise.allSettled(
				items.map((item) =>
					addTransaction({
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
						subscriptionFrequency: item.frequency
					})
				)
			);

			const succeeded = results.filter((r) => r.status === 'fulfilled').length;
			const failed = results.filter((r) => r.status === 'rejected').length;

			// Always reload — some may have succeeded
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

			if (failed === 0) {
				toast.success(succeeded === 1
					? 'Transaction added'
					: `${succeeded} transactions added`);
			} else if (succeeded > 0) {
				toast.warning(`${succeeded} added, ${failed} failed`);
			} else {
				toast.error('Failed to add transactions');
			}
		} catch (error) {
			handleError(error, { context: 'handleAddSelectedSuggestions', userMessage: 'Failed to add transactions' });
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
			handleError(error, { context: 'handleDismissRecurringSuggestions', showToast: false });
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

			<!-- Week in Review -->
			<WeekInReviewCard {allTransactions} {categories} />

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
				bind:isExpanded={formExpanded}
				onSubmit={actions.addTransaction}
				onSplitSubmit={actions.addSplitTransactions}
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
				{allTransactions}
				onTagsChanged={async () => {
					transactions = await getTransactionsByMonth(currentMonth);
					allTransactions = await getAllTransactions();
				}}
			/>

			<!-- Transaction List -->
			<div>
				<div class="flex items-center justify-between mb-4">
					<h2 class="font-display text-xl font-medium text-charcoal">
						{#if filters.searchAllTime}
							All Transactions
						{:else if filters.searchQuery || filters.categoryId !== null || filters.dateFrom || filters.dateTo || filters.amountMin || filters.amountMax}
							Filtered Transactions
						{:else}
							Recent Transactions
						{/if}
					</h2>
					<div class="flex items-center gap-2">
						{#if !formExpanded}
							<button
								type="button"
								onclick={() => formExpanded = true}
								class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors text-primary-600 hover:text-primary-700 hover:bg-primary-50"
							>
								<Plus size={16} />
								<span>Add</span>
							</button>
						{/if}
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
				</div>
				<TransactionList
					transactions={filteredTransactions}
					{categories}
					{settings}
					{allTransactions}
					onEdit={handleEdit}
					onDelete={handleDelete}
					onBulkDelete={handleBulkDelete}
					onBulkCategoryChange={handleBulkCategoryChange}
					onAddTransaction={handleOpenQuickAdd}
					selectionMode={isSelectionMode}
					onSelectionModeChange={(mode) => isSelectionMode = mode}
					onTagClick={(tag) => {
						if (!filters.tags.includes(tag)) {
							filters = { ...filters, tags: [...filters.tags, tag] };
						}
					}}
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
	onCancelSubscription={actions.cancelSubscription}
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
		onSubmit={actions.addTransaction}
		bind:isOpen={quickAddOpen}
	/>
{/if}

<!-- Keyboard Shortcuts -->
<KeyboardShortcuts
	onOpenQuickAdd={handleOpenQuickAdd}
	onFocusSearch={handleFocusSearch}
/>
