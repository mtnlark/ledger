<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { getMonthKey, type Category, type CategoryBudget } from '$lib/db';
	import { initializeStorage } from '$lib/storage';
	import { getAllCategories } from '$lib/stores/categories';
	import {
		getCategoryBudgetsForMonth,
		saveCategoryBudget,
		deleteCategoryBudget,
		generateAllSuggestions,
		getAllCategorySpending
	} from '$lib/stores/categoryBudget';
	import { getSelectedMonth, setSelectedMonth } from '$lib/stores/selectedMonth';
	import { getAvailableMonths } from '$lib/stores/transactions';
	import { toast } from '$lib/stores/toast';
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

	// Load data
	async function loadData() {
		isLoading = true;
		try {
			await initializeStorage();
			currentMonth = getSelectedMonth();
			categories = await getAllCategories();
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
		const [budgetList, spendingMap, suggestionMap] = await Promise.all([
			getCategoryBudgetsForMonth(currentMonth),
			getAllCategorySpending(currentMonth),
			generateAllSuggestions(currentMonth)
		]);

		// Convert budget array to map by categoryId
		budgets = new Map(budgetList.map((b) => [b.categoryId, b]));
		spending = spendingMap;
		suggestions = suggestionMap;
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
						<div>
							<span class="text-sm text-charcoal-muted">Total Budgeted</span>
							<p class="font-mono text-xl font-medium text-charcoal">
								{formatCurrency(totalBudgeted)}
							</p>
						</div>
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
