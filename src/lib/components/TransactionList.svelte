<script lang="ts">
	import type { ComponentType } from 'svelte';
	import { Pencil, Trash2, Receipt, CheckSquare, Square, Check } from 'lucide-svelte';
	import type { Transaction, Category, Settings } from '$lib/db';
	import { createCategoryHelpers } from '$lib/utils/category-helpers';
	import { formatCurrency } from '$lib/utils/format-helpers';
	import { createDateGroups, type DateGroup } from '$lib/utils/transaction-grouping';
	import { extractTags, removeTags } from '$lib/utils/tags';
	import { DEFAULT_PAGE_SIZE } from '$lib/utils/pagination';
	import EmptyState from './EmptyState.svelte';
	import BulkActionBar from './BulkActionBar.svelte';
	import TagPill from './TagPill.svelte';

	interface Props {
		transactions: Transaction[];
		categories: Category[];
		settings?: Settings;
		onEdit?: (transaction: Transaction) => void;
		onDelete?: (id: number) => void;
		onBulkDelete?: (ids: number[]) => void;
		onBulkCategoryChange?: (ids: number[], categoryId: number) => void;
		onAddTransaction?: () => void;
		selectionMode?: boolean;
		onSelectionModeChange?: (mode: boolean) => void;
		onTagClick?: (tag: string) => void;
		allTransactions?: Transaction[];
	}

	let { transactions, categories, settings, onEdit, onDelete, onBulkDelete, onBulkCategoryChange, onAddTransaction, selectionMode = false, onSelectionModeChange, onTagClick, allTransactions }: Props = $props();

	// Selection mode state - use prop if provided, otherwise internal state
	let internalSelectionMode = $state(false);
	let isSelectionMode = $derived(onSelectionModeChange ? selectionMode : internalSelectionMode);
	let selectedIds = $state<Set<number>>(new Set());

	// Derived selection state
	let hasSelection = $derived(selectedIds.size > 0);
	let allSelected = $derived(
		transactions.length > 0 && selectedIds.size === transactions.length
	);
	let hasBulkOperations = $derived(!!onBulkDelete || !!onBulkCategoryChange);

	// Selection functions
	function toggleSelectionMode() {
		const newMode = !isSelectionMode;
		if (onSelectionModeChange) {
			onSelectionModeChange(newMode);
		} else {
			internalSelectionMode = newMode;
		}
		if (!newMode) {
			selectedIds = new Set();
		}
	}

	function toggleSelection(id: number) {
		const newSet = new Set(selectedIds);
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			newSet.add(id);
		}
		selectedIds = newSet;
	}

	function selectAll() {
		selectedIds = new Set(transactions.map((t) => t.id!));
	}

	function deselectAll() {
		selectedIds = new Set();
	}

	function handleBulkDelete() {
		if (selectedIds.size > 0 && onBulkDelete) {
			onBulkDelete(Array.from(selectedIds));
			selectedIds = new Set();
			if (onSelectionModeChange) {
				onSelectionModeChange(false);
			} else {
				internalSelectionMode = false;
			}
		}
	}

	function handleBulkCategoryChange(categoryId: number) {
		if (selectedIds.size > 0 && onBulkCategoryChange) {
			onBulkCategoryChange(Array.from(selectedIds), categoryId);
			selectedIds = new Set();
			if (onSelectionModeChange) {
				onSelectionModeChange(false);
			} else {
				internalSelectionMode = false;
			}
		}
	}

	function handleCancelSelection() {
		selectedIds = new Set();
		if (onSelectionModeChange) {
			onSelectionModeChange(false);
		} else {
			internalSelectionMode = false;
		}
	}

	// Get partner name from settings or use default
	let partnerName = $derived(settings?.partnerName || 'Partner');

	// Create category helpers bound to current categories
	let categoryHelpers = $derived(createCategoryHelpers(categories));
	let getCategoryName = $derived(categoryHelpers.getName);
	let getCategoryIcon = $derived(categoryHelpers.getIcon);
	let getCategoryColor = $derived(categoryHelpers.getColor);

	// Progressive loading — show DEFAULT_PAGE_SIZE initially, reveal more on demand
	let displayCount = $state(DEFAULT_PAGE_SIZE);
	let hasMore = $derived(transactions.length > displayCount);
	let displayedTransactions = $derived(transactions.slice(0, displayCount));

	// Reset display count when the transaction list changes (new month, filters, etc.)
	let prevTransactionsRef = $state<Transaction[]>([]);
	$effect(() => {
		if (transactions !== prevTransactionsRef) {
			prevTransactionsRef = transactions;
			displayCount = DEFAULT_PAGE_SIZE;
		}
	});

	function showMore() {
		displayCount = Math.min(displayCount + DEFAULT_PAGE_SIZE, transactions.length);
	}

	// Group transactions by date using the utility function
	let groupedTransactions = $derived(createDateGroups(displayedTransactions));
</script>

