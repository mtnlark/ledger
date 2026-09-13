<script lang="ts">
	import { runMutation } from '$lib/storage/mutation';
	import { afterNavigate } from '$app/navigation';
	import { onMount } from 'svelte';
	import { addDays, format, parseISO, startOfTomorrow } from 'date-fns';
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
	import { extractTags } from '$lib/utils/tags';
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
	let showUpcoming = $state(false);
	let staleNudgeDismissedAt = $state<string | null>(null);
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

	let showRecurringBanner = $state(false);
	let showRecurringSuggestionsModal = $state(false);
	let recurringSuggestions = $state<RecurringSuggestion[]>([]);

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

	let needsAllTransactions = $derived(
		filters.dateFrom !== '' ||
		filters.dateTo !== '' ||
		filters.searchAllTime
	);

	// Key that changes when pagination should reset (month or filter changes, but NOT data refreshes)
	let transactionListResetKey = $derived(
		`${currentMonth}|${filters.searchQuery}|${filters.categoryId}|${filters.dateFrom}|${filters.dateTo}|${filters.searchAllTime}|${filters.tags.join(',')}|${filters.amountMin}|${filters.amountMax}|${filters.sharedStatus}|${showUpcoming}`
	);

	let baseTransactions = $derived(needsAllTransactions ? allTransactions : transactions);

	let searchFilteredTransactions = $derived.by(() => {
		const query = filters.searchQuery.trim().toLowerCase();
		const fromTime = filters.dateFrom ? parseISO(filters.dateFrom).getTime() : null;
		const toTime = filters.dateTo
			? addDays(parseISO(filters.dateTo), 1).getTime()
			: null;
		const selectedTags = new Set(filters.tags.map((tag) => tag.replace(/^#/, '').toLowerCase()));
		const minAmount = filters.amountMin === '' ? null : Number(filters.amountMin);
		const maxAmount = filters.amountMax === '' ? null : Number(filters.amountMax);

		return baseTransactions.filter((transaction) => {
			if (
				query &&
				!transaction.merchant.toLowerCase().includes(query) &&
				!transaction.notes?.toLowerCase().includes(query)
			) return false;
			if (filters.categoryId !== null && transaction.categoryId !== filters.categoryId) return false;

			if (fromTime !== null || toTime !== null) {
				const transactionTime = new Date(transaction.date).getTime();
				if (fromTime !== null && transactionTime < fromTime) return false;
				if (toTime !== null && transactionTime >= toTime) return false;
			}

			if (
				selectedTags.size > 0 &&
				!extractTags(transaction.notes).some((tag) => selectedTags.has(tag))
			) return false;

			switch (filters.sharedStatus) {
				case 'shared':
					if (!transaction.isShared) return false;
					break;
				case 'pending':
					if (!transaction.isShared || transaction.isSettled) return false;
					break;
				case 'settled':
					if (!transaction.isShared || !transaction.isSettled) return false;
					break;
				case 'personal':
					if (transaction.isShared) return false;
			}

			if (minAmount !== null && Number.isFinite(minAmount) && transaction.amount < minAmount) return false;
			if (maxAmount !== null && Number.isFinite(maxAmount) && transaction.amount > maxAmount) return false;
			return true;
		});
	});

	// Upcoming (future-dated) transactions are hidden by default so logging in on
	// the 3rd doesn't show the whole month's recurring entries. Exception: when
	// deliberately viewing a future month, everything is upcoming — hiding would
	// blank the page, so the filter is skipped.
	let isFutureMonthView = $derived(currentMonth > getMonthKey(new Date()));

	let transactionsByTiming = $derived.by(() => {
		if (isFutureMonthView) {
			return { current: searchFilteredTransactions, upcoming: [] as Transaction[] };
		}

		const tomorrow = startOfTomorrow().getTime();
		const current: Transaction[] = [];
		const upcoming: Transaction[] = [];
		for (const transaction of searchFilteredTransactions) {
			const destination = new Date(transaction.date).getTime() < tomorrow ? current : upcoming;
			destination.push(transaction);
		}
		return { current, upcoming };
	});

	let upcomingCount = $derived(groupTransactionsIntoPurchases(transactionsByTiming.upcoming).length);
	let filteredTransactions = $derived(
		showUpcoming || isFutureMonthView ? searchFilteredTransactions : transactionsByTiming.current
	);

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
		const needsAll = newFilters.dateFrom !== '' || newFilters.dateTo !== '' || newFilters.searchAllTime;
		if (needsAll && allTransactions.length === 0) {
			allTransactions = await getAllTransactions();
		}
		filters = newFilters;
	}

	let monthDisplay = $derived(format(parseMonthKey(currentMonth), 'MMMM yyyy'));
	let totalSpent = $derived(calculateTotalSpent(transactions));

	onMount(() => void loadData());

	async function loadData() {
		isLoading = true;
		try {
			await initializeStorage();
			currentMonth = getSelectedMonth();
			showUpcoming = localStorage.getItem(SHOW_UPCOMING_KEY) === 'true';
			staleNudgeDismissedAt = localStorage.getItem(STALE_NUDGE_KEY);

			const [cats, s, allTxns] = await Promise.all([
				getAllCategories(),
				getSettings(),
				getAllTransactions()
			]);
			categories = cats;
			settings = s;
			allTransactions = allTxns;

			transactions = getTransactionsByMonthFromCache(currentMonth) ?? await getTransactionsByMonth(currentMonth);

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

	async function handleSaveEdit(id: number, data: TransactionUpdateData) {
		const success = await actions.saveEdit(id, data, editingTransaction?.isSettled ?? false);
		if (success) editingTransaction = null;
	}

	function handleDelete(id: number) {
		showConfirmDialog({
			title: 'Delete Transaction',
			message: 'Are you sure you want to delete this transaction?',
			confirmText: 'Delete',
			variant: 'danger',
			onConfirm: () => actions.deleteTransaction(id)
		});
	}

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

	async function handleBulkCategoryChange(ids: number[], categoryId: number) {
		if (ids.length === 0) return;
		await actions.bulkCategoryChange(ids, categoryId, categories);
	}

	async function handleBulkTagAdd(ids: number[], tag: string) {
		if (ids.length === 0) return;
		await actions.bulkAddTag(ids, tag);
	}

	async function handleBulkTagRemove(ids: number[], tag: string) {
		if (ids.length === 0) return;
		await actions.bulkRemoveTag(ids, tag);
	}

	function handleOpenSplit(transaction: Transaction) {
		editingTransaction = null;
		splittingTransaction = transaction;
	}

	async function handleSplitTransaction(id: number, splits: { categoryId: number; amount: number }[]) {
		const success = await actions.splitTransaction(id, splits);
		if (success) splittingTransaction = null;
	}

	function handleEditSplit(parentId: number, children: Transaction[]) {
		editingSplit = { parentId, children };
	}

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

	async function handleAddSelectedSuggestions(items: Array<RecurringSuggestion & { date: Date }>) {
		try {
			await runMutation(['transactions', 'settings'], async () => {
				for (const item of items) await addRecurringSuggestionTransaction(item);
			});
			const succeeded = items.length;

			// Refresh after the entire batch has been saved.
			transactions = await getTransactionsByMonth(currentMonth);
			availableMonths = await getAvailableMonths();
			if (allTransactions.length > 0) {
				allTransactions = await getAllTransactions();
			}

			recurringSuggestions = await getRecurringSuggestions(currentMonth);

			// Only dismiss if all suggestions have been added
			if (recurringSuggestions.length === 0) {
				await dismissRecurringSuggestionsForMonth(currentMonth);
				settings = await getSettings();
			}

			showRecurringBanner = recurringSuggestions.length > 0;
			showRecurringSuggestionsModal = false;

			toast.success(succeeded === 1 ? 'Transaction added' : `${succeeded} transactions added`);
		} catch (error) {
			handleError(error, { context: 'handleAddSelectedSuggestions', userMessage: 'Failed to add transactions' });
		}
	}

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
