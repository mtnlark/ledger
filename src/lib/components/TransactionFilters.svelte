<script lang="ts">
	import { Search, Filter, X, ChevronDown, Globe, BarChart3 } from 'lucide-svelte';
	import { slide } from 'svelte/transition';
	import type { Category, Transaction } from '$lib/db';
	import { tagIndex } from '$lib/stores/tags.svelte';
	import { renameTag, deleteTag } from '$lib/stores/transactions';
	import { calculateTagTotal } from '$lib/utils/tags';
	import { formatCurrency } from '$lib/utils/format-helpers';

	export type SharedStatusFilter = '' | 'shared' | 'pending' | 'settled' | 'personal';

	export interface FilterState {
		searchQuery: string;
		categoryId: number | null;
		dateFrom: string;
		dateTo: string;
		searchAllTime: boolean;
		tags: string[];
		amountMin: string;
		amountMax: string;
		sharedStatus: SharedStatusFilter;
	}

	interface Props {
		categories: Category[];
		filters: FilterState;
		onFilterChange: (filters: FilterState) => void;
		resultCount?: number;
		totalCount?: number;
		allTimeCount?: number;
		onSearchInputRef?: (el: HTMLInputElement | null) => void;
		allTransactions?: Transaction[];
		onTagsChanged?: () => void;
		/** Opens the tag report card. */
		onTagReport?: (tag: string) => void;
	}

	let { categories, filters, onFilterChange, resultCount, totalCount, allTimeCount, onSearchInputRef, allTransactions = [], onTagsChanged, onTagReport }: Props = $props();

	let searchInput = $state<HTMLInputElement | null>(null);

	// Report the search input ref to parent when it changes
	$effect(() => {
		onSearchInputRef?.(searchInput);
	});

	let showAdvanced = $state(false);
	let showManageTags = $state(false);
	let editingTag = $state<string | null>(null);
	let editValue = $state('');
	let confirmingDelete = $state<string | null>(null);
	let isProcessing = $state(false);

	// Local search input state — updates immediately while debouncing parent callback.
	// In Svelte 5, value={expr} resets the DOM input when the component re-renders for
	// any reason. Using bind:value with local state prevents keystroke loss during debounce.
	// svelte-ignore state_referenced_locally
	let localSearchQuery = $state(filters.searchQuery);
	// svelte-ignore state_referenced_locally
	let lastSentQuery = filters.searchQuery;

	// Sync from parent only on external changes (e.g., Clear All, tag click filter)
	$effect(() => {
		const parentQuery = filters.searchQuery;
		if (parentQuery !== lastSentQuery) {
			localSearchQuery = parentQuery;
			lastSentQuery = parentQuery;
		}
	});

	// Available tags for filtering
	let availableTags = $derived(tagIndex.getAllTags());

	// Check if any filters are active (derived from props)
	let hasActiveFilters = $derived(
		filters.searchQuery.trim() !== '' ||
		filters.categoryId !== null ||
		filters.dateFrom !== '' ||
		filters.dateTo !== '' ||
		filters.searchAllTime ||
		filters.tags.length > 0 ||
		filters.amountMin !== '' ||
		filters.amountMax !== '' ||
		filters.sharedStatus !== ''
	);

	let hasAdvancedFilters = $derived(
		filters.categoryId !== null ||
		filters.dateFrom !== '' ||
		filters.dateTo !== '' ||
		filters.tags.length > 0 ||
		filters.amountMin !== '' ||
		filters.amountMax !== '' ||
		filters.sharedStatus !== ''
	);

	// Debounce search input — local state updates immediately, parent after 200ms
	let searchTimeout: ReturnType<typeof setTimeout>;

	function handleSearchInput(value: string) {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			lastSentQuery = value;
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
		clearTimeout(searchTimeout);
		localSearchQuery = '';
		lastSentQuery = '';
		onFilterChange({
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
	}

	function toggleSearchAllTime() {
		onFilterChange({ ...filters, searchAllTime: !filters.searchAllTime });
	}

	function clearSearch() {
		clearTimeout(searchTimeout);
		localSearchQuery = '';
		lastSentQuery = '';
		onFilterChange({ ...filters, searchQuery: '' });
	}

	async function handleRename(oldTag: string): Promise<void> {
		const newTag = editValue.trim().toLowerCase();
		if (!newTag || newTag === oldTag || !/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(newTag)) {
			editingTag = null;
			return;
		}
		isProcessing = true;
		try {
			await renameTag(oldTag, newTag);
			onTagsChanged?.();
		} finally {
			editingTag = null;
			isProcessing = false;
		}
	}

	async function handleDelete(tag: string): Promise<void> {
		isProcessing = true;
		try {
			await deleteTag(tag);
			onTagsChanged?.();
			if (filters.tags.includes(tag)) {
				onFilterChange({ ...filters, tags: filters.tags.filter(t => t !== tag) });
			}
		} finally {
			confirmingDelete = null;
			isProcessing = false;
		}
	}

	function startEdit(tag: string): void {
		editingTag = tag;
		editValue = tag;
	}

	function handleEditKeydown(e: KeyboardEvent, tag: string): void {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleRename(tag);
		} else if (e.key === 'Escape') {
			editingTag = null;
		}
	}
</script>

<div class="space-y-2">
	<!-- Toolbar: search + scope + filters toggle -->
	<div class="flex gap-2">
			<div class="relative flex-1">
				<Search size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-muted pointer-events-none" />
				<input
					type="text"
					bind:this={searchInput}
					placeholder="Search merchants & notes..."
					aria-label="Search transactions"
					bind:value={localSearchQuery}
					oninput={(e) => handleSearchInput(e.currentTarget.value)}
					class="w-full pl-10 pr-10 py-2 bg-surface rounded-lg border border-theme focus:border-primary-300 transition-all text-charcoal placeholder:text-charcoal-muted/60"
				/>
				{#if localSearchQuery}
					<button
						onclick={clearSearch}
						aria-label="Clear search"
						class="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal-muted hover:text-charcoal transition-colors"
					>
						<X size={18} />
					</button>
				{/if}
			</div>
			<!-- All Time Toggle -->
			<button
				onclick={toggleSearchAllTime}
				title={filters.searchAllTime ? "Searching all time" : "Search all time"}
				class="flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-all text-sm font-medium whitespace-nowrap {filters.searchAllTime
					? 'bg-primary-100 border-primary-300 text-primary-700'
					: 'bg-surface border-theme text-charcoal-muted hover:text-charcoal'}"
			>
				<Globe size={16} />
				<span class="hidden sm:inline">All Time</span>
			</button>

			<!-- Filters Toggle -->
			<button
				onclick={() => showAdvanced = !showAdvanced}
				class="flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-all text-sm font-medium whitespace-nowrap {showAdvanced || hasAdvancedFilters
					? 'bg-primary-100 border-primary-300 text-primary-700'
					: 'bg-surface border-theme text-charcoal-muted hover:text-charcoal'}"
				aria-expanded={showAdvanced}
			>
				<Filter size={16} />
				<span class="hidden sm:inline">Filters</span>
				{#if hasAdvancedFilters}
					<span class="w-1.5 h-1.5 rounded-full bg-primary-500" aria-hidden="true"></span>
				{/if}
				<ChevronDown size={14} class="transition-transform {showAdvanced ? 'rotate-180' : ''}" />
			</button>
	</div>

	<!-- Advanced Filters (collapsible) -->
	{#if showAdvanced}
		<div transition:slide={{ duration: 150 }} class="bg-surface rounded-xl shadow-sm shadow-theme p-4 space-y-3">
			<!-- Category Filter -->
			<div>
				<label for="category-filter" class="block text-xs font-medium text-charcoal-muted mb-1">Category</label>
				<select
					id="category-filter"
					value={filters.categoryId ?? ''}
					onchange={(e) => handleCategoryChange(e.currentTarget.value)}
					class="w-full px-3 py-2 bg-cream rounded-lg border border-transparent focus:border-primary-300 focus:ring-2 focus:ring-primary-100 focus:bg-surface transition-all text-charcoal"
				>
					<option value="">All categories</option>
					{#each categories.filter(c => c.isActive) as category (category.id)}
						<option value={category.id}>
							{category.icon} {category.name}
						</option>
					{/each}
				</select>
			</div>

			<!-- Shared Status Filter -->
			<div>
				<label for="shared-filter" class="block text-xs font-medium text-charcoal-muted mb-1">Shared status</label>
				<select
					id="shared-filter"
					value={filters.sharedStatus}
					onchange={(e) => onFilterChange({ ...filters, sharedStatus: e.currentTarget.value as SharedStatusFilter })}
					class="w-full px-3 py-2 bg-cream rounded-lg border border-transparent focus:border-primary-300 focus:ring-2 focus:ring-primary-100 focus:bg-surface transition-all text-charcoal"
				>
					<option value="">All transactions</option>
					<option value="shared">Shared (any)</option>
					<option value="pending">Shared · pending settlement</option>
					<option value="settled">Shared · settled</option>
					<option value="personal">Not shared</option>
				</select>
			</div>

			<!-- Tag Filter -->
			<div>
				<div class="flex items-center justify-between mb-1">
					<label for="tag-filter" class="block text-xs font-medium text-charcoal-muted">Tags</label>
					{#if availableTags.length > 0 && !showManageTags}
						<button
							type="button"
							onclick={() => showManageTags = true}
							class="text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors"
						>
							Manage tags
						</button>
					{/if}
				</div>

				{#if showManageTags}
					<!-- Manage Tags Section -->
					<div class="space-y-1">
						<div class="flex items-center justify-between mb-2">
							<span class="text-xs font-medium text-charcoal-muted">Manage Tags</span>
							<button
								type="button"
								onclick={() => { showManageTags = false; editingTag = null; confirmingDelete = null; }}
								class="text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors"
							>
								Done
							</button>
						</div>
						{#each availableTags as tag (tag)}
							<div class="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-surface-hover/50 group">
								{#if editingTag === tag}
									<input
										type="text"
										bind:value={editValue}
										onblur={() => { if (!isProcessing) handleRename(tag); }}
										onkeydown={(e) => handleEditKeydown(e, tag)}
										disabled={isProcessing}
										class="flex-1 px-2 py-1 text-sm bg-surface border border-primary-300 rounded focus:ring-2 focus:ring-primary-100 focus:outline-none"
									/>
								{:else if confirmingDelete === tag}
									<span class="flex-1 text-sm text-charcoal">
										Remove from {tagIndex.getTransactionCountForTag(tag)} transactions?
									</span>
									<button
										type="button"
										onclick={() => handleDelete(tag)}
										disabled={isProcessing}
										class="text-xs text-danger-600 hover:text-danger-700 font-medium"
									>
										Confirm
									</button>
									<button
										type="button"
										onclick={() => confirmingDelete = null}
										class="text-xs text-charcoal-muted hover:text-charcoal font-medium"
									>
										Cancel
									</button>
								{:else}
									<button
										type="button"
										onclick={() => startEdit(tag)}
										class="flex-1 text-left text-sm text-charcoal hover:text-primary-600 transition-colors"
										title="Click to rename"
									>
										{tag}
									</button>
									<span class="text-xs text-charcoal-muted font-mono">
										{tagIndex.getTransactionCountForTag(tag)} txns · {formatCurrency(calculateTagTotal(allTransactions, tag))}
									</span>
									<button
										type="button"
										onclick={() => confirmingDelete = tag}
										class="opacity-0 group-hover:opacity-100 text-charcoal-muted hover:text-danger-500 transition-all"
										title="Delete tag"
										aria-label="Delete tag {tag}"
									>
										<X size={14} />
									</button>
								{/if}
							</div>
						{/each}
					</div>
				{:else}
					<!-- Normal Tag Selection -->
					<select
						id="tag-filter"
						value=""
						onchange={(e) => {
							const tag = e.currentTarget.value;
							if (tag && !filters.tags.includes(tag)) {
								onFilterChange({ ...filters, tags: [...filters.tags, tag] });
							}
							e.currentTarget.value = '';
						}}
						class="w-full px-3 py-2 bg-cream rounded-lg border border-transparent focus:border-primary-300 focus:ring-2 focus:ring-primary-100 focus:bg-surface transition-all text-charcoal"
					>
						<option value="">Add tag filter...</option>
						{#each availableTags as tag (tag)}
							{#if !filters.tags.includes(tag)}
								<option value={tag}>
									{tag} ({tagIndex.getTransactionCountForTag(tag)})
								</option>
							{/if}
						{/each}
					</select>
				{/if}

				{#if filters.tags.length > 0}
					<div class="flex flex-wrap gap-1 mt-2">
						{#each filters.tags as tag (tag)}
							<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700">
								{tag}
								{#if onTagReport}
									<button
										type="button"
										onclick={() => onTagReport?.(tag)}
										aria-label="View {tag} report"
										title="View tag report"
										class="hover:text-primary-900"
									>
										<BarChart3 size={12} />
									</button>
								{/if}
								<button
									type="button"
									onclick={() => onFilterChange({ ...filters, tags: filters.tags.filter(t => t !== tag) })}
									aria-label="Remove {tag} filter"
									class="hover:text-primary-900"
								>
									<X size={12} />
								</button>
							</span>
						{/each}
					</div>
				{/if}
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
						class="w-full px-3 py-2 bg-cream rounded-lg border border-transparent focus:border-primary-300 focus:ring-2 focus:ring-primary-100 focus:bg-surface transition-all text-charcoal"
					/>
				</div>
				<div>
					<label for="date-to" class="block text-xs font-medium text-charcoal-muted mb-1">To</label>
					<input
						id="date-to"
						type="date"
						value={filters.dateTo}
						onchange={(e) => handleDateToChange(e.currentTarget.value)}
						class="w-full px-3 py-2 bg-cream rounded-lg border border-transparent focus:border-primary-300 focus:ring-2 focus:ring-primary-100 focus:bg-surface transition-all text-charcoal"
					/>
				</div>
			</div>

			<!-- Amount Range -->
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label for="amount-min" class="block text-xs font-medium text-charcoal-muted mb-1">Min Amount</label>
					<input
						id="amount-min"
						type="number"
						step="0.01"
						min="0"
						placeholder="0.00"
						value={filters.amountMin}
						oninput={(e) => onFilterChange({ ...filters, amountMin: e.currentTarget.value })}
						class="w-full px-3 py-2 bg-cream rounded-lg border border-transparent focus:border-primary-300 focus:ring-2 focus:ring-primary-100 focus:bg-surface transition-all text-charcoal font-mono"
					/>
				</div>
				<div>
					<label for="amount-max" class="block text-xs font-medium text-charcoal-muted mb-1">Max Amount</label>
					<input
						id="amount-max"
						type="number"
						step="0.01"
						min="0"
						placeholder="0.00"
						value={filters.amountMax}
						oninput={(e) => onFilterChange({ ...filters, amountMax: e.currentTarget.value })}
						class="w-full px-3 py-2 bg-cream rounded-lg border border-transparent focus:border-primary-300 focus:ring-2 focus:ring-primary-100 focus:bg-surface transition-all text-charcoal font-mono"
					/>
				</div>
			</div>
		</div>
	{/if}

	<!-- Results count & Clear button -->
	{#if hasActiveFilters}
		<div class="px-1 flex items-center justify-between">
			<span class="text-sm text-charcoal-muted">
				{#if resultCount !== undefined}
					{#if filters.searchAllTime && allTimeCount !== undefined}
						Showing <span class="font-mono font-medium text-charcoal">{resultCount}</span> of {allTimeCount} total transactions
					{:else if totalCount !== undefined}
						Showing <span class="font-mono font-medium text-charcoal">{resultCount}</span> of {totalCount} transactions
					{:else}
						<span class="font-mono font-medium text-charcoal">{resultCount}</span> transactions found
					{/if}
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
