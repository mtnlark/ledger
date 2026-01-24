<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { getMonthKey, navigateMonth, type Category, type CategoryBudget, type MonthlyBudget } from '$lib/db';
	import { initializeStorage } from '$lib/storage';
	import { getAllCategories } from '$lib/stores/categories';
	import {
		getCategoryBudgetsForMonth,
		saveCategoryBudget,
		deleteCategoryBudget,
		generateAllSuggestions,
		getAllCategorySpending,
		copyBudgetsFromMonth
	} from '$lib/stores/categoryBudget';
	import { getBudgetForMonth } from '$lib/stores/budget';
	import { getSelectedMonth, setSelectedMonth } from '$lib/stores/selectedMonth';
	import { getAvailableMonths } from '$lib/stores/transactions';
	import { toast } from '$lib/stores/toast';
	import { formatCurrencyWhole } from '$lib/utils/modal-helpers';
	import { Sparkles, Copy, AlertTriangle, X } from 'lucide-svelte';
	import HeaderNav from '$lib/components/HeaderNav.svelte';
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
	let currentMonth = $state(getMonthKey(new Date()));
	let availableMonths = $state<string[]>([getMonthKey(new Date())]);

	// Summary calculations
	let totalBudgeted = $derived(
		Array.from(budgets.values()).reduce((sum, b) => sum + b.budgetAmount, 0)
	);
	let totalSpent = $derived(Array.from(spending.values()).reduce((sum, s) => sum + s, 0));
	let budgetedSpent = $derived(
		Array.from(budgets.keys()).reduce((sum, categoryId) => sum + (spending.get(categoryId) || 0), 0)
	);
	let unbudgetedSpent = $derived(totalSpent - budgetedSpent);

	// Calculate remaining to spend from monthly budget (income - saved - spent)
	let income = $derived(monthlyBudget?.income ?? 0);
	let saved = $derived(monthlyBudget?.savedAmount ?? 0);
	let available = $derived(income - saved);
	let remaining = $derived(available - totalSpent);

	// Calculate unallocated: available money not assigned to any budget category
	let unallocated = $derived(available - totalBudgeted);

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
				categoryIcon: category?.icon ?? '📦',
				budgetAmount: budget.budgetAmount,
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
		const [budgetList, spendingMap, suggestionMap, monthBudget] = await Promise.all([
			getCategoryBudgetsForMonth(month),
			getAllCategorySpending(month),
			generateAllSuggestions(month),
			getBudgetForMonth(month)
		]);

		// Update all state atomically
		currentMonth = month;
		loadDismissedAlerts(month);
		budgets = new Map(budgetList.map((b) => [b.categoryId, b]));
		spending = spendingMap;
		suggestions = suggestionMap;
		monthlyBudget = monthBudget;
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

