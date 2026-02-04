<script lang="ts">
	import type { Transaction } from '$lib/db';
	import { calculateTagTotal } from '$lib/utils/tags';
	import { formatCurrency } from '$lib/utils/format-helpers';
	import { tagIndex } from '$lib/stores/tags.svelte';

	interface Props {
		tag: string;
		transactions: Transaction[];
		visible: boolean;
	}

	let { tag, transactions, visible }: Props = $props();

	let total = $derived(calculateTagTotal(transactions, tag));
	let count = $derived(tagIndex.getTransactionCountForTag(tag));
</script>

{#if visible}
	<div
		class="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 pointer-events-auto"
		role="tooltip"
	>
		<div class="bg-surface rounded-lg shadow-lg border border-theme px-3 py-2 whitespace-nowrap text-sm">
			<div class="font-mono font-semibold text-charcoal">{formatCurrency(total)}</div>
			<div class="text-xs text-charcoal-muted">across {count} transaction{count !== 1 ? 's' : ''}</div>
		</div>
		<!-- Arrow pointing down -->
		<div class="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-[var(--color-border)]"></div>
	</div>
{/if}
