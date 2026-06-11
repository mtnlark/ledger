<script lang="ts">
	import { onMount } from 'svelte';
	import type { ComponentType } from 'svelte';
	import { Check, PartyPopper } from 'lucide-svelte';
	import type { Transaction, Category, Settings } from '$lib/db';
	import { createCategoryHelpers } from '$lib/utils/category-helpers';
	import { formatCurrency } from '$lib/utils/format-helpers';
	import EmptyState from './EmptyState.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';

	interface Props {
		transactions: Transaction[];
		categories: Category[];
		settings: Settings;
		outstandingBalance: number;
		onMarkSettled: (ids: number[]) => void;
	}

	let { transactions, categories, settings, outstandingBalance, onMarkSettled }: Props = $props();

	// Animation state
	let mounted = $state(false);
	onMount(() => {
		setTimeout(() => mounted = true, 50);
	});

	// Track selected transactions for batch settlement
	let selectedIds = $state<Set<number>>(new Set());
	let showSettleConfirm = $state(false);

	// Create category helpers bound to current categories
	let categoryHelpers = $derived(createCategoryHelpers(categories));
	let getCategoryName = $derived(categoryHelpers.getName);
	let getCategoryIcon = $derived(categoryHelpers.getIcon);
	let getCategoryColor = $derived(categoryHelpers.getColor);

	function formatDate(date: Date): string {
		return new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric'
		}).format(new Date(date));
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

	function handleMarkSettled() {
		if (selectedIds.size > 0) {
			showSettleConfirm = true;
		}
	}

	function confirmSettle() {
		onMarkSettled(Array.from(selectedIds));
		selectedIds = new Set();
		showSettleConfirm = false;
	}

	// Computed values
	let allSelected = $derived(
		transactions.length > 0 && selectedIds.size === transactions.length
	);
	let selectedBalance = $derived(
		transactions
			.filter((t) => selectedIds.has(t.id!))
			.reduce((sum, t) => sum + t.partnerShare, 0)
	);
</script>

<div
	class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden transition-all duration-500 {mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}"
	style="transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);"
>
	<!-- Header with outstanding balance -->
	<div class="px-6 py-5 border-b border-dashed border-theme-dashed">
		<h2 class="text-xs font-medium uppercase tracking-wider text-charcoal-muted mb-1.5">
			Outstanding with {settings.partnerName || 'Partner'}
		</h2>
		<p class="font-mono text-4xl font-medium {outstandingBalance > 0 ? 'text-charcoal' : 'text-success-500'}">
			{formatCurrency(outstandingBalance)}
		</p>
		{#if outstandingBalance > 0}
			<p class="text-sm text-charcoal-muted mt-1.5">{settings.partnerName || 'Your partner'} owes you</p>
		{:else}
			<p class="text-sm text-success-600 mt-1.5 inline-flex items-center gap-1">All settled! <Check size={14} strokeWidth={3} /></p>
		{/if}
	</div>

	<!-- Transaction list -->
	<div class="divide-y divide-dashed divide-theme-dashed">
		{#if transactions.length === 0}
			<EmptyState
				icon={PartyPopper as ComponentType}
				title="All caught up!"
				description="No shared expenses waiting to be settled"
			/>
		{:else}
			<!-- Select All / Deselect All -->
			<div class="px-6 py-3 bg-cream-dark flex items-center justify-between">
				<div class="flex items-center gap-3">
					<button
						onclick={allSelected ? deselectAll : selectAll}
						class="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
					>
						{allSelected ? 'Deselect All' : 'Select All'}
					</button>
					{#if selectedIds.size > 0}
						<span class="text-sm text-charcoal-muted">
							{selectedIds.size} selected (<span class="font-mono">{formatCurrency(selectedBalance)}</span>)
						</span>
					{/if}
				</div>
				{#if selectedIds.size > 0}
					<button
						onclick={handleMarkSettled}
						class="px-4 py-2 bg-success-500 text-white text-sm font-medium rounded-lg hover:bg-success-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-success-500/25 transition-all duration-150"
						aria-label="Mark {selectedIds.size} transaction{selectedIds.size === 1 ? '' : 's'} as settled"
					>
						Mark as Settled
					</button>
				{/if}
			</div>

			<!-- Transaction items -->
			{#each transactions as transaction (transaction.id)}
				<button
					onclick={() => toggleSelection(transaction.id!)}
					class="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-surface-hover/50 transition-colors text-left"
					aria-pressed={selectedIds.has(transaction.id!)}
					aria-label="{selectedIds.has(transaction.id!) ? 'Deselect' : 'Select'} {transaction.merchant} — {formatCurrency(transaction.partnerShare)}"
				>
					<!-- Checkbox -->
					<div
						class="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors {selectedIds.has(
							transaction.id!
						)
							? 'bg-success-500 border-success-500'
							: 'border-theme'}"
					>
						{#if selectedIds.has(transaction.id!)}
							<Check size={12} class="text-white" strokeWidth={3} />
						{/if}
					</div>

					<!-- Icon -->
					<div
						class="category-chip category-icon-box w-9 h-9 text-lg"
						style="background-color: {getCategoryColor(transaction.categoryId)}1F;"
					>{getCategoryIcon(transaction.categoryId)}</div>

					<!-- Details -->
					<div class="flex-1 min-w-0">
						<p class="font-medium text-charcoal truncate">{transaction.merchant}</p>
						<p class="text-sm text-charcoal-muted">
							{formatDate(transaction.date)} · {getCategoryName(transaction.categoryId)}
						</p>
					</div>

					<!-- Amount -->
					<div class="text-right">
						<p class="font-mono font-medium text-charcoal">{formatCurrency(transaction.partnerShare)}</p>
						<p class="text-xs text-charcoal-muted font-mono">of {formatCurrency(transaction.amount)}</p>
					</div>
				</button>
			{/each}
		{/if}
	</div>
</div>

<ConfirmDialog
	isOpen={showSettleConfirm}
	title="Mark as Settled?"
	message="Mark {selectedIds.size} transaction{selectedIds.size === 1 ? '' : 's'} ({formatCurrency(selectedBalance)}) as settled with {settings.partnerName || 'Partner'}?"
	confirmText="Mark Settled"
	onConfirm={confirmSettle}
	onCancel={() => (showSettleConfirm = false)}
/>
