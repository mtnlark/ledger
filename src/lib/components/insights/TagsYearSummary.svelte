<script lang="ts">
	import type { Transaction } from '$lib/db';
	import { formatCurrencyWhole } from '$lib/utils/format-helpers';
	import { roundCurrency, getUserAmount } from '$lib/utils/currency';
	import { extractTags } from '$lib/utils/tags';
	import InsightGroup from './InsightGroup.svelte';

	interface Props {
		transactions: Transaction[];
		/** Year to summarize (defaults to the current calendar year). */
		year?: number;
		/** When provided, tag rows open the tag report card. */
		onTagClick?: (tag: string) => void;
	}

	let { transactions, year = new Date().getFullYear(), onTagClick }: Props = $props();

	// Tag spending summary for the year
	let tagSummary = $derived.by(() => {
		const tagTotals = new Map<string, { total: number; count: number }>();
		const yearTransactions = transactions.filter(
			(t) => new Date(t.date).getFullYear() === year
		);

		for (const t of yearTransactions) {
			const tags = extractTags(t.notes);
			if (tags.length === 0) continue;
			const userAmount = getUserAmount(t);

			for (const tag of tags) {
				const existing = tagTotals.get(tag) || { total: 0, count: 0 };
				existing.total += userAmount;
				existing.count += 1;
				tagTotals.set(tag, existing);
			}
		}

		return Array.from(tagTotals.entries())
			.map(([tag, { total, count }]) => ({ tag, total: roundCurrency(total), count }))
			.sort((a, b) => b.total - a.total);
	});
</script>

{#if tagSummary.length > 0}
	<InsightGroup
		title="Tags in {year}"
		description="{tagSummary.length} tag{tagSummary.length !== 1 ? 's' : ''} used"
		defaultExpanded={false}
	>
		{#snippet preview()}
			<p class="text-sm text-charcoal">
				{#each tagSummary.slice(0, 2) as { tag, total }, i}
					{#if i > 0} · {/if}
					<span class="text-primary-600">#{tag}</span> {formatCurrencyWhole(total)}
				{/each}
				{#if tagSummary.length > 2}
					<span class="text-charcoal-muted"> +{tagSummary.length - 2} more</span>
				{/if}
			</p>
		{/snippet}

		<div class="space-y-1">
			{#each tagSummary as { tag, total, count }}
				<button
					type="button"
					disabled={!onTagClick}
					onclick={() => onTagClick?.(tag)}
					class="flex items-center justify-between py-1.5 px-2 -mx-2 rounded-lg w-full text-left {onTagClick ? 'hover:bg-surface-alt transition-colors cursor-pointer' : 'cursor-default'}"
				>
					<span class="text-sm text-primary-600 font-medium">#{tag}</span>
					<div class="text-right">
						<span class="font-mono text-sm text-charcoal">{formatCurrencyWhole(total)}</span>
						<span class="text-xs text-charcoal-muted ml-2">{count} txn{count !== 1 ? 's' : ''}</span>
					</div>
				</button>
			{/each}
		</div>
	</InsightGroup>
{/if}
