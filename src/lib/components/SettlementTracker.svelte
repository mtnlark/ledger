<script lang="ts">
	import { Check, PartyPopper } from 'lucide-svelte';
	import type { Transaction, Category, Settings } from '$lib/db';
	import EmptyState from './EmptyState.svelte';

	interface Props {
		transactions: Transaction[];
		categories: Category[];
		settings: Settings;
		outstandingBalance: number;
		onMarkSettled: (ids: number[]) => void;
	}

	let { transactions, categories, settings, outstandingBalance, onMarkSettled }: Props = $props();

	// Track selected transactions for batch settlement
	let selectedIds = $state<Set<number>>(new Set());

	// Get category by ID
	function getCategoryName(categoryId: number): string {
		const category = categories.find((c) => c.id === categoryId);
		return category?.name ?? 'Unknown';
	}

	function getCategoryIcon(categoryId: number): string {
		const category = categories.find((c) => c.id === categoryId);
		return category?.icon ?? '📦';
	}

	function formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2
		}).format(amount);
	}

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
			onMarkSettled(Array.from(selectedIds));
			selectedIds = new Set();
		}
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

<div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
	<!-- Header with outstanding balance -->
	<div class="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
		<div class="flex items-center justify-between mb-1">
			<h2 class="text-sm font-medium text-gray-600">Outstanding Balance with {settings.partnerName}</h2>
		</div>
		<p class="text-3xl font-bold text-gray-900">
			{formatCurrency(outstandingBalance)}
		</p>
		{#if outstandingBalance > 0}
			<p class="text-sm text-gray-500 mt-1">owed to you</p>
		{:else}
			<p class="text-sm text-green-600 mt-1 inline-flex items-center gap-1">All settled! <Check size={14} strokeWidth={3} /></p>
		{/if}
	</div>

	<!-- Transaction list -->
	<div class="divide-y divide-gray-100">
		{#if transactions.length === 0}
			<EmptyState
				icon={PartyPopper}
				title="All caught up!"
				description="No shared expenses waiting to be settled"
			/>
		{:else}
			<!-- Select All / Deselect All -->
			<div class="px-6 py-3 bg-gray-50 flex items-center justify-between">
				<div class="flex items-center gap-3">
					<button
						onclick={allSelected ? deselectAll : selectAll}
						class="text-sm text-blue-600 hover:text-blue-700 font-medium"
					>
						{allSelected ? 'Deselect All' : 'Select All'}
					</button>
					{#if selectedIds.size > 0}
						<span class="text-sm text-gray-500">
							{selectedIds.size} selected ({formatCurrency(selectedBalance)})
						</span>
					{/if}
				</div>
				{#if selectedIds.size > 0}
					<button
						onclick={handleMarkSettled}
						class="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
					>
						Mark as Settled
					</button>
				{/if}
			</div>

			<!-- Transaction items -->
			{#each transactions as transaction (transaction.id)}
				<button
					onclick={() => toggleSelection(transaction.id!)}
					class="w-full px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left"
				>
					<!-- Checkbox -->
					<div
						class="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors {selectedIds.has(
							transaction.id!
						)
							? 'bg-blue-600 border-blue-600'
							: 'border-gray-300'}"
					>
						{#if selectedIds.has(transaction.id!)}
							<Check size={12} class="text-white" strokeWidth={3} />
						{/if}
					</div>

					<!-- Icon -->
					<span class="text-xl">{getCategoryIcon(transaction.categoryId)}</span>

					<!-- Details -->
					<div class="flex-1 min-w-0">
						<p class="font-medium text-gray-900 truncate">{transaction.merchant}</p>
						<p class="text-sm text-gray-500">
							{formatDate(transaction.date)} · {getCategoryName(transaction.categoryId)}
						</p>
					</div>

					<!-- Amount -->
					<div class="text-right">
						<p class="font-semibold text-gray-900">{formatCurrency(transaction.partnerShare)}</p>
						<p class="text-xs text-gray-500">of {formatCurrency(transaction.amount)}</p>
					</div>
				</button>
			{/each}
		{/if}
	</div>
</div>
