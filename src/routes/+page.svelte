<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { format, startOfDay, parseISO } from 'date-fns';
	import { getMonthKey, parseMonthKey, type Transaction, type Category, type Settings, type MonthlyBudget, DEFAULT_SETTINGS } from '$lib/db';
	import { initializeStorage } from '$lib/storage';
	import { getTransactionsByMonth, getTransactionsByMonthFromCache, getAllTransactions, getAvailableMonths } from '$lib/stores/transactions';
	import { setupDashboardActions } from '$lib/stores/dashboardActions';
	import { getAllCategories } from '$lib/stores/categories';
	import { getSettings, dismissRecurringSuggestionsForMonth } from '$lib/stores/settings';
	import { getBudgetForMonth, saveBudget } from '$lib/stores/budget';
	import { getEffectiveBudgetsForMonth } from '$lib/stores/categoryBudget';
	import { getContributionsAffectingAvailable } from '$lib/stores/savingsContributions';
	import { addRecurringSuggestionTransaction, getRecurringSuggestions, shouldShowRecurringBanner, type RecurringSuggestion } from '$lib/stores/recurringSuggestions';
	import { sumCurrency, calculateTotalSpent } from '$lib/utils/currency';
	import { groupTransactionsIntoPurchases } from '$lib/utils/transaction-grouping';
	import { matchesTag } from '$lib/utils/tags';
	import { tagIndex } from '$lib/stores/tags.svelte';
	import { registerShortcutHandlers } from '$lib/stores/shortcuts';
	import { getSelectedMonth, setSelectedMonth } from '$lib/stores/selectedMonth';
	import { toast } from '$lib/stores/toast';
	import { handleError } from '$lib/utils/error-handler';
	import { formatCurrency } from '$lib/utils/format-helpers';
	import TransactionList from '$lib/components/TransactionList.svelte';
	import AddTransactionModal from '$lib/components/AddTransactionModal.svelte';
	import CashFlowCard from '$lib/components/CashFlowCard.svelte';
	import BudgetModal from '$lib/components/BudgetModal.svelte';
	import EditTransactionModal, { type TransactionUpdateData } from '$lib/components/EditTransactionModal.svelte';
	import SplitTransactionModal from '$lib/components/SplitTransactionModal.svelte';
	import EditSplitModal from '$lib/components/EditSplitModal.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import MonthPicker from '$lib/components/MonthPicker.svelte';
	import CashFlowCardSkeleton from '$lib/components/CashFlowCardSkeleton.svelte';
	import TransactionListSkeleton from '$lib/components/TransactionListSkeleton.svelte';
	import TransactionFilters, { type FilterState } from '$lib/components/TransactionFilters.svelte';
	import RecurringSuggestionsBanner from '$lib/components/RecurringSuggestionsBanner.svelte';
	import RecurringSuggestionsModal from '$lib/components/RecurringSuggestionsModal.svelte';
	import WeekInReviewCard from '$lib/components/WeekInReviewCard.svelte';
	import StaleLedgerBanner from '$lib/components/StaleLedgerBanner.svelte';
	import ReportCardModal, { type ReportStat } from '$lib/components/ReportCardModal.svelte';
	import { computeMerchantReport, computeTagReport } from '$lib/utils/report-cards';
	import TopCategoriesBar from '$lib/components/insights/TopCategoriesBar.svelte';
	import { Plus, Square, CalendarClock } from 'lucide-svelte';

	const SHOW_UPCOMING_KEY = 'ledger-show-upcoming';
	const STALE_NUDGE_KEY = 'ledger-stale-nudge-dismissed';
	const STALE_THRESHOLD_DAYS = 7;

	let isLoading = $state(true);
	let isSelectionMode = $state(false);
	let addModalOpen = $state(false);
	// Height of the sticky heading+toolbar block; date headers stick just below it
	let toolbarHeight = $state(0);
	// Future-dated transactions are hidden by default (toggle persists)
	let showUpcoming = $state(false);
	// Stale-ledger nudge: shown when nothing has been entered for a week
	let staleNudgeDismissedAt = $state<string | null>(null);
	// Report cards (merchant / tag drill-downs)
	let merchantReportFor = $state<string | null>(null);
	let tagReportFor = $state<string | null>(null);
	let searchInputRef = $state<HTMLInputElement | null>(null);
	let categories = $state<Category[]>([]);
	let transactions = $state<Transaction[]>([]); // Current month's transactions
	let allTransactions = $state<Transaction[]>([]); // All transactions (for filtering)
	let settings = $state<Settings>(DEFAULT_SETTINGS);
	let budget = $state<MonthlyBudget | null>(null);
	let savedFromContributions = $state(0);
	let rolloverAdjustment = $state(0);
	let showBudgetModal = $state(false);
	let editingTransaction = $state<Transaction | null>(null);
	let splittingTransaction = $state<Transaction | null>(null);
	let editingSplit = $state<{ parentId: number; children: Transaction[] } | null>(null);
	let currentMonth = $state(getMonthKey(new Date()));
	let availableMonths = $state<string[]>([getMonthKey(new Date())]);

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
		amountMax: '',
		sharedStatus: ''
	});

	// Check if we're using filters that require all transactions
	let needsAllTransactions = $derived(
		filters.dateFrom !== '' ||
		filters.dateTo !== '' ||
		filters.searchAllTime
	);

	// Key that changes when pagination should reset (month or filter changes, but NOT data refreshes)
	let transactionListResetKey = $derived(
		`${currentMonth}|${filters.searchQuery}|${filters.categoryId}|${filters.dateFrom}|${filters.dateTo}|${filters.searchAllTime}|${filters.tags.join(',')}|${filters.amountMin}|${filters.amountMax}|${filters.sharedStatus}|${showUpcoming}`
	);

	// Determine which transaction set to filter from
	let baseTransactions = $derived(needsAllTransactions ? allTransactions : transactions);

	// Filtered transactions (search/category/date/tag/amount — before the upcoming filter)
	let searchFilteredTransactions = $derived.by(() => {
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

		// Filter by shared status (settlement history: shared + settled + all time)
		if (filters.sharedStatus === 'shared') {
			result = result.filter(t => t.isShared);
		} else if (filters.sharedStatus === 'pending') {
			result = result.filter(t => t.isShared && !t.isSettled);
		} else if (filters.sharedStatus === 'settled') {
			result = result.filter(t => t.isShared && t.isSettled);
		} else if (filters.sharedStatus === 'personal') {
			result = result.filter(t => !t.isShared);
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

	// Upcoming (future-dated) transactions are hidden by default so logging in on
	// the 3rd doesn't show the whole month's recurring entries. Exception: when
	// deliberately viewing a future month, everything is upcoming — hiding would
	// blank the page, so the filter is skipped.
	let isFutureMonthView = $derived(currentMonth > getMonthKey(new Date()));

	let upcomingCount = $derived.by(() => {
		if (isFutureMonthView) return 0;
		const today = startOfDay(new Date());
		const upcoming = searchFilteredTransactions.filter(
			(t) => startOfDay(new Date(t.date)) > today
		);
		return groupTransactionsIntoPurchases(upcoming).length;
	});

	let filteredTransactions = $derived.by(() => {
		if (showUpcoming || isFutureMonthView) return searchFilteredTransactions;
		const today = startOfDay(new Date());
		return searchFilteredTransactions.filter((t) => startOfDay(new Date(t.date)) <= today);
	});

	let filteredTransactionCount = $derived(
		groupTransactionsIntoPurchases(filteredTransactions).length
	);
	let monthTransactionCount = $derived(groupTransactionsIntoPurchases(transactions).length);
	let allTransactionCount = $derived(groupTransactionsIntoPurchases(allTransactions).length);

	// Days since the most recent entry (createdAt = entry activity, not transaction date)
	let daysSinceEntry = $derived.by(() => {
		if (allTransactions.length === 0) return 0;
		const latest = allTransactions.reduce(
			(max, t) => Math.max(max, new Date(t.createdAt).getTime()),
			0
		);
		return Math.floor((Date.now() - latest) / 86_400_000);
	});

	let showStaleNudge = $derived.by(() => {
		if (isLoading || daysSinceEntry < STALE_THRESHOLD_DAYS) return false;
		// Dismissal re-arms after another threshold period
		if (staleNudgeDismissedAt) {
			const sinceDismiss = Math.floor(
				(Date.now() - new Date(staleNudgeDismissedAt).getTime()) / 86_400_000
			);
			if (sinceDismiss < STALE_THRESHOLD_DAYS) return false;
		}
		return true;
	});

	let merchantReport = $derived(
		merchantReportFor ? computeMerchantReport(allTransactions, categories, merchantReportFor) : null
	);
	let merchantReportStats = $derived.by((): ReportStat[] => {
		if (!merchantReport) return [];
		return [
			{ label: 'Total spent', value: formatCurrency(merchantReport.total), sub: 'your share, all time' },
			{ label: 'Visits', value: String(merchantReport.visits) },
			{ label: 'Average per visit', value: formatCurrency(merchantReport.average) },
			{ label: 'Last visit', value: format(merchantReport.lastDate, 'MMM d, yyyy') }
		];
	});

	let tagReport = $derived(
		tagReportFor ? computeTagReport(allTransactions, categories, tagReportFor) : null
	);
	let tagReportStats = $derived.by((): ReportStat[] => {
		if (!tagReport) return [];
		return [
			{ label: 'Total spent', value: formatCurrency(tagReport.total), sub: 'your share, all time' },
			{ label: 'Transactions', value: String(tagReport.count) },
			{ label: 'First used', value: format(tagReport.firstDate, 'MMM d, yyyy') },
			{ label: 'Last used', value: format(tagReport.lastDate, 'MMM d, yyyy') }
		];
	});

	function dismissStaleNudge() {
		staleNudgeDismissedAt = new Date().toISOString();
		localStorage.setItem(STALE_NUDGE_KEY, staleNudgeDismissedAt);
	}

	function toggleUpcoming() {
		showUpcoming = !showUpcoming;
		localStorage.setItem(SHOW_UPCOMING_KEY, String(showUpcoming));
	}

	async function handleFilterChange(newFilters: FilterState) {
		// If all-time search or date filters are being applied, load all transactions
		const needsAll = newFilters.dateFrom !== '' || newFilters.dateTo !== '' || newFilters.searchAllTime;
		if (needsAll && allTransactions.length === 0) {
			allTransactions = await getAllTransactions();
		}
		filters = newFilters;
	}

	let monthDisplay = $derived(format(parseMonthKey(currentMonth), 'MMMM yyyy'));
	let totalSpent = $derived(calculateTotalSpent(transactions));

	// Initial data load - runs once on mount
	$effect(() => {
		loadData();
		// Empty dependency array equivalent - this effect runs once
		return () => {};
	});

	async function loadData() {
		isLoading = true;
		try {
			await initializeStorage();
			// Restore selected month and upcoming-visibility from localStorage
			currentMonth = getSelectedMonth();
			showUpcoming = localStorage.getItem(SHOW_UPCOMING_KEY) === 'true';
			staleNudgeDismissedAt = localStorage.getItem(STALE_NUDGE_KEY);

			// Parallelize independent queries
			const [cats, s, allTxns] = await Promise.all([
				getAllCategories(),
				getSettings(),
				getAllTransactions()
			]);
			categories = cats;
			settings = s;
			allTransactions = allTxns;

			// Use cache for current month (avoids redundant DB query)
			transactions = getTransactionsByMonthFromCache(currentMonth) ?? await getTransactionsByMonth(currentMonth);

			// Parallelize remaining independent queries
			const [monthBudget, months, contributions, rollover] = await Promise.all([
				getBudgetForMonth(currentMonth),
				getAvailableMonths(),
				getContributionsAffectingAvailable(currentMonth),
				getEffectiveBudgetsForMonth(currentMonth)
			]);
			budget = monthBudget;
			availableMonths = months;
			savedFromContributions = sumCurrency(contributions.map(c => c.amount));
			rolloverAdjustment = rollover.carryoverTotal - rollover.deficitCarried;
		} catch (error) {
			handleError(error, { context: 'loadData', showToast: false });
		} finally {
			isLoading = false;
		}

		// Deferred: check recurring suggestions after first paint
		try {
			if (shouldShowRecurringBanner(currentMonth, settings.lastAutoSuggestedMonth)) {
				recurringSuggestions = await getRecurringSuggestions(currentMonth, allTransactions);
				showRecurringBanner = recurringSuggestions.length > 0;
			} else {
				showRecurringBanner = false;
			}
		} catch (error) {
			handleError(error, { context: 'loadRecurringSuggestions', showToast: false });
		}
	}

	// Handle month change from picker
	// Fetch data first, then update all state atomically to prevent UI mismatch
	async function handleMonthChange(month: string) {
		setSelectedMonth(month);
		try {
			const [txns, monthBudget, contributions, rollover] = await Promise.all([
				getTransactionsByMonth(month),
				getBudgetForMonth(month),
				getContributionsAffectingAvailable(month),
				getEffectiveBudgetsForMonth(month)
			]);
			currentMonth = month;
			transactions = txns;
			budget = monthBudget;
			savedFromContributions = sumCurrency(contributions.map(c => c.amount));
			rolloverAdjustment = rollover.carryoverTotal - rollover.deficitCarried;
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

	// Handle bulk tag add — delegates to actions
	async function handleBulkTagAdd(ids: number[], tag: string) {
		if (ids.length === 0) return;
		await actions.bulkAddTag(ids, tag);
	}

	// Handle bulk tag remove — delegates to actions
	async function handleBulkTagRemove(ids: number[], tag: string) {
		if (ids.length === 0) return;
		await actions.bulkRemoveTag(ids, tag);
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

	// Handle editing an entire split — open the split editor
	function handleEditSplit(parentId: number, children: Transaction[]) {
		editingSplit = { parentId, children };
	}

	// Handle deleting an entire split — split-specific confirm, then soft-delete all lines (undoable)
	function handleDeleteSplit(childIds: number[]) {
		if (childIds.length === 0) return;
		showConfirmDialog({
			title: 'Delete Split',
			message: `Delete this split? All ${childIds.length} category lines will be removed.`,
			confirmText: 'Delete',
			variant: 'danger',
			onConfirm: () => actions.bulkDelete(childIds)
		});
	}

	// Handle saving the edited split group — delegates to actions, clears state on success
	async function handleSaveSplitGroup(
		parentId: number,
		shared: {
			merchant: string;
			date: Date;
			isShared: boolean;
			splitType: 'percentage' | 'fixed';
			splitValue: number;
			isSettled: boolean;
		},
		lines: { categoryId: number; amount: number; notes?: string }[]
	) {
		const success = await actions.updateSplitGroup(parentId, shared, lines);
		if (success) editingSplit = null;
	}

	// Handle adding selected recurring suggestions
	async function handleAddSelectedSuggestions(items: Array<RecurringSuggestion & { date: Date }>) {
		try {
			const results = await Promise.allSettled(
				items.map((item) => addRecurringSuggestionTransaction(item))
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

	// Refresh when a quick-add from the menu-bar window lands (event from layout)
	$effect(() => {
		const month = currentMonth;
		const handler = async () => {
			transactions = await getTransactionsByMonth(month);
			allTransactions = await getAllTransactions();
			availableMonths = await getAvailableMonths();
		};
		window.addEventListener('ledger:transactions-changed', handler);
		return () => window.removeEventListener('ledger:transactions-changed', handler);
	});

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
			addModalOpen = true;
		}
	}

	function handleFocusSearch() {
		searchInputRef?.focus();
	}

	// Register page-specific shortcuts (⌘N add, ⌘K search) with the app-wide handler
	$effect(() => registerShortcutHandlers({
		openQuickAdd: handleOpenQuickAdd,
		focusSearch: handleFocusSearch
	}));

	// Expose ref setter for TransactionFilters to use
	function setSearchInputRef(el: HTMLInputElement | null) {
		searchInputRef = el;
	}
</script>

<svelte:head>
	<title>Ledger</title>
</svelte:head>

<div class="min-h-screen">
	<!-- Main Content -->
	<main class="max-w-6xl mx-auto px-6 py-6" aria-live="polite">
		<!-- Month title -->
		<div class="mb-5 -ml-2">
			<MonthPicker
				variant="title"
				{currentMonth}
				{availableMonths}
				onMonthChange={handleMonthChange}
			/>
		</div>

		<!-- Recurring Suggestions Banner -->
		{#if showRecurringBanner && !isLoading}
			<div class="mb-6">
				<RecurringSuggestionsBanner
					suggestionCount={recurringSuggestions.length}
					onReview={() => showRecurringSuggestionsModal = true}
					onDismiss={handleDismissRecurringSuggestions}
				/>
			</div>
		{/if}

		<!-- Stale Ledger Nudge -->
		{#if showStaleNudge}
			<div class="mb-6">
				<StaleLedgerBanner
					{daysSinceEntry}
					onAddTransaction={() => addModalOpen = true}
					onDismiss={dismissStaleNudge}
				/>
			</div>
		{/if}
		{#if isLoading}
			<!-- Skeleton loading states -->
			<div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_330px] gap-6 items-start">
				<div class="min-w-0">
					<TransactionListSkeleton count={6} />
				</div>
				<CashFlowCardSkeleton />
			</div>
		{:else}
			<div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_330px] gap-6 items-start">
				<!-- Main column: ledger -->
				<div class="min-w-0 space-y-3 order-last lg:order-none">
						<!-- Sticky header: heading + search stay reachable while scrolling -->
						<div
							class="sticky top-0 z-20 bg-cream -mx-3 px-3 pt-1 pb-2 space-y-3"
							bind:clientHeight={toolbarHeight}
						>
							<!-- Heading + actions -->
							<div class="flex items-center justify-between">
								<h2 class="font-display text-xl font-medium text-charcoal">
									{#if filters.searchAllTime}
										All Transactions
									{:else if filters.searchQuery || filters.categoryId !== null || filters.dateFrom || filters.dateTo || filters.amountMin || filters.amountMax || filters.sharedStatus}
										Filtered Transactions
									{:else}
										Transactions
									{/if}
								</h2>
								<div class="flex items-center gap-2">
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
									<button
										type="button"
										onclick={() => addModalOpen = true}
										class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors btn-press"
									>
										<Plus size={16} />
										<span>Add</span>
									</button>
								</div>
							</div>

							<!-- Search & filters toolbar -->
							<TransactionFilters
								{categories}
								{filters}
								onFilterChange={handleFilterChange}
								resultCount={filteredTransactionCount}
								totalCount={monthTransactionCount}
								allTimeCount={allTransactionCount}
								onSearchInputRef={setSearchInputRef}
								{allTransactions}
								onTagsChanged={async () => {
									transactions = await getTransactionsByMonth(currentMonth);
									allTransactions = await getAllTransactions();
								}}
							/>
						</div>

						<!-- Upcoming (future-dated) transactions toggle -->
						{#if upcomingCount > 0}
							<button
								type="button"
								onclick={toggleUpcoming}
								class="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-charcoal-muted hover:text-charcoal border border-dashed border-theme rounded-xl hover:bg-surface-hover/50 transition-colors"
							>
								<CalendarClock size={15} />
								<span>{showUpcoming ? 'Hide upcoming transactions' : `Show ${upcomingCount} upcoming ${upcomingCount === 1 ? 'transaction' : 'transactions'}`}</span>
							</button>
						{/if}

					<!-- Transaction List -->
					<TransactionList
					transactions={filteredTransactions}
					stickyOffset={toolbarHeight}
					onMerchantClick={(m) => merchantReportFor = m}
					{categories}
					{settings}
					{allTransactions}
					resetKey={transactionListResetKey}
					onEdit={handleEdit}
					onDelete={handleDelete}
					onEditSplit={handleEditSplit}
					onDeleteSplit={handleDeleteSplit}
					onBulkDelete={handleBulkDelete}
					onBulkCategoryChange={handleBulkCategoryChange}
					onBulkTagAdd={handleBulkTagAdd}
					onBulkTagRemove={handleBulkTagRemove}
					availableTags={tagIndex.getAllTags()}
					onAddTransaction={handleOpenQuickAdd}
					selectionMode={isSelectionMode}
					onSelectionModeChange={(mode) => isSelectionMode = mode}
					onTagClick={(tag) => {
						if (filters.tags.includes(tag)) {
							filters = { ...filters, tags: filters.tags.filter(t => t !== tag) };
						} else {
							filters = { ...filters, tags: [...filters.tags, tag] };
						}
					}}
					/>
				</div>

				<!-- Right rail: summaries -->
				<aside class="space-y-4 lg:sticky lg:top-6">
					<CashFlowCard
						{budget}
						{totalSpent}
						{savedFromContributions}
						{rolloverAdjustment}
						onEditBudget={() => showBudgetModal = true}
					/>
					<WeekInReviewCard {allTransactions} {categories} />
					{#if transactions.length > 0}
						<div class="bg-surface rounded-xl shadow-sm shadow-theme p-4">
							<h3 class="text-xs font-medium uppercase tracking-wider text-charcoal-muted mb-3">Top Categories</h3>
							<TopCategoriesBar {transactions} {categories} limit={5} />
						</div>
					{/if}
				</aside>
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

<!-- Edit Split Modal -->
<EditSplitModal
	isOpen={editingSplit !== null}
	parentId={editingSplit?.parentId ?? null}
	children={editingSplit?.children ?? []}
	{categories}
	{settings}
	onSave={handleSaveSplitGroup}
	onClose={() => editingSplit = null}
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

<!-- Merchant / Tag report cards -->
{#if merchantReport}
	<ReportCardModal
		isOpen={true}
		title={merchantReport.merchant}
		stats={merchantReportStats}
		monthly={merchantReport.monthly}
		topCategories={merchantReport.topCategories}
		onClose={() => merchantReportFor = null}
	/>
{/if}
{#if tagReport}
	<ReportCardModal
		isOpen={true}
		title={'#' + tagReport.tag}
		stats={tagReportStats}
		monthly={tagReport.monthly}
		topCategories={tagReport.topCategories}
		onClose={() => tagReportFor = null}
	/>
{/if}

<!-- Add Transaction Modal -->
<AddTransactionModal
	isOpen={addModalOpen}
	{categories}
	{settings}
	onSubmit={actions.addTransaction}
	onSplitSubmit={actions.addSplitTransactions}
	onClose={() => addModalOpen = false}
/>
