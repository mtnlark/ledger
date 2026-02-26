<script lang="ts">
	import type { Transaction } from '$lib/db';
	import { formatCurrencyWhole } from '$lib/utils/format-helpers';
	import { roundCurrency } from '$lib/utils/currency';
	import { extractTags } from '$lib/utils/tags';
	import InsightGroup from './InsightGroup.svelte';

	interface Props {
		transactions: Transaction[];
	}

	let { transactions }: Props = $props();

	let currentYear = new Date().getFullYear();

	// Tag spending summary for the year
	let tagSummary = $derived.by(() => {
		const tagTotals = new Map<string, { total: number; count: number }>();
		const yearTransactions = transactions.filter(
			(t) => new Date(t.date).getFullYear() === currentYear
		);

		for (const t of yearTransactions) {
			const tags = extractTags(t.notes);
			if (tags.length === 0) continue;
			const userAmount = t.isShared ? t.amount - t.partnerShare : t.amount;

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
		title="Tags This Year"
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

		{#snippet children()}
			<div class="space-y-2">
				{#each tagSummary as { tag, total, count }}
					<div class="flex items-center justify-between py-1.5">
						<span class="text-sm text-primary-600 font-medium">#{tag}</span>
						<div class="text-right">
							<span class="font-mono text-sm text-charcoal">{formatCurrencyWhole(total)}</span>
							<span class="text-xs text-charcoal-muted ml-2">{count} txn{count !== 1 ? 's' : ''}</span>
						</div>
					</div>
				{/each}
			</div>
		{/snippet}
	</InsightGroup>
{/if}
