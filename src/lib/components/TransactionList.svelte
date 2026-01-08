<script lang="ts">
	import { format, isToday, isYesterday, startOfDay } from 'date-fns';
	import { Pencil, Trash2, Receipt } from 'lucide-svelte';
	import type { Transaction, Category, Settings } from '$lib/db';
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
			const date = new Date(dateKey);
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

	function getCategoryName(categoryId: number): string {
		const cat = categories.find((c) => c.id === categoryId);
		return cat?.name ?? 'Unknown';
	}

	function getCategoryIcon(categoryId: number): string {
		const cat = categories.find((c) => c.id === categoryId);
		return cat?.icon ?? '📝';
	}

	function formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(amount);
	}
</script>

<div class="space-y-4">
	{#if transactions.length === 0}
		<EmptyState
			icon={Receipt}
			title="No transactions yet"
			description="Add your first expense to start tracking your budget"
		/>
	{:else}
		{#each groupedTransactions as group (group.dateKey)}
			<!-- Date Header -->
			<div>
				<h3 class="text-sm font-medium text-gray-500 mb-2 px-1">{group.label}</h3>
				<div class="space-y-2">
					{#each group.transactions as transaction (transaction.id)}
						<div
							class="bg-white rounded-lg shadow-sm border border-gray-100 p-4 flex items-center gap-4 hover:shadow-md transition-shadow"
						>
							<!-- Category Icon -->
							<div class="text-2xl flex-shrink-0">{getCategoryIcon(transaction.categoryId)}</div>

							<!-- Main Content -->
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2">
									<span class="font-medium text-gray-900 truncate">{transaction.merchant}</span>
									{#if transaction.isShared}
										<span
											class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
										>
											Shared
										</span>
									{/if}
									{#if transaction.isShared && !transaction.isSettled}
										<span
											class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800"
										>
											Pending
										</span>
									{/if}
								</div>
								<div class="flex items-center gap-2 text-sm text-gray-500 mt-0.5">
									<span>{getCategoryName(transaction.categoryId)}</span>
									{#if transaction.isShared}
										<span>·</span>
										<span class="text-blue-600">
											{partnerName}: {formatCurrency(transaction.partnerShare)}
										</span>
									{/if}
								</div>
							</div>

							<!-- Amount -->
							<div class="text-right flex-shrink-0">
								<div class="font-semibold text-gray-900">{formatCurrency(transaction.amount)}</div>
								{#if transaction.isShared}
									<div class="text-xs text-gray-500">
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
											class="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
											aria-label="Edit transaction"
										>
											<Pencil size={16} />
										</button>
									{/if}
									{#if onDelete}
										<button
											onclick={() => onDelete?.(transaction.id!)}
											class="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
