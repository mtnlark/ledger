<script lang="ts">
	import { Plus, Trash2 } from 'lucide-svelte';
	import type { Category, Transaction } from '$lib/db';
	import { createCategoryHelpers } from '$lib/utils/category-helpers';
	import { formatCurrency } from '$lib/utils/format-helpers';
	import { isSplitBalanced, roundCurrency } from '$lib/utils/currency';
	import ModalContainer from './ModalContainer.svelte';

	interface Props {
		isOpen: boolean;
		transaction: Transaction | null;
		categories: Category[];
		onSplit: (id: number, splits: { categoryId: number; amount: number }[]) => void;
		onClose: () => void;
	}

	interface SplitLine {
		categoryId: number;
		amount: number;
	}

	let { isOpen, transaction, categories, onSplit, onClose }: Props = $props();

	let isSubmitting = $state(false);

	// Create category helpers
	let categoryHelpers = $derived(createCategoryHelpers(categories));
	let getCategoryName = $derived(categoryHelpers.getName);
	let getCategoryIcon = $derived(categoryHelpers.getIcon);

	// Get active categories for dropdown
	let activeCategories = $derived(categories.filter((c) => c.isActive));

	// Split lines state
	let lines = $state<SplitLine[]>([]);

	// Reset when modal opens with a transaction
	$effect(() => {
		if (isOpen && transaction) {
			// Initialize with original transaction as first line
			lines = [{ categoryId: transaction.categoryId, amount: transaction.amount }];
			isSubmitting = false;
		}
	});

	// Computed values
	let total = $derived(lines.reduce((sum, l) => sum + (l.amount || 0), 0));
	let remaining = $derived(transaction ? transaction.amount - total : 0);
	let isValid = $derived(
		lines.length >= 2 &&
			transaction !== null &&
			isSplitBalanced(remaining) &&
			lines.every((l) => l.categoryId > 0 && l.amount > 0)
	);

	function addLine() {
		// Add new line with remaining amount (if positive)
		const newAmount = remaining > 0 ? roundCurrency(remaining) : 0;
		lines = [...lines, { categoryId: 0, amount: newAmount }];
	}

	function removeLine(index: number) {
		if (lines.length > 1) {
			lines = lines.filter((_, i) => i !== index);
		}
	}

	function updateLine(index: number, field: 'categoryId' | 'amount', value: number) {
		lines = lines.map((line, i) => (i === index ? { ...line, [field]: value } : line));
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();

		if (!isValid || !transaction?.id || isSubmitting) return;

		isSubmitting = true;
		try {
			await onSplit(transaction.id, lines);
		} finally {
			isSubmitting = false;
		}
	}
</script>

<ModalContainer isOpen={isOpen && !!transaction} title="Split by Category" maxWidth="lg" zIndex={60} onClose={onClose}>
	{#if transaction}
			<form onsubmit={handleSubmit}>
				<!-- Body -->
				<div class="p-6 space-y-4">
					<!-- Original Transaction Summary -->
					<div class="bg-cream rounded-lg p-4">
						<div class="text-sm text-charcoal-muted mb-1">Original Transaction</div>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<span class="text-xl">{getCategoryIcon(transaction.categoryId)}</span>
								<span class="font-medium text-charcoal">{transaction.merchant}</span>
							</div>
							<span class="font-mono font-medium text-charcoal"
								>{formatCurrency(transaction.amount)}</span
							>
						</div>
					</div>

					<!-- Split Lines -->
					<div class="space-y-3">
						<div class="text-sm font-medium text-charcoal-soft">Split into categories</div>

						{#each lines as line, index (index)}
							<div class="flex items-center gap-2">
								<!-- Category Select -->
								<select
									value={line.categoryId}
									onchange={(e) =>
										updateLine(index, 'categoryId', parseInt(e.currentTarget.value))}
									class="flex-1 px-3 py-2 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
								>
									<option value={0}>Select category...</option>
									{#each activeCategories as cat (cat.id)}
										<option value={cat.id}>{cat.icon} {cat.name}</option>
									{/each}
								</select>

								<!-- Amount Input -->
								<div class="relative w-28">
									<span
										class="absolute left-2 top-1/2 -translate-y-1/2 text-charcoal-muted font-mono text-sm"
										>$</span
									>
									<input
										type="number"
										value={line.amount}
										oninput={(e) =>
											updateLine(index, 'amount', parseFloat(e.currentTarget.value) || 0)}
										step="0.01"
										min="0"
										class="w-full pl-6 pr-2 py-2 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors font-mono text-sm"
									/>
								</div>

								<!-- Remove Button -->
								<button
									type="button"
									onclick={() => removeLine(index)}
									disabled={lines.length <= 1}
									class="p-2 text-charcoal-muted hover:text-danger-500 hover:bg-danger-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
									aria-label="Remove line"
								>
									<Trash2 size={16} />
								</button>
							</div>
						{/each}

						<!-- Add Line Button -->
						<button
							type="button"
							onclick={addLine}
							class="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 border border-dashed border-primary-300 rounded-lg transition-colors"
						>
							<Plus size={16} />
							<span>Add Line</span>
						</button>
					</div>

					<!-- Validation Summary -->
					<div
						class="p-3 rounded-lg {isSplitBalanced(remaining)
							? 'bg-success-50 border border-success-200'
							: 'bg-warning-50 border border-warning-200'}"
					>
						<div class="flex justify-between text-sm">
							<span class="text-charcoal-soft">Total:</span>
							<span class="font-mono font-medium text-charcoal">{formatCurrency(total)}</span>
						</div>
						<div class="flex justify-between text-sm mt-1">
							<span class="text-charcoal-soft">Remaining:</span>
							<span
								class="font-mono font-medium {isSplitBalanced(remaining)
									? 'text-success-600'
									: remaining > 0
										? 'text-warning-600'
										: 'text-danger-600'}"
							>
								{formatCurrency(remaining)}
							</span>
						</div>
						{#if Math.abs(remaining) >= 0.01}
							<p class="text-xs mt-2 {remaining > 0 ? 'text-warning-600' : 'text-danger-600'}">
								{remaining > 0
									? 'Add more lines or adjust amounts to use the remaining balance'
									: 'Total exceeds original amount'}
							</p>
						{/if}
						{#if lines.length < 2}
							<p class="text-xs mt-2 text-warning-600">Add at least 2 lines to split</p>
						{/if}
					</div>
				</div>

				<!-- Footer -->
				<div
					class="flex gap-3 px-6 py-4 border-t border-dashed border-theme-dashed bg-surface-alt rounded-b-xl"
				>
					<button
						type="submit"
						disabled={!isValid || isSubmitting}
						class="flex-1 bg-primary-500 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-primary-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary-500/25 focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none transition-all duration-150 flex items-center justify-center gap-2"
					>
						{#if isSubmitting}
							<div class="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></div>
						{/if}
						Split into {lines.length} Transactions
					</button>
					<button
						type="button"
						onclick={onClose}
						class="px-4 py-2.5 border border-theme text-charcoal-soft rounded-lg font-medium hover:bg-surface-hover transition-colors"
					>
						Cancel
					</button>
				</div>
			</form>
	{/if}
</ModalContainer>
