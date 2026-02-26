<script lang="ts" module>
	import type { Transaction, Category } from '$lib/db';
	import { roundCurrency } from '$lib/utils/currency';

	export interface TopCategory {
		id: number | null;
		name: string;
		icon: string;
		amount: number;
		percent: number;
		count?: number; // Only for "Other"
	}

	export function computeTopCategories(
		transactions: Transaction[],
		categories: Category[],
		limit: number = 5
	): TopCategory[] {
		// Sum spending by category (user portion)
		const byCategory = new Map<number, number>();
		for (const t of transactions) {
			const userAmount = t.isShared ? t.amount - t.partnerShare : t.amount;
			byCategory.set(t.categoryId, (byCategory.get(t.categoryId) || 0) + userAmount);
		}

		// Convert to array with category details
		const categorySpending: TopCategory[] = [];
		for (const [catId, amount] of byCategory) {
			const cat = categories.find(c => c.id === catId);
			if (cat && amount > 0) {
				categorySpending.push({
					id: catId,
					name: cat.name,
					icon: cat.icon || '📁',
					amount: roundCurrency(amount),
					percent: 0
				});
			}
		}

		// Sort descending
		categorySpending.sort((a, b) => b.amount - a.amount);

		// Calculate total
		const total = categorySpending.reduce((sum, c) => sum + c.amount, 0);

		// Take top N, group rest as Other
		const top = categorySpending.slice(0, limit);
		const rest = categorySpending.slice(limit);

		// Calculate percentages for top
		for (const cat of top) {
			cat.percent = total > 0 ? Math.round((cat.amount / total) * 100) : 0;
		}

		// Add Other if there are remaining categories
		if (rest.length > 0) {
			const otherAmount = roundCurrency(rest.reduce((sum, c) => sum + c.amount, 0));
			top.push({
				id: null,
				name: 'Other',
				icon: '',
				amount: otherAmount,
				percent: total > 0 ? Math.round((otherAmount / total) * 100) : 0,
				count: rest.length
			});
		}

		return top;
	}
</script>

<script lang="ts">
	import { goto } from '$app/navigation';
	import type { Transaction, Category } from '$lib/db';
	import { formatCurrency } from '$lib/utils/format-helpers';

	interface Props {
		transactions: Transaction[];
		categories: Category[];
		limit?: number;
	}

	let { transactions, categories, limit = 5 }: Props = $props();

	let topCategories = $derived(computeTopCategories(transactions, categories, limit));
	let maxAmount = $derived(topCategories[0]?.amount || 1);
</script>

{#if topCategories.length > 0}
	<div class="space-y-1">
		{#each topCategories as cat, i}
			{@const pct = (cat.amount / maxAmount) * 100}
			<button
				type="button"
				class="relative flex items-center w-full px-3 py-2.5 rounded-lg bg-surface hover:bg-surface-hover transition-colors text-left"
				onclick={() => cat.name === 'Other' ? goto('/insights?tab=spending') : null}
				disabled={cat.name !== 'Other'}
			>
				<!-- Fill bar background -->
				<div
					class="absolute inset-y-0 left-0 rounded-lg bg-gradient-to-r from-primary-500/15 via-primary-500/7 to-transparent transition-all duration-500"
					style="width: {pct}%"
				></div>

				<!-- Icon -->
				<span class="relative z-10 w-6 text-center shrink-0">
					{#if cat.icon}
						{cat.icon}
					{:else if cat.count}
						<span class="text-xs text-charcoal-muted">+{cat.count}</span>
					{/if}
				</span>

				<!-- Name -->
				<span class="relative z-10 text-sm text-charcoal truncate ml-2 min-w-0 flex-1">
					{cat.name}
					{#if cat.count}
						<span class="text-charcoal-muted">({cat.count})</span>
					{/if}
				</span>

				<!-- Ledger dot leader -->
				<span class="ledger-line relative z-10"></span>

				<!-- Amount + percentage -->
				<span class="relative z-10 font-mono text-sm font-medium text-charcoal shrink-0">
					{formatCurrency(cat.amount)}
				</span>
				<span class="relative z-10 text-xs text-charcoal-muted ml-1.5 shrink-0 w-8 text-right">
					{cat.percent}%
				</span>
			</button>
		{/each}
	</div>
{/if}
