<script lang="ts">
	import { format } from 'date-fns';
	import type { Transaction, Category } from '$lib/db';

	interface Props {
		transactions: Transaction[];
		categories: Category[];
		onEdit?: (transaction: Transaction) => void;
		onDelete?: (id: number) => void;
	}

	let { transactions, categories, onEdit, onDelete }: Props = $props();

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

	function formatDate(date: Date): string {
		return format(new Date(date), 'MMM d');
	}
</script>

<div class="space-y-2">
	{#if transactions.length === 0}
		<div class="text-center py-12 text-gray-500">
			<p class="text-lg">No transactions yet</p>
			<p class="text-sm mt-1">Add your first transaction to get started</p>
		</div>
	{:else}
		{#each transactions as transaction (transaction.id)}
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
						<span>{formatDate(transaction.date)}</span>
						<span>·</span>
						<span>{getCategoryName(transaction.categoryId)}</span>
						{#if transaction.isShared}
							<span>·</span>
							<span class="text-blue-600">
								Partner: {formatCurrency(transaction.partnerShare)}
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
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4"
									viewBox="0 0 20 20"
									fill="currentColor"
								>
									<path
										d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"
									/>
								</svg>
							</button>
						{/if}
						{#if onDelete}
							<button
								onclick={() => onDelete?.(transaction.id!)}
								class="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
								aria-label="Delete transaction"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4"
									viewBox="0 0 20 20"
									fill="currentColor"
								>
									<path
										fill-rule="evenodd"
										d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
										clip-rule="evenodd"
									/>
								</svg>
							</button>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	{/if}
</div>