<div class="space-y-5">
	{#if transactions.length === 0}
		<EmptyState
			icon={Receipt as ComponentType}
			title="No transactions yet"
			description="Add your first expense to start tracking your budget"
			actionLabel={onAddTransaction ? 'Add Transaction' : undefined}
			onAction={onAddTransaction}
		/>
	{:else}
		<!-- Selection mode controls (only shown when in selection mode) -->
		{#if isSelectionMode && hasBulkOperations}
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<button
						type="button"
						onclick={allSelected ? deselectAll : selectAll}
						class="text-sm text-primary-600 hover:text-primary-700 font-medium"
					>
						{allSelected ? 'Deselect All' : 'Select All'}
					</button>
					{#if hasSelection}
						<span class="text-sm text-charcoal-muted">
							{selectedIds.size} of {transactions.length} selected
						</span>
					{/if}
				</div>
				<button
					type="button"
					onclick={toggleSelectionMode}
					class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors bg-primary-100 text-primary-700"
				>
					<CheckSquare size={16} />
					<span>Done</span>
				</button>
			</div>
		{/if}

		{#each groupedTransactions as group, groupIndex (group.dateKey)}
			<!-- Date Header -->
			<div class="animate-enter" style="animation-delay: {groupIndex * 50}ms;">
				<h3 class="text-sm font-medium text-charcoal-muted mb-3 px-1">{group.label}</h3>
				<div class="space-y-2">
					{#each group.transactions as transaction, txIndex (transaction.id)}
						{@const tags = extractTags(transaction.notes)}
						{@const cleanNotes = removeTags(transaction.notes)}
						<!-- Use button in selection mode for proper keyboard/screen reader support -->
						<svelte:element
							this={isSelectionMode ? 'button' : 'div'}
							type={isSelectionMode ? 'button' : undefined}
							role={isSelectionMode ? undefined : 'listitem'}
							class="bg-surface rounded-lg shadow-sm shadow-theme p-4 flex items-center gap-4 transition-colors border-l-4 text-left w-full {isSelectionMode
								? 'cursor-pointer'
								: 'hover:bg-surface-hover/50'} {selectedIds.has(transaction.id!) ? 'bg-primary-50 hover:bg-primary-100' : 'hover:bg-surface-hover/50'}"
							style="border-left-color: {getCategoryColor(transaction.categoryId)}; animation-delay: {(groupIndex * 50) + (txIndex * 30)}ms;"
							onclick={isSelectionMode ? () => toggleSelection(transaction.id!) : undefined}
						>
							<!-- Checkbox (selection mode) -->
							{#if isSelectionMode}
								<div
									class="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors {selectedIds.has(
										transaction.id!
									)
										? 'bg-primary-500 border-primary-500 checkbox-spring'
										: 'border-theme bg-surface'}"
								>
									{#if selectedIds.has(transaction.id!)}
										<Check size={12} class="text-white" strokeWidth={3} />
									{/if}
								</div>
							{/if}

							<!-- Category Icon -->
							<div class="text-2xl flex-shrink-0">{getCategoryIcon(transaction.categoryId)}</div>

							<!-- Main Content -->
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2">
									<span class="font-medium text-charcoal truncate">{transaction.merchant}</span>
									{#if transaction.isSubscription}
										<span
											class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide bg-primary-100 text-primary-600"
										>
											{transaction.subscriptionFrequency === 'annual' ? 'Annual' : 'Sub'}
										</span>
									{/if}
									{#if transaction.isShared}
										<span
											class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide bg-success-100 text-success-600"
										>
											Shared
										</span>
									{/if}
									{#if transaction.isShared && !transaction.isSettled}
										<span
											class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide bg-warning-100 text-warning-600"
										>
											Pending
										</span>
									{/if}
								</div>
								<div class="flex items-center gap-2 text-sm text-charcoal-muted mt-0.5">
									<span>{getCategoryName(transaction.categoryId)}</span>
									{#if transaction.isShared}
										<span>·</span>
										<span class="text-success-600">
											{partnerName}: {formatCurrency(transaction.partnerShare)}
										</span>
									{/if}
								</div>
								{#if cleanNotes || tags.length > 0}
									<div class="mt-1 flex flex-wrap items-center gap-1">
										{#if cleanNotes}
											<p class="text-xs text-charcoal-muted/70 italic truncate mr-1">{cleanNotes}</p>
										{/if}
										{#each tags as tag (tag)}
											<TagPill {tag} onClick={onTagClick} transactions={allTransactions ?? []} />
										{/each}
									</div>
								{/if}
							</div>

							<!-- Amount -->
							<div class="text-right flex-shrink-0">
								<div class="font-mono font-medium text-charcoal">{formatCurrency(transaction.amount)}</div>
								{#if transaction.isShared}
									<div class="text-xs text-charcoal-muted font-mono">
										You: {formatCurrency(transaction.amount - transaction.partnerShare)}
									</div>
								{/if}
							</div>

							<!-- Actions (hidden in selection mode) -->
							{#if !isSelectionMode && (onEdit || onDelete)}
								<div class="flex gap-1 flex-shrink-0">
									{#if onEdit}
										<button
											onclick={(e) => { e.stopPropagation(); onEdit?.(transaction); }}
											class="p-2 text-charcoal-muted hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
											aria-label="Edit transaction"
										>
											<Pencil size={16} />
										</button>
									{/if}
									{#if onDelete}
										<button
											onclick={(e) => { e.stopPropagation(); onDelete?.(transaction.id!); }}
											class="p-2 text-charcoal-muted hover:text-danger-500 hover:bg-danger-50 rounded-lg transition-colors"
											aria-label="Delete transaction"
										>
											<Trash2 size={16} />
										</button>
									{/if}
								</div>
							{/if}
						</svelte:element>
					{/each}
				</div>
			</div>
		{/each}

		<!-- Show more button -->
		{#if hasMore}
			<div class="flex flex-col items-center gap-1 pt-2">
				<span class="text-xs text-charcoal-muted">
					Showing {displayedTransactions.length} of {transactions.length} transactions
				</span>
				<button
					type="button"
					onclick={showMore}
					class="px-4 py-2 text-sm font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors"
				>
					Show more
				</button>
			</div>
		{/if}
	{/if}
</div>

<!-- Bulk Action Bar (floating at bottom) -->
{#if isSelectionMode && hasSelection}
	<BulkActionBar
		selectedCount={selectedIds.size}
		{categories}
		onDelete={handleBulkDelete}
		onCategoryChange={handleBulkCategoryChange}
		onCancel={handleCancelSelection}
	/>
{/if}
