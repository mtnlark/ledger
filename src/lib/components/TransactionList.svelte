<script lang="ts">
	import type { ComponentType } from 'svelte';
	import { slide } from 'svelte/transition';
	import { Pencil, Trash2, Receipt, CheckSquare, Square, Check, ChevronRight, Repeat } from 'lucide-svelte';
	import type { Transaction, Category, Settings } from '$lib/db';
	import { createCategoryHelpers } from '$lib/utils/category-helpers';
	import { formatCurrency } from '$lib/utils/format-helpers';
	import {
		sortTransactionsByDate,
		buildListRows,
		groupRowsByDate,
		type ListRow
	} from '$lib/utils/transaction-grouping';
	import { extractTags, removeTags } from '$lib/utils/tags';
	import { sumCurrency } from '$lib/utils/currency';
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
		onBulkTagAdd?: (ids: number[], tag: string) => void;
		onBulkTagRemove?: (ids: number[], tag: string) => void;
		/** Edit an entire split as a group (opens the split editor). */
		onEditSplit?: (parentId: number, children: Transaction[]) => void;
		/** Delete an entire split (all child lines) at once. */
		onDeleteSplit?: (childIds: number[]) => void;
		availableTags?: string[];
		onAddTransaction?: () => void;
		selectionMode?: boolean;
		onSelectionModeChange?: (mode: boolean) => void;
		onTagClick?: (tag: string) => void;
		allTransactions?: Transaction[];
		/** Key that changes when pagination should reset (month/filter changes). */
		resetKey?: string;
		/** Viewport offset for sticky date headers (height of any sticky toolbar above the list). */
		stickyOffset?: number;
		/** Opens the merchant report card. */
		onMerchantClick?: (merchant: string) => void;
	}

	let { transactions, categories, settings, onEdit, onDelete, onBulkDelete, onBulkCategoryChange, onBulkTagAdd, onBulkTagRemove, onEditSplit, onDeleteSplit, availableTags = [], onAddTransaction, selectionMode = false, onSelectionModeChange, onTagClick, allTransactions, resetKey = '', stickyOffset = 0, onMerchantClick }: Props = $props();

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

	function handleBulkTagAdd(tag: string) {
		if (selectedIds.size > 0 && onBulkTagAdd) {
			onBulkTagAdd(Array.from(selectedIds), tag);
			selectedIds = new Set();
			if (onSelectionModeChange) {
				onSelectionModeChange(false);
			} else {
				internalSelectionMode = false;
			}
		}
	}

	function handleBulkTagRemove(tag: string) {
		if (selectedIds.size > 0 && onBulkTagRemove) {
			onBulkTagRemove(Array.from(selectedIds), tag);
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

	// Split-group expand/collapse state (collapsed by default), keyed by parent id
	let expandedSplits = $state<Set<number>>(new Set());

	function toggleSplit(parentId: number) {
		const next = new Set(expandedSplits);
		if (next.has(parentId)) {
			next.delete(parentId);
		} else {
			next.add(parentId);
		}
		expandedSplits = next;
	}

	// Progressive loading — show DEFAULT_PAGE_SIZE rows initially, reveal more on demand.
	// We paginate over *rows* (a split group counts as one row) and build them from the
	// full list before slicing, so a split group is never partially cut at the boundary.
	let displayCount = $state(DEFAULT_PAGE_SIZE);
	let allRows = $derived(buildListRows(sortTransactionsByDate(transactions)));
	let displayedRows = $derived(allRows.slice(0, displayCount));
	let hasMore = $derived(allRows.length > displayCount);
	let rowGroups = $derived(groupRowsByDate(displayedRows));
	let displayedTxCount = $derived(
		displayedRows.reduce((n, r) => n + (r.type === 'single' ? 1 : r.children.length), 0)
	);

	// Reset display + expanded state when resetKey changes (month/filter changes).
	// This intentionally ignores data refreshes (edits) that don't change the viewing context,
	// allowing users to stay at their current scroll position after editing older transactions.
	let prevResetKey = '';
	$effect(() => {
		if (resetKey !== prevResetKey) {
			prevResetKey = resetKey;
			displayCount = DEFAULT_PAGE_SIZE;
			expandedSplits = new Set();
		}
	});

	function showMore() {
		displayCount = Math.min(displayCount + DEFAULT_PAGE_SIZE, allRows.length);
	}

	function rowKey(row: ListRow): string {
		return row.type === 'single' ? `s${row.transaction.id}` : `g${row.parentId}`;
	}

	// Day totals reflect what hits your budget: your share for shared rows
	function userShare(t: Transaction): number {
		return t.isShared ? t.amount - t.partnerShare : t.amount;
	}

	function groupTotal(rows: ListRow[]): number {
		return sumCurrency(
			rows.flatMap((r) => (r.type === 'single' ? [userShare(r.transaction)] : r.children.map(userShare)))
		);
	}
</script>

<!-- Standard transaction row. Reused for single rows and (in selection mode) split children. -->
{#snippet txCard(transaction: Transaction)}
	{@const tags = extractTags(transaction.notes)}
	{@const cleanNotes = removeTags(transaction.notes)}
	<!-- Use button in selection mode for proper keyboard/screen reader support -->
	<svelte:element
		this={isSelectionMode ? 'button' : 'div'}
		type={isSelectionMode ? 'button' : undefined}
		role={isSelectionMode ? undefined : 'listitem'}
		class="group/row px-4 py-3 flex items-center gap-3 transition-colors text-left w-full {isSelectionMode
			? 'cursor-pointer'
			: ''} {selectedIds.has(transaction.id!) ? 'bg-primary-50 hover:bg-primary-100' : 'hover:bg-surface-hover/50'}"
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
		<div
			class="category-chip category-icon-box w-9 h-9 text-lg"
			style="background-color: {getCategoryColor(transaction.categoryId)}1F;"
		>{getCategoryIcon(transaction.categoryId)}</div>

		<!-- Main Content -->
		<div class="flex-1 min-w-0">
			<div class="flex items-center gap-2">
				{#if onMerchantClick && !isSelectionMode}
					<button
						type="button"
						onclick={(e) => { e.stopPropagation(); onMerchantClick?.(transaction.merchant); }}
						class="font-medium text-charcoal truncate text-left hover:text-primary-600 underline decoration-dotted decoration-transparent hover:decoration-primary-400 underline-offset-2 transition-colors"
						title="View merchant report"
					>{transaction.merchant}</button>
				{:else}
					<span class="font-medium text-charcoal truncate">{transaction.merchant}</span>
				{/if}
				{#if transaction.isSubscription}
					{#if transaction.subscriptionFrequency === 'annual'}
						<span class="badge bg-primary-100 text-primary-600">Annual</span>
					{:else}
						<span
							class="text-charcoal-muted flex-shrink-0"
							title="{transaction.subscriptionFrequency === 'semi-annual' ? 'Semi-annual' : 'Monthly'} subscription"
						>
							<Repeat size={13} />
						</span>
					{/if}
				{/if}
				{#if transaction.isShared && !transaction.isSettled}
					<span class="badge bg-warning-100 text-warning-600">Pending</span>
				{:else if transaction.isShared}
					<span class="badge bg-success-100 text-success-600">Shared</span>
				{/if}
			</div>
			<div class="flex items-center gap-2 text-sm text-charcoal-muted mt-0.5">
				<span>{getCategoryName(transaction.categoryId)}</span>
				{#if transaction.isShared}
					<span>·</span>
					<span>{partnerName}: {formatCurrency(transaction.partnerShare)}</span>
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

		<!-- Amount (your share first; full charge as context) -->
		<div class="text-right flex-shrink-0">
			{#if transaction.isShared}
				<div class="font-mono font-medium text-charcoal">{formatCurrency(transaction.amount - transaction.partnerShare)}</div>
				<div class="text-xs text-charcoal-muted font-mono">of {formatCurrency(transaction.amount)}</div>
			{:else}
				<div class="font-mono font-medium text-charcoal">{formatCurrency(transaction.amount)}</div>
			{/if}
		</div>

		<!-- Actions (hidden in selection mode) -->
		{#if !isSelectionMode && (onEdit || onDelete)}
			<div class="flex gap-1 flex-shrink-0 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 transition-opacity">
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
{/snippet}

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

		{#each rowGroups as group, groupIndex (group.dateKey)}
			<!-- Date Header -->
			<div class="animate-enter" style="animation-delay: {groupIndex * 50}ms;">
				<div
					class="sticky z-10 bg-cream flex items-baseline justify-between mb-2 px-1 py-1.5"
					style="top: {stickyOffset}px"
				>
					<h3 class="text-xs font-medium uppercase tracking-wider text-charcoal-muted">{group.label}</h3>
					<span class="font-mono text-xs text-charcoal-muted">{formatCurrency(groupTotal(group.rows))}</span>
				</div>
				<div class="bg-surface rounded-xl shadow-sm shadow-theme overflow-hidden divide-y divide-dashed divide-theme-dashed">
					{#each group.rows as row (rowKey(row))}
						{#if row.type === 'single'}
							{@render txCard(row.transaction)}
						{:else if isSelectionMode}
							<!-- In selection mode, splits render flat so each child stays individually selectable -->
							{#each row.children as child (child.id)}
								{@render txCard(child)}
							{/each}
						{:else}
							{@const isExpanded = expandedSplits.has(row.parentId)}
							<!-- Collapsible split group -->
							<div>
								<div class="group/split flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover/50">
									<button
										type="button"
										onclick={() => toggleSplit(row.parentId)}
										aria-expanded={isExpanded}
										class="flex items-center gap-3 flex-1 min-w-0 text-left"
									>
										<ChevronRight
											size={18}
											class="text-charcoal-muted flex-shrink-0 transition-transform {isExpanded ? 'rotate-90' : ''}"
										/>
										<div
											class="category-chip category-icon-box w-9 h-9 text-lg"
											style="background-color: {getCategoryColor(row.dominantCategoryId)}1F;"
										>{getCategoryIcon(row.dominantCategoryId)}</div>

										<div class="flex-1 min-w-0">
											<div class="flex items-center gap-2">
												<span class="font-medium text-charcoal truncate">{row.merchant}</span>
												<span class="badge bg-surface-alt text-charcoal-soft">Split</span>
												{#if row.anyPending}
													<span class="badge bg-warning-100 text-warning-600">Pending</span>
												{:else if row.allShared}
													<span class="badge bg-success-100 text-success-600">Shared</span>
												{/if}
											</div>
											<div class="flex items-center gap-2 text-sm text-charcoal-muted mt-0.5">
												<span>{row.children.length} categories</span>
												{#if row.allShared}
													<span>·</span>
													<span>{partnerName}: {formatCurrency(row.partnerTotal)}</span>
												{/if}
											</div>
										</div>

										<div class="text-right flex-shrink-0">
											{#if row.allShared}
												<div class="font-mono font-medium text-charcoal">{formatCurrency(row.youTotal)}</div>
												<div class="text-xs text-charcoal-muted font-mono">of {formatCurrency(row.total)}</div>
											{:else}
												<div class="font-mono font-medium text-charcoal">{formatCurrency(row.total)}</div>
											{/if}
										</div>
									</button>

									<!-- Group-level actions, aligned with single-row controls -->
									{#if onEditSplit || onDeleteSplit}
										<div class="flex gap-1 flex-shrink-0 opacity-0 group-hover/split:opacity-100 focus-within:opacity-100 transition-opacity">
											{#if onEditSplit}
												<button
													type="button"
													onclick={() => onEditSplit?.(row.parentId, row.children)}
													class="p-2 text-charcoal-muted hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
													aria-label="Edit split"
												>
													<Pencil size={16} />
												</button>
											{/if}
											{#if onDeleteSplit}
												<button
													type="button"
													onclick={() => onDeleteSplit?.(row.children.map((c) => c.id!))}
													class="p-2 text-charcoal-muted hover:text-danger-500 hover:bg-danger-50 rounded-lg transition-colors"
													aria-label="Delete split"
												>
													<Trash2 size={16} />
												</button>
											{/if}
										</div>
									{/if}
								</div>

								{#if isExpanded}
									<div transition:slide={{ duration: 150 }} class="pl-6 pr-4 pb-4 pt-1">
										<!-- Inner wrapper carries the rail so it ends at the last line, not the card edge -->
										<div class="border-l-2 border-theme pl-4 pt-3 space-y-2">
											{#each row.children as child (child.id)}
												{@const childTags = extractTags(child.notes)}
												{@const childNotes = removeTags(child.notes)}
												<div
													class="group/child bg-surface-alt rounded-lg p-3 flex items-center gap-3"
													role="listitem"
												>
													<div
														class="category-chip category-icon-box w-8 h-8 text-base"
														style="background-color: {getCategoryColor(child.categoryId)}1F;"
													>{getCategoryIcon(child.categoryId)}</div>
													<div class="flex-1 min-w-0">
														<span class="font-medium text-charcoal text-sm truncate">{getCategoryName(child.categoryId)}</span>
														{#if childNotes || childTags.length > 0}
															<div class="mt-0.5 flex flex-wrap items-center gap-1">
																{#if childNotes}
																	<p class="text-xs text-charcoal-muted/70 italic truncate mr-1">{childNotes}</p>
																{/if}
																{#each childTags as tag (tag)}
																	<TagPill {tag} onClick={onTagClick} transactions={allTransactions ?? []} />
																{/each}
															</div>
														{/if}
													</div>
													<div class="text-right flex-shrink-0">
														{#if child.isShared}
															<div class="font-mono text-sm text-charcoal">{formatCurrency(child.amount - child.partnerShare)}</div>
															<div class="text-xs text-charcoal-muted font-mono">of {formatCurrency(child.amount)}</div>
														{:else}
															<div class="font-mono text-sm text-charcoal">{formatCurrency(child.amount)}</div>
														{/if}
													</div>
													{#if onEdit || onDelete}
														<div class="flex gap-1 flex-shrink-0 opacity-0 group-hover/child:opacity-100 focus-within:opacity-100 transition-opacity">
															{#if onEdit}
																<button
																	onclick={() => onEdit?.(child)}
																	class="p-1.5 text-charcoal-muted hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
																	aria-label="Edit transaction"
																>
																	<Pencil size={14} />
																</button>
															{/if}
															{#if onDelete}
																<button
																	onclick={() => onDelete?.(child.id!)}
																	class="p-1.5 text-charcoal-muted hover:text-danger-500 hover:bg-danger-50 rounded-lg transition-colors"
																	aria-label="Delete transaction"
																>
																	<Trash2 size={14} />
																</button>
															{/if}
														</div>
													{/if}
												</div>
											{/each}
										</div>
									</div>
								{/if}
							</div>
						{/if}
					{/each}
				</div>
			</div>
		{/each}

		<!-- Show more button -->
		{#if hasMore}
			<div class="flex flex-col items-center gap-1 pt-2">
				<span class="text-xs text-charcoal-muted">
					Showing {displayedTxCount} of {transactions.length} transactions
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
		{availableTags}
		onDelete={handleBulkDelete}
		onCategoryChange={handleBulkCategoryChange}
		onTagAdd={handleBulkTagAdd}
		onTagRemove={handleBulkTagRemove}
		onCancel={handleCancelSelection}
	/>
{/if}
