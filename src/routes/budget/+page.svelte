<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import { format } from 'date-fns';
	import { getMonthKey, navigateMonth, parseMonthKey, type Category, type CategoryBudget, type MonthlyBudget } from '$lib/db';
	import { initializeStorage } from '$lib/storage';
	import { getAllCategories } from '$lib/stores/categories';
	import {
		getCategoryBudgetsForMonth,
		saveCategoryBudget,
		deleteCategoryBudget,
		generateAllSuggestions,
		getAllCategorySpending,
		copyBudgetsFromMonth,
		getEffectiveBudgetsForMonth,
		setCategoryBudgetRollover
	} from '$lib/stores/categoryBudget';
	import type { RolloverResult } from '$lib/utils/budget-rollover';
	import { getBudgetForMonth } from '$lib/stores/budget';
	import { getContributionsAffectingAvailable } from '$lib/stores/savingsContributions';
	import { getSelectedMonth, setSelectedMonth } from '$lib/stores/selectedMonth';
	import { getAvailableMonths } from '$lib/stores/transactions';
	import { toast } from '$lib/stores/toast';
	import { formatCurrencyWhole } from '$lib/utils/format-helpers';
	import { sumCurrency, roundCurrency } from '$lib/utils/currency';
	import { getBudgetStatus } from '$lib/utils/budget-status';
	import { Sparkles, Copy, AlertTriangle, X } from 'lucide-svelte';
	import MonthPicker from '$lib/components/MonthPicker.svelte';
	import CategoryBudgetList from '$lib/components/CategoryBudgetList.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { calculateBudgetAlerts, type BudgetAlert } from '$lib/utils/budget-alerts';

	// State
	let isLoading = $state(true);
	let hasLoadedOnce = false;
	let categories = $state<Category[]>([]);
	let budgets = $state<Map<number, CategoryBudget>>(new Map());
	let spending = $state<Map<number, number>>(new Map());
	let suggestions = $state<Map<number, number>>(new Map());
	let monthlyBudget = $state<MonthlyBudget | null>(null);
	let rollover = $state<RolloverResult | null>(null);
	let totalSaved = $state(0);
	let currentMonth = $state(getMonthKey(new Date()));
	let availableMonths = $state<string[]>([getMonthKey(new Date())]);

	// Summary calculations — scoped to budgeted categories only
	let totalBudgeted = $derived(
		sumCurrency(Array.from(budgets.values()).map((b) => b.budgetAmount))
	);
	let budgetedSpent = $derived(
		sumCurrency(Array.from(budgets.keys()).map((categoryId) => spending.get(categoryId) || 0))
	);
	// Effective total = base budgets + rollover surpluses − last month's overspend pool.
	// The income-allocation bar intentionally keeps the BASE total: carryovers are
	// funded by prior months' income, not this month's.
	let effectiveTotalBudgeted = $derived(rollover ? rollover.effectiveTotal : totalBudgeted);
	let budgetRemaining = $derived(roundCurrency(effectiveTotalBudgeted - budgetedSpent));
	let deficitMonthLabel = $derived(
		rollover ? format(parseMonthKey(rollover.prevMonth), 'MMMM') : ''
	);

	// Income allocation
	let income = $derived(monthlyBudget?.income ?? 0);
	let unallocated = $derived(roundCurrency(income - totalSaved - totalBudgeted));

	// Unbudgeted spending tracking (categories with spending but no budget set)
	let unbudgetedSpent = $derived(
		sumCurrency(
			Array.from(spending.entries())
				.filter(([categoryId]) => !budgets.has(categoryId))
				.map(([, amount]) => amount)
		)
	);
	let unbudgetedCategoryCount = $derived(
		Array.from(spending.entries())
			.filter(([categoryId, amount]) => !budgets.has(categoryId) && amount > 0)
			.length
	);

	// Check if there are suggestions to apply (categories with suggestions but no budget)
	let hasSuggestionsToApply = $derived.by(() => {
		for (const [categoryId, amount] of suggestions) {
			if (amount > 0 && !budgets.has(categoryId)) {
				return true;
			}
		}
		return false;
	});

	// Get previous month for "Copy from Last Month"
	let previousMonth = $derived(navigateMonth(currentMonth, -1));

	// Track dismissed budget alerts per month (stored in localStorage)
	let dismissedAlerts = $state<Set<string>>(new Set());

	function getDismissedAlertsKey(month: string): string {
		return `ledger-dismissed-budget-alerts-${month}`;
	}

	function loadDismissedAlerts(month: string) {
		try {
			const stored = localStorage.getItem(getDismissedAlertsKey(month));
			if (stored) {
				dismissedAlerts = new Set(JSON.parse(stored));
			} else {
				dismissedAlerts = new Set();
			}
		} catch {
			dismissedAlerts = new Set();
		}
	}

	function dismissAlert(alertType: string, categoryName: string) {
		const key = `${alertType}:${categoryName}`;
		dismissedAlerts.add(key);
		dismissedAlerts = new Set(dismissedAlerts); // Trigger reactivity
		localStorage.setItem(getDismissedAlertsKey(currentMonth), JSON.stringify([...dismissedAlerts]));
	}

	// Calculate budget alerts using utility function (handles floating point precision)
	let budgetAlerts = $derived.by(() => {
		const categoryBudgetData = Array.from(budgets.entries()).map(([categoryId, budget]) => {
			const category = categories.find((c) => c.id === categoryId);
			return {
				categoryId,
				categoryName: category?.name ?? 'Unknown',
				budgetAmount: rollover?.byCategory.get(categoryId)?.effective ?? budget.budgetAmount,
				spent: spending.get(categoryId) || 0
			};
		}).filter((data) => categories.some((c) => c.id === data.categoryId));

		return calculateBudgetAlerts(categoryBudgetData);
	});

	// Filter out dismissed alerts (key format: "alertType:categoryName")
	let visibleBudgetAlerts = $derived(
		budgetAlerts.filter((alert) => !dismissedAlerts.has(`${alert.type}:${alert.categoryName}`))
	);

	// Load data
	async function loadData() {
		if (!hasLoadedOnce) isLoading = true;
		try {
			await initializeStorage();
			currentMonth = getSelectedMonth();
			// Filter out Subscriptions category (removed in favor of subscription tags)
			const allCategories = await getAllCategories();
			categories = allCategories.filter((c) => c.name !== 'Subscriptions');
			availableMonths = await getAvailableMonths();

			// Ensure current month is in the list
			if (!availableMonths.includes(currentMonth)) {
				availableMonths = [currentMonth, ...availableMonths].sort().reverse();
			}

			await loadMonthData(currentMonth);
		} catch (error) {
			console.error('Failed to load budget data:', error);
			toast.error('Failed to load budget data');
		} finally {
			isLoading = false;
			hasLoadedOnce = true;
		}
	}

	// Fetch data for a month, then update all state atomically to prevent UI mismatch
	async function loadMonthData(month: string) {
		const [budgetList, spendingMap, suggestionMap, monthBudget, contributions, rolloverResult] = await Promise.all([
			getCategoryBudgetsForMonth(month),
			getAllCategorySpending(month),
			generateAllSuggestions(month),
			getBudgetForMonth(month),
			getContributionsAffectingAvailable(month),
			getEffectiveBudgetsForMonth(month)
		]);

		// Update all state atomically
		currentMonth = month;
		loadDismissedAlerts(month);
		budgets = new Map(budgetList.map((b) => [b.categoryId, b]));
		spending = spendingMap;
		suggestions = suggestionMap;
		monthlyBudget = monthBudget;
		rollover = rolloverResult;
		totalSaved = sumCurrency(contributions.map((c) => c.amount));
	}

	async function handleMonthChange(month: string) {
		setSelectedMonth(month);
		await loadMonthData(month);
	}

	async function handleSaveBudget(categoryId: number, amount: number) {
		try {
			await saveCategoryBudget(categoryId, currentMonth, amount);
			await loadMonthData(currentMonth);
			toast.success('Budget saved');
		} catch (error) {
			console.error('Failed to save budget:', error);
			toast.error('Failed to save budget');
		}
	}

	async function handleToggleRollover(categoryId: number, rollsOver: boolean) {
		try {
			await setCategoryBudgetRollover(categoryId, currentMonth, rollsOver);
			await loadMonthData(currentMonth);
		} catch (error) {
			console.error('Failed to update rollover:', error);
			toast.error('Failed to update rollover');
		}
	}

	async function handleDeleteBudget(categoryId: number) {
		try {
			await deleteCategoryBudget(categoryId, currentMonth);
			await loadMonthData(currentMonth);
			toast.success('Budget removed');
		} catch (error) {
			console.error('Failed to delete budget:', error);
			toast.error('Failed to delete budget');
		}
	}

	async function handleSuggestAll() {
		try {
			let applied = 0;
			for (const [categoryId, amount] of suggestions) {
				// Only apply to categories without existing budgets
				if (amount > 0 && !budgets.has(categoryId)) {
					await saveCategoryBudget(categoryId, currentMonth, amount);
					applied++;
				}
			}
			await loadMonthData(currentMonth);
			if (applied > 0) {
				toast.success(`Applied ${applied} budget suggestion${applied === 1 ? '' : 's'}`);
			} else {
				toast.info('No suggestions to apply');
			}
		} catch (error) {
			console.error('Failed to apply suggestions:', error);
			toast.error('Failed to apply suggestions');
		}
	}

	async function handleCopyFromLastMonth() {
		try {
			const previousBudgets = await getCategoryBudgetsForMonth(previousMonth);
			if (previousBudgets.length === 0) {
				toast.info('No budgets to copy from last month');
				return;
			}

			await copyBudgetsFromMonth(previousMonth, currentMonth);
			await loadMonthData(currentMonth);
			toast.success('Copied budgets from last month');
		} catch (error) {
			console.error('Failed to copy budgets:', error);
			toast.error('Failed to copy budgets');
		}
	}

	// Reload data on navigation (handles back/forward)
	afterNavigate(() => {
		loadData();
	});