<div class="min-h-screen bg-cream-subtle">
	<HeaderNav title="Budget">
		<MonthPicker
			{currentMonth}
			{availableMonths}
			onMonthChange={handleMonthChange}
		/>
	</HeaderNav>

	<main class="pt-20 pb-8 px-6 max-w-4xl mx-auto">
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
			<div class="space-y-6">
				<!-- Summary Card -->
				<div class="bg-surface rounded-xl shadow-md shadow-theme p-6">
					<h2 class="font-display text-lg font-medium text-charcoal mb-4">Budget Summary</h2>
					<div class="flex flex-wrap gap-x-8 gap-y-4">
						{#if monthlyBudget}
							<div>
								<span class="text-sm text-charcoal-muted">Remaining to Spend</span>
								<p
									class="font-mono text-xl font-medium {remaining >= 0
										? 'text-success-600'
										: 'text-danger-500'}"
								>
									{formatCurrencyWhole(remaining)}
								</p>
							</div>
							<div class="border-l border-theme pl-8">
								<span class="text-sm text-charcoal-muted">Total Budgeted</span>
								<p class="font-mono text-xl font-medium text-charcoal">
									{formatCurrencyWhole(totalBudgeted)}
								</p>
							</div>
						{:else}
							<div>
								<span class="text-sm text-charcoal-muted">Total Budgeted</span>
								<p class="font-mono text-xl font-medium text-charcoal">
									{formatCurrencyWhole(totalBudgeted)}
								</p>
							</div>
						{/if}
						<div>
							<span class="text-sm text-charcoal-muted">Total Spent</span>
							<p class="font-mono text-xl font-medium text-charcoal">
								{formatCurrencyWhole(totalSpent)}
							</p>
							{#if unbudgetedSpent > 0}
								<p class="text-xs text-charcoal-muted mt-0.5">
									incl. {formatCurrencyWhole(unbudgetedSpent)} unbudgeted
								</p>
							{/if}
						</div>
						{#if monthlyBudget}
							<div class="border-l border-theme pl-8">
								<span class="text-sm text-charcoal-muted">Unallocated</span>
								<p
									class="font-mono text-xl font-medium {unallocated >= 0
										? 'text-charcoal'
										: 'text-warning-600'}"
								>
									{formatCurrencyWhole(Math.abs(unallocated))}
									{#if unallocated < 0}
										<span class="text-sm font-sans font-normal text-warning-600">
											over-allocated
										</span>
									{/if}
								</p>
							</div>
						{/if}
						{#if totalBudgeted > 0}
							<div class="border-l border-theme pl-8">
								<span class="text-sm text-charcoal-muted">Budget Status</span>
								<p
									class="font-mono text-xl font-medium {budgetedSpent <= totalBudgeted
										? 'text-success-600'
										: 'text-danger-500'}"
								>
									{formatCurrencyWhole(Math.abs(totalBudgeted - budgetedSpent))}
									<span class="text-sm font-sans font-normal {budgetedSpent <= totalBudgeted
										? 'text-success-600'
										: 'text-danger-500'}">
										{budgetedSpent <= totalBudgeted ? 'under' : 'over'}
									</span>
								</p>
							</div>
						{/if}
					</div>

					{#if totalBudgeted > 0}
						<div class="mt-4 pt-4 border-t border-dashed border-theme-dashed">
							<div class="flex justify-between text-xs text-charcoal-muted mb-2">
								<span>Overall Progress</span>
								<span class="font-mono">
									{Math.round((budgetedSpent / totalBudgeted) * 100)}% of budgeted
								</span>
							</div>
							<div
								class="h-2.5 bg-surface-alt rounded-full overflow-hidden shadow-[inset_0_1px_2px_rgba(45,42,38,0.08)]"
							>
								<div
									class="h-full rounded-full transition-all duration-500 ease-out {budgetedSpent >
									totalBudgeted
										? 'bg-gradient-to-r from-danger-300 to-danger-500'
										: budgetedSpent > totalBudgeted * 0.8
											? 'bg-gradient-to-r from-warning-300 to-warning-500'
											: 'bg-gradient-to-r from-success-200 to-success-500'}"
									style="width: {Math.min(100, (budgetedSpent / totalBudgeted) * 100)}%"
								></div>
							</div>
						</div>
					{/if}
				</div>

				<!-- Budget Alerts (only shown when there are alerts) -->
				{#if visibleBudgetAlerts.length > 0}
					<div class="bg-surface rounded-xl shadow-md shadow-theme p-5 border-l-4 border-warning-500">
						<div class="flex items-center gap-2 mb-3">
							<AlertTriangle size={18} class="text-warning-600" />
							<h3 class="font-medium text-charcoal">Budget Alerts</h3>
						</div>
						<ul class="space-y-2">
							{#each visibleBudgetAlerts as alert}
								<li class="flex items-center gap-3 text-sm group">
									<span class="text-lg">{alert.categoryIcon}</span>
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
					onSaveBudget={handleSaveBudget}
					onDeleteBudget={handleDeleteBudget}
				/>
			</div>
		{/if}
	</main>
</div>
