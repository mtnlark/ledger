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
	import { Sparkles, Copy, AlertTriangle } from 'lucide-svelte';
	import HeaderNav from '$lib/components/HeaderNav.svelte';
	import MonthPicker from '$lib/components/MonthPicker.svelte';
	import CategoryBudgetList from '$lib/components/CategoryBudgetList.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';

	// State
	let isLoading = $state(true);
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

	// Calculate remaining to spend from monthly budget (income - saved - spent)
	let income = $derived(monthlyBudget?.income ?? 0);
	let saved = $derived(monthlyBudget?.savedAmount ?? 0);
	let available = $derived(income - saved);
	let remaining = $derived(available - totalSpent);

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

	// Calculate budget alerts
	const APPROACHING_THRESHOLD = 5; // Show "approaching" alert when within $5 of budget
	let budgetAlerts = $derived.by(() => {
		const alerts: Array<{
			type: 'over' | 'approaching';
			categoryName: string;
			categoryIcon: string;
			amount: number; // Over amount or remaining amount
		}> = [];

		for (const [categoryId, budget] of budgets) {
			const spent = spending.get(categoryId) || 0;
			const category = categories.find((c) => c.id === categoryId);
			if (!category) continue;

			const remaining = budget.budgetAmount - spent;

			if (remaining < 0) {
				// Over budget
				alerts.push({
					type: 'over',
					categoryName: category.name,
					categoryIcon: category.icon || '📦',
					amount: Math.abs(remaining)
				});
			} else if (remaining <= APPROACHING_THRESHOLD && remaining >= 0) {
				// Approaching budget (within $5)
				alerts.push({
					type: 'approaching',
					categoryName: category.name,
					categoryIcon: category.icon || '📦',
					amount: remaining
				});
			}
		}

		// Sort: over budget first, then approaching
		alerts.sort((a, b) => {
			if (a.type === 'over' && b.type !== 'over') return -1;
			if (a.type !== 'over' && b.type === 'over') return 1;
			return a.categoryName.localeCompare(b.categoryName);
		});

		return alerts;
	});

	// Load data
	async function loadData() {
		isLoading = true;
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

			await loadMonthData();
		} catch (error) {
			console.error('Failed to load budget data:', error);
			toast.error('Failed to load budget data');
		} finally {
			isLoading = false;
		}
	}

	async function loadMonthData() {
		const [budgetList, spendingMap, suggestionMap, monthBudget] = await Promise.all([
			getCategoryBudgetsForMonth(currentMonth),
			getAllCategorySpending(currentMonth),
			generateAllSuggestions(currentMonth),
			getBudgetForMonth(currentMonth)
		]);

		// Convert budget array to map by categoryId
		budgets = new Map(budgetList.map((b) => [b.categoryId, b]));
		spending = spendingMap;
		suggestions = suggestionMap;
		monthlyBudget = monthBudget;
	}

	async function handleMonthChange(month: string) {
		currentMonth = month;
		setSelectedMonth(month);
		await loadMonthData();
	}

	async function handleSaveBudget(categoryId: number, amount: number) {
		try {
			await saveCategoryBudget(categoryId, currentMonth, amount);
			await loadMonthData();
			toast.success('Budget saved');
		} catch (error) {
			console.error('Failed to save budget:', error);
			toast.error('Failed to save budget');
		}
	}

	async function handleDeleteBudget(categoryId: number) {
		try {
			await deleteCategoryBudget(categoryId, currentMonth);
			await loadMonthData();
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
			await loadMonthData();
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
			await loadMonthData();
			toast.success('Copied budgets from last month');
		} catch (error) {
			console.error('Failed to copy budgets:', error);
			toast.error('Failed to copy budgets');
		}
	}

	function formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 0,
			maximumFractionDigits: 0
		}).format(amount);
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
									{formatCurrency(remaining)}
								</p>
							</div>
							<div class="border-l border-theme pl-8">
								<span class="text-sm text-charcoal-muted">Total Budgeted</span>
								<p class="font-mono text-xl font-medium text-charcoal">
									{formatCurrency(totalBudgeted)}
								</p>
							</div>
						{:else}
							<div>
								<span class="text-sm text-charcoal-muted">Total Budgeted</span>
								<p class="font-mono text-xl font-medium text-charcoal">
									{formatCurrency(totalBudgeted)}
								</p>
							</div>
						{/if}
						<div>
							<span class="text-sm text-charcoal-muted">Budgeted Spent</span>
							<p
								class="font-mono text-xl font-medium {budgetedSpent > totalBudgeted
									? 'text-danger-500'
									: 'text-charcoal'}"
							>
								{formatCurrency(budgetedSpent)}
							</p>
						</div>
						<div>
							<span class="text-sm text-charcoal-muted">Total Spent</span>
							<p class="font-mono text-xl font-medium text-charcoal-soft">
								{formatCurrency(totalSpent)}
							</p>
						</div>
						{#if totalBudgeted > 0}
							<div class="border-l border-theme pl-8">
								<span class="text-sm text-charcoal-muted">Budget Status</span>
								<p
									class="font-mono text-xl font-medium {budgetedSpent <= totalBudgeted
										? 'text-success-600'
										: 'text-danger-500'}"
								>
									{formatCurrency(Math.abs(totalBudgeted - budgetedSpent))}
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
				{#if budgetAlerts.length > 0}
					<div class="bg-surface rounded-xl shadow-md shadow-theme p-5 border-l-4 border-warning-500">
						<div class="flex items-center gap-2 mb-3">
							<AlertTriangle size={18} class="text-warning-600" />
							<h3 class="font-medium text-charcoal">Budget Alerts</h3>
						</div>
						<ul class="space-y-2">
							{#each budgetAlerts as alert}
								<li class="flex items-center gap-3 text-sm">
									<span class="text-lg">{alert.categoryIcon}</span>
									{#if alert.type === 'over'}
										<span class="text-danger-600">
											You're <span class="font-mono font-medium">{formatCurrency(alert.amount)}</span> over budget for {alert.categoryName}
										</span>
									{:else}
										<span class="text-warning-700">
											You're approaching your budget for {alert.categoryName}
											<span class="text-charcoal-muted">({formatCurrency(alert.amount)} left)</span>
										</span>
									{/if}
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
