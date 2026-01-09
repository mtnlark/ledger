<script lang="ts">
	import { format, isToday, isYesterday, startOfDay } from 'date-fns';
	import { Pencil, Trash2, Receipt } from 'lucide-svelte';
	import type { Transaction, Category, Settings } from '$lib/db';
	import { createCategoryHelpers } from '$lib/utils/category-helpers';
	import EmptyState from './EmptyState.svelte';

	interface Props {
		transactions: Transaction[];
		categories: Category[];
		settings?: Settings;
		onEdit?: (transaction: Transaction) => void;
		onDelete?: (id: number) => void;
	}

	let { transactions, categories, settings, onEdit, onDelete }: Props = $props();

	// Get partner name from settings or use default
	let partnerName = $derived(settings?.partnerName || 'Partner');

	// Create category helpers bound to current categories
	let categoryHelpers = $derived(createCategoryHelpers(categories));
	let getCategoryName = $derived(categoryHelpers.getName);
	let getCategoryIcon = $derived(categoryHelpers.getIcon);
	let getCategoryColor = $derived(categoryHelpers.getColor);

	// Group transactions by date
	interface DateGroup {
		dateKey: string;
		label: string;
		transactions: Transaction[];
	}

	let groupedTransactions = $derived.by(() => {
		const groups = new Map<string, Transaction[]>();

		// Sort transactions by date (newest first)
		const sorted = [...transactions].sort((a, b) =>
			new Date(b.date).getTime() - new Date(a.date).getTime()
		);

		for (const tx of sorted) {
			const date = startOfDay(new Date(tx.date));
			const dateKey = format(date, 'yyyy-MM-dd');
			const existing = groups.get(dateKey) || [];
			groups.set(dateKey, [...existing, tx]);
		}

		// Convert to array with labels
		const result: DateGroup[] = [];
		for (const [dateKey, txs] of groups) {
			// Parse date string as local time, not UTC
			// (new Date("yyyy-MM-dd") interprets as UTC, causing off-by-one day issues)
			const [year, month, day] = dateKey.split('-').map(Number);
			const date = new Date(year, month - 1, day);
			let label: string;

			if (isToday(date)) {
				label = 'Today';
			} else if (isYesterday(date)) {
				label = 'Yesterday';
			} else {
				label = format(date, 'EEEE, MMMM d');
			}

			result.push({ dateKey, label, transactions: txs });
		}

		return result;
	});

	function formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(amount);
	}
</script>

<div class="space-y-5">
	{#if transactions.length === 0}
		<EmptyState
			icon={Receipt}
			title="No transactions yet"
			description="Add your first expense to start tracking your budget"
		/>
	{:else}
		{#each groupedTransactions as group, groupIndex (group.dateKey)}
			<!-- Date Header -->
			<div class="animate-enter" style="animation-delay: {groupIndex * 50}ms;">
				<h3 class="text-sm font-medium text-charcoal-muted mb-3 px-1">{group.label}</h3>
				<div class="space-y-2">
					{#each group.transactions as transaction, txIndex (transaction.id)}
						<div
							class="bg-white rounded-lg shadow-sm shadow-gray-200/50 p-4 flex items-center gap-4 hover:bg-cream/50 transition-colors border-l-4"
							style="border-left-color: {getCategoryColor(transaction.categoryId)}; animation-delay: {(groupIndex * 50) + (txIndex * 30)}ms;"
						>
							<!-- Category Icon -->
							<div class="text-2xl flex-shrink-0">{getCategoryIcon(transaction.categoryId)}</div>

							<!-- Main Content -->
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2">
									<span class="font-medium text-charcoal truncate">{transaction.merchant}</span>
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
								{#if transaction.notes}
									<p class="text-xs text-charcoal-muted/70 mt-1 italic truncate">{transaction.notes}</p>
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

							<!-- Actions -->
							{#if onEdit || onDelete}
								<div class="flex gap-1 flex-shrink-0">
									{#if onEdit}
										<button
											onclick={() => onEdit?.(transaction)}
											class="p-2 text-charcoal-muted hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
											aria-label="Edit transaction"
										>
											<Pencil size={16} />
										</button>
									{/if}
									{#if onDelete}
										<button
											onclick={() => onDelete?.(transaction.id!)}
											class="p-2 text-charcoal-muted hover:text-danger-500 hover:bg-danger-50 rounded-lg transition-colors"
											aria-label="Delete transaction"
										>
											<Trash2 size={16} />
										</button>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/each}
	{/if}
</div>