</script>

<svelte:head>
	<title>Budget | Ledger</title>
</svelte:head>

<div class="min-h-screen">
	<main class="max-w-6xl mx-auto px-6 py-6" aria-live="polite">
		<!-- Title + month picker -->
		<div class="flex items-center justify-between mb-5">
			<h1 class="font-display text-2xl font-medium text-charcoal">Budget</h1>
			<MonthPicker
				{currentMonth}
				{availableMonths}
				onMonthChange={handleMonthChange}
			/>
		</div>
		{#if isLoading}
			<!-- Loading Skeleton -->
			<div class="space-y-6">
				<!-- Summary skeleton -->
				<div class="bg-surface rounded-xl shadow-md shadow-theme p-6">
					<Skeleton width="40%" height="1.5rem" class="mb-4" />
					<div class="flex gap-8">
						<Skeleton width="120px" height="2rem" />
						<Skeleton width="120px" height="2rem" />
					</div>
				</div>

				<!-- List skeleton -->
				<div class="space-y-2">
					{#each { length: 5 } as _, i}
						<div class="bg-surface rounded-lg shadow-sm shadow-theme p-4 flex items-center gap-4">
							<Skeleton width="40px" height="40px" class="rounded-lg" />
							<div class="flex-1">
								<Skeleton width="60%" height="1rem" class="mb-2" />
								<Skeleton width="100%" height="6px" class="rounded-full" />
							</div>
							<Skeleton width="80px" height="1rem" />
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_330px] gap-6 items-start">
				<!-- Main column: category budgets -->
				<div class="min-w-0 space-y-4 order-last lg:order-none">
				<!-- Quick Actions -->
				<div class="flex flex-wrap gap-3">
					<button
						onclick={handleSuggestAll}
						disabled={!hasSuggestionsToApply}
						class="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm
							transition-colors disabled:opacity-50 disabled:cursor-not-allowed
							{hasSuggestionsToApply
								? 'bg-primary-50 text-primary-700 hover:bg-primary-100'
								: 'bg-surface-alt text-charcoal-muted'}"
					>
						<Sparkles size={16} />
						Suggest All
					</button>
					<button
						onclick={handleCopyFromLastMonth}
						class="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm
							bg-surface-alt text-charcoal-soft hover:bg-surface-hover transition-colors"
					>
						<Copy size={16} />
						Copy from Last Month
					</button>
				</div>

				<!-- Category Budgets List -->
				<CategoryBudgetList
					{categories}
					{budgets}
					{spending}
					{suggestions}
					rollover={rollover?.byCategory}
					onSaveBudget={handleSaveBudget}
					onDeleteBudget={handleDeleteBudget}
					onToggleRollover={handleToggleRollover}
				/>
				</div>

				<!-- Right rail: summary & alerts -->
				<aside class="space-y-4 lg:sticky lg:top-6">
				<!-- Summary Card -->
				<div class="bg-surface rounded-xl shadow-md shadow-theme p-5">
					<h2 class="text-xs font-medium uppercase tracking-wider text-charcoal-muted mb-4">Budget Summary</h2>
					{#if totalBudgeted > 0}
						{@const overallStatus = getBudgetStatus(Math.round(budgetedSpent), Math.round(effectiveTotalBudgeted))}
						<div class="space-y-4">
							<div>
								<span class="text-sm text-charcoal-muted">Total Budgeted</span>
								<p class="font-mono text-xl font-medium text-charcoal">
									{formatCurrencyWhole(effectiveTotalBudgeted)}
								</p>
							</div>
							<div>
								<span class="text-sm text-charcoal-muted">Spent</span>
								<p class="font-mono text-xl font-medium text-charcoal">
									{formatCurrencyWhole(budgetedSpent)}
								</p>
								<p class="text-xs text-charcoal-muted font-mono">
									{Math.round(overallStatus.percentSpent)}% of budget
								</p>
							</div>
							<div>
								<span class="text-sm text-charcoal-muted">Remaining</span>
								<p
									class="font-mono text-xl font-medium {budgetRemaining >= 0
										? 'text-success-600'
										: 'text-danger-500'}"
								>
									{#if budgetRemaining < 0}
										{formatCurrencyWhole(Math.abs(budgetRemaining))}
										<span class="text-sm font-sans font-normal text-danger-500">over</span>
									{:else}
										{formatCurrencyWhole(budgetRemaining)}
									{/if}
								</p>
							</div>
							<div class="pt-1">
								<div
									class="h-2 bg-surface-alt rounded-full overflow-hidden shadow-[inset_0_1px_2px_rgba(45,42,38,0.08)]"
								>
									<div
										class="h-full rounded-full transition-all duration-500 ease-out {overallStatus.colorClass}"
										style="width: {overallStatus.displayPercent}%"
									></div>
								</div>
							</div>
						</div>
					{:else}
						<div class="space-y-4">
							<div>
								<span class="text-sm text-charcoal-muted">Total Budgeted</span>
								<p class="font-mono text-xl font-medium text-charcoal">
									{formatCurrencyWhole(effectiveTotalBudgeted)}
								</p>
							</div>
							<div>
								<span class="text-sm text-charcoal-muted">Spent</span>
								<p class="font-mono text-xl font-medium text-charcoal">
									{formatCurrencyWhole(budgetedSpent)}
								</p>
							</div>
						</div>
					{/if}

					{#if unbudgetedCategoryCount > 0}
						<p class="text-xs text-charcoal-muted mt-3">
							{formatCurrencyWhole(unbudgetedSpent)} spent in {unbudgetedCategoryCount} unbudgeted {unbudgetedCategoryCount === 1 ? 'category' : 'categories'}
						</p>
					{:else if totalBudgeted > 0}
						<p class="text-xs text-charcoal-muted mt-3">
							All categories with spending have budgets set
						</p>
					{/if}

					{#if rollover && rollover.deficitCarried > 0}
						<p class="text-xs text-warning-600 mt-2" title="Overspend on rollover categories reduces this month's overall budget rather than any single category">
							−{formatCurrencyWhole(rollover.deficitCarried)} overspend carried from {deficitMonthLabel} (already deducted)
						</p>
					{/if}

					{#if income > 0}
						{@const savingsPct = Math.min((totalSaved / income) * 100, 100)}
						{@const budgetedPct = Math.min((totalBudgeted / income) * 100, 100 - savingsPct)}
						{@const unallocatedPct = Math.max(0, 100 - savingsPct - budgetedPct)}
						<div class="mt-4 pt-4 border-t border-dashed border-theme-dashed">
							<div class="flex justify-between text-xs text-charcoal-muted mb-2">
								<span>Income Allocation</span>
								<span class="font-mono">{formatCurrencyWhole(income)} income</span>
							</div>
							<div
								class="h-4 bg-surface-alt rounded-full overflow-hidden shadow-[inset_0_1px_2px_rgba(45,42,38,0.08)] flex"
							>
								{#if savingsPct > 0}
									<div
										class="h-full bg-success-400 transition-all duration-500 ease-out {budgetedPct === 0 && unallocatedPct === 0 ? 'rounded-full' : 'rounded-l-full'}"
										style="width: {savingsPct}%"
									></div>
								{/if}
								{#if budgetedPct > 0}
									<div
										class="h-full bg-primary-400 transition-all duration-500 ease-out {savingsPct === 0 && unallocatedPct === 0 ? 'rounded-full' : savingsPct === 0 ? 'rounded-l-full' : ''} {unallocatedPct === 0 && savingsPct > 0 ? 'rounded-r-full' : ''}"
										style="width: {budgetedPct}%"
									></div>
								{/if}
								{#if unallocatedPct > 0}
									<div
										class="h-full bg-warning-300 transition-all duration-500 ease-out rounded-r-full {savingsPct === 0 && budgetedPct === 0 ? 'rounded-l-full' : ''}"
										style="width: {unallocatedPct}%"
									></div>
								{/if}
							</div>
							<div class="flex justify-between mt-2 text-xs">
								{#if totalSaved > 0}
									<span class="flex items-center gap-1 text-charcoal-muted">
										<span class="inline-block w-2 h-2 rounded-full bg-success-400"></span>
										Savings {formatCurrencyWhole(totalSaved)}
									</span>
								{/if}
								<span class="flex items-center gap-1 text-charcoal-muted">
									<span class="inline-block w-2 h-2 rounded-full bg-primary-400"></span>
									Budgeted {formatCurrencyWhole(totalBudgeted)}
								</span>
								<span class="flex items-center gap-1 {unallocated >= 0 ? 'text-charcoal-muted' : 'text-warning-600 font-medium'}">
									<span class="inline-block w-2 h-2 rounded-full {unallocated >= 0 ? 'bg-warning-300' : 'bg-warning-500'}"></span>
									{#if unallocated >= 0}
										Unallocated {formatCurrencyWhole(unallocated)}
									{:else}
										Over-allocated {formatCurrencyWhole(Math.abs(unallocated))}
									{/if}
								</span>
							</div>
						</div>
					{/if}
				</div>

				<!-- Budget Alerts (only shown when there are alerts) -->
				{#if visibleBudgetAlerts.length > 0}
					<div class="bg-surface rounded-xl shadow-md shadow-theme p-5 border-l-4 border-warning-500" transition:fade={{ duration: 200 }}>
						<div class="flex items-center gap-2 mb-3">
							<AlertTriangle size={18} class="text-warning-600" />
							<h3 class="font-medium text-charcoal">Budget Alerts</h3>
						</div>
						<ul class="space-y-2">
							{#each visibleBudgetAlerts as alert}
								<li class="flex items-center gap-3 text-sm group">
									{#if alert.type === 'over'}
										<span class="text-danger-600 flex-1">
											You're <span class="font-mono font-medium">{formatCurrencyWhole(alert.amount)}</span> over budget for {alert.categoryName}
										</span>
									{:else if alert.type === 'at'}
										<span class="text-warning-700 flex-1">
											You're at budget for {alert.categoryName}
										</span>
									{:else}
										<span class="text-warning-700 flex-1">
											You're approaching your budget for {alert.categoryName}
											<span class="text-charcoal-muted">({formatCurrencyWhole(alert.amount)} left)</span>
										</span>
									{/if}
									<button
										onclick={() => dismissAlert(alert.type, alert.categoryName)}
										class="p-1 rounded text-charcoal-muted hover:text-charcoal hover:bg-surface-alt transition-colors opacity-0 group-hover:opacity-100"
										title="Dismiss alert"
									>
										<X size={16} />
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
				</aside>
			</div>
		{/if}
	</main>
</div>
