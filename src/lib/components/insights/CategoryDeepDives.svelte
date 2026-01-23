<script lang="ts">
	import { format } from 'date-fns';
	import { parseMonthKey, navigateMonth } from '$lib/db';
	import type { Transaction, Category } from '$lib/db';
	import { getCategoryTrends, getTransactionsByMonth } from '$lib/stores/transactions';
	import { getInsightsEngine } from '$lib/insights';
	import { computeCategoryDeepDiveShift } from '$lib/insights/calculations';
	import InsightGroup from './InsightGroup.svelte';
	import InsightMetric from './InsightMetric.svelte';
	import CategoryTrendsChart from './CategoryTrendsChart.svelte';
	import CategoryComparison from './CategoryComparison.svelte';
	import CategoryBreakdownChart from '../CategoryBreakdownChart.svelte';

	interface Props {
		currentMonth: string;
		transactions: Transaction[];
		categories: Category[];
		availableMonths: string[];
	}

	let { currentMonth, transactions, categories, availableMonths }: Props = $props();

	const engine = getInsightsEngine();

	// Selected category for trends chart
	let selectedCategoryId = $state<number | null>(null);
	let categoryTrendData = $state<Map<string, number>>(new Map());
	let previousTransactions = $state<Transaction[]>([]);

	// Calculate spending by category for current month
	let categorySpending = $derived(engine.getSpendingByCategory(transactions, currentMonth));

	// Get all categories sorted alphabetically
	let sortedCategories = $derived(
		[...categories].sort((a, b) => a.name.localeCompare(b.name))
	);

	// Track if user has manually selected a category
	let hasUserSelected = $state(false);
	let lastMonth = $state(currentMonth);

	// Reset user selection when month changes
	$effect(() => {
		if (currentMonth !== lastMonth) {
			hasUserSelected = false;
			lastMonth = currentMonth;
		}
	});

	// Set default selected category to the most anomalous (topChange) if available
	$effect(() => {
		// Only auto-select if user hasn't manually chosen
		if (!hasUserSelected && sortedCategories.length > 0) {
			if (topChange) {
				// Default to the most anomalous category
				const anomalousCat = categories.find((c) => c.name === topChange.name);
				if (anomalousCat?.id && selectedCategoryId !== anomalousCat.id) {
					selectedCategoryId = anomalousCat.id;
				}
			} else if (selectedCategoryId === null) {
				// Fallback to first category if no trend data yet
				selectedCategoryId = sortedCategories[0].id!;
			}
		}
	});

	// Load category trend data when selection changes
	$effect(() => {
		if (selectedCategoryId !== null && availableMonths.length > 0) {
			loadCategoryTrends();
		}
	});

	// Load previous month transactions for comparison when month changes
	$effect(() => {
		// Explicitly read currentMonth to track it as a dependency
		const prevMonth = navigateMonth(currentMonth, -1);
		loadPreviousMonth(prevMonth);
	});

	async function loadCategoryTrends() {
		if (selectedCategoryId === null) return;
		categoryTrendData = await getCategoryTrends(selectedCategoryId, availableMonths);
	}

	async function loadPreviousMonth(prevMonth: string) {
		previousTransactions = await getTransactionsByMonth(prevMonth);
	}

	// Get selected category details
	let selectedCategory = $derived(categories.find((c) => c.id === selectedCategoryId));

	// Calculate top changing category for preview (by largest absolute dollar change)
	// Uses the pure function directly (not engine-memoized) because previousTransactions
	// is async component-local state that changes independently of TransactionCache.version.
	let topChange = $derived(
		computeCategoryDeepDiveShift(transactions, previousTransactions, categories)
	);

	let previousMonth = $derived(navigateMonth(currentMonth, -1));
</script>

<InsightGroup title="Category Deep Dives" description="Analyze spending patterns by category">
	{#snippet preview()}
		<div class="flex items-center justify-between">
			{#if topChange}
				{@const diff = topChange.current - topChange.previous}
				<div class="flex items-center gap-2">
					<span class="text-xl">{topChange.icon}</span>
					<div>
						<p class="text-sm font-medium text-charcoal">{topChange.name}</p>
						<p class="text-xs text-charcoal-muted">
							{#if topChange.previous > 0}
								{diff > 0 ? '+' : ''}{topChange.changePercent.toFixed(0)}% vs last month
							{:else}
								new this month
							{/if}
						</p>
					</div>
				</div>
				<div class="text-right">
					<p class="text-lg font-semibold text-charcoal font-mono">
						${topChange.current.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
					</p>
					<p class="text-xs text-charcoal-muted">
						{diff > 0 ? '+' : ''}{diff < 0 ? '-' : ''}${Math.abs(diff).toFixed(0)} vs last month
					</p>
				</div>
			{:else}
				<p class="text-sm text-charcoal-muted">Select a category to view trends</p>
			{/if}
		</div>
	{/snippet}

	{#snippet children()}
		<div class="space-y-6">
			<!-- Category Breakdown Chart -->
			<CategoryBreakdownChart {transactions} {categories} />

			<!-- Category Selector for Trends -->
			<div>
				<label for="category-select" class="block text-sm font-medium text-charcoal-soft mb-2">
					Explore Category Trends
				</label>
				<select
					id="category-select"
					bind:value={selectedCategoryId}
					onchange={() => hasUserSelected = true}
					class="w-full px-3 py-2 bg-surface border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-charcoal"
				>
					{#each sortedCategories as cat}
						{@const spent = categorySpending.get(cat.id!) || 0}
						<option value={cat.id}>
							{cat.icon} {cat.name}{spent > 0 ? ` ($${spent.toLocaleString()})` : ''}
						</option>
					{/each}
				</select>
			</div>

			<!-- Category Trends Chart -->
			{#if selectedCategory && categoryTrendData.size > 0}
				<div>
					<h3 class="text-sm font-medium text-charcoal-soft mb-3">
						{selectedCategory.icon} {selectedCategory.name} Over Time
					</h3>
					<CategoryTrendsChart
						categoryName={selectedCategory.name}
						categoryColor={selectedCategory.color || '#3b82f6'}
						trendData={categoryTrendData}
					/>
				</div>
			{/if}

			<!-- Category Comparison -->
			<div>
				<h3 class="text-sm font-medium text-charcoal-soft mb-3">
					{format(parseMonthKey(currentMonth), 'MMMM')} vs {format(parseMonthKey(previousMonth), 'MMMM')}
				</h3>
				<CategoryComparison
					{currentMonth}
					previousMonth={previousMonth}
					currentTransactions={transactions}
					{previousTransactions}
					{categories}
				/>
			</div>
		</div>
	{/snippet}
</InsightGroup>
