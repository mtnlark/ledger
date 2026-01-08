<script lang="ts">
	import { Search, Filter, X, ChevronDown, ChevronUp } from 'lucide-svelte';
	import { slide } from 'svelte/transition';
	import type { Category } from '$lib/db';

	export interface FilterState {
		searchQuery: string;
		categoryId: number | null;
		dateFrom: string;
		dateTo: string;
	}

	interface Props {
		categories: Category[];
		filters: FilterState;
		onFilterChange: (filters: FilterState) => void;
		resultCount?: number;
		totalCount?: number;
	}

	let { categories, filters, onFilterChange, resultCount, totalCount }: Props = $props();

	// Local UI state
	let showAdvanced = $state(false);

	// Check if any filters are active (derived from props)
	let hasActiveFilters = $derived(
		filters.searchQuery.trim() !== '' ||
		filters.categoryId !== null ||
		filters.dateFrom !== '' ||
		filters.dateTo !== ''
	);

	let hasAdvancedFilters = $derived(
		filters.categoryId !== null ||
		filters.dateFrom !== '' ||
		filters.dateTo !== ''
	);

	// Debounce search input
	let searchTimeout: ReturnType<typeof setTimeout>;

	function handleSearchInput(value: string) {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			onFilterChange({ ...filters, searchQuery: value });
		}, 200);
	}

	function handleCategoryChange(value: string) {
		const categoryId = value === '' ? null : parseInt(value);
		onFilterChange({ ...filters, categoryId });
	}

	function handleDateFromChange(value: string) {
		onFilterChange({ ...filters, dateFrom: value });
	}

	function handleDateToChange(value: string) {
		onFilterChange({ ...filters, dateTo: value });
	}

	function clearFilters() {
		onFilterChange({
			searchQuery: '',
			categoryId: null,
			dateFrom: '',
			dateTo: ''
		});
	}

	function clearSearch() {
		onFilterChange({ ...filters, searchQuery: '' });
	}
</script>

<div class="bg-white rounded-xl shadow-md shadow-gray-200/50 overflow-hidden">
	<!-- Search Bar -->
	<div class="px-4 py-3">
		<div class="relative">
			<Search size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-muted" />
			<input
				type="text"
				placeholder="Search transactions..."
				value={filters.searchQuery}
				oninput={(e) => handleSearchInput(e.currentTarget.value)}
				class="w-full pl-10 pr-10 py-2.5 bg-cream rounded-lg border border-transparent focus:border-primary-300 focus:ring-2 focus:ring-primary-100 focus:bg-white transition-all text-charcoal placeholder:text-charcoal-muted/60"
			/>
			{#if filters.searchQuery}
				<button
					onclick={clearSearch}
					class="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal-muted hover:text-charcoal transition-colors"
				>
					<X size={18} />
				</button>
			{/if}
		</div>
	</div>

	<!-- Filter Toggle -->
	<button
		onclick={() => showAdvanced = !showAdvanced}
		class="w-full px-4 py-2 flex items-center justify-between text-sm text-charcoal-muted hover:bg-cream/50 transition-colors border-t border-dashed border-gray-200"
	>
		<div class="flex items-center gap-2">
			<Filter size={16} />
			<span>Filters</span>
			{#if hasAdvancedFilters}
				<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-100 text-primary-600">
					Active
				</span>
			{/if}
		</div>
		{#if showAdvanced}
			<ChevronUp size={16} />
		{:else}
			<ChevronDown size={16} />
		{/if}
	</button>

	<!-- Advanced Filters (collapsible) -->
	{#if showAdvanced}
		<div transition:slide={{ duration: 150 }} class="px-4 pb-4 pt-2 border-t border-dashed border-gray-200 space-y-3">
			<!-- Category Filter -->
			<div>
				<label for="category-filter" class="block text-xs font-medium text-charcoal-muted mb-1">Category</label>
				<select
					id="category-filter"
					value={filters.categoryId ?? ''}
					onchange={(e) => handleCategoryChange(e.currentTarget.value)}
					class="w-full px-3 py-2 bg-cream rounded-lg border border-transparent focus:border-primary-300 focus:ring-2 focus:ring-primary-100 focus:bg-white transition-all text-charcoal"
				>
					<option value="">All categories</option>
					{#each categories.filter(c => c.isActive) as category (category.id)}
						<option value={category.id}>
							{category.icon} {category.name}
						</option>
					{/each}
				</select>
			</div>

			<!-- Date Range -->
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label for="date-from" class="block text-xs font-medium text-charcoal-muted mb-1">From</label>
					<input
						id="date-from"
						type="date"
						value={filters.dateFrom}
						onchange={(e) => handleDateFromChange(e.currentTarget.value)}
						class="w-full px-3 py-2 bg-cream rounded-lg border border-transparent focus:border-primary-300 focus:ring-2 focus:ring-primary-100 focus:bg-white transition-all text-charcoal"
					/>
				</div>
				<div>
					<label for="date-to" class="block text-xs font-medium text-charcoal-muted mb-1">To</label>
					<input
						id="date-to"
						type="date"
						value={filters.dateTo}
						onchange={(e) => handleDateToChange(e.currentTarget.value)}
						class="w-full px-3 py-2 bg-cream rounded-lg border border-transparent focus:border-primary-300 focus:ring-2 focus:ring-primary-100 focus:bg-white transition-all text-charcoal"
					/>
				</div>
			</div>
		</div>
	{/if}

	<!-- Results count & Clear button -->
	{#if hasActiveFilters}
		<div class="px-4 py-2.5 bg-cream/50 border-t border-dashed border-gray-200 flex items-center justify-between">
			<span class="text-sm text-charcoal-muted">
				{#if resultCount !== undefined && totalCount !== undefined}
					Showing <span class="font-mono font-medium text-charcoal">{resultCount}</span> of {totalCount} transactions
				{:else}
					Filters applied
				{/if}
			</span>
			<button
				onclick={clearFilters}
				class="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
			>
				Clear all
			</button>
		</div>
	{/if}
</div>
