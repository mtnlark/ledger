<script lang="ts">
	import type { Category } from '$lib/db';
	import { formatCurrencyWhole } from '$lib/utils/format-helpers';

	interface Props {
		categories: Category[];
		selectedId: number | null;
		spending?: Map<number, number>;
		onSelect: (id: number) => void;
	}

	let { categories, selectedId, spending, onSelect }: Props = $props();

	// Sort alphabetically
	let sortedCategories = $derived(
		[...categories].sort((a, b) => a.name.localeCompare(b.name))
	);
</script>

<div class="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
	{#each sortedCategories as cat}
		{@const isSelected = cat.id === selectedId}
		{@const spent = spending?.get(cat.id!) || 0}
		<button
			type="button"
			onclick={() => onSelect(cat.id!)}
			class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors shrink-0
				{isSelected
					? 'bg-primary-500 text-white'
					: 'bg-surface-alt text-charcoal-soft hover:bg-cream-dark'}"
		>
			<span>{cat.icon || '📁'}</span>
			<span>{cat.name}</span>
			{#if spent > 0}
				<span class="text-xs {isSelected ? 'text-white/70' : 'text-charcoal-muted'}">
					{formatCurrencyWhole(spent)}
				</span>
			{/if}
		</button>
	{/each}
</div>

<style>
	.scrollbar-thin::-webkit-scrollbar {
		height: 4px;
	}
	.scrollbar-thin::-webkit-scrollbar-track {
		background: transparent;
	}
	.scrollbar-thin::-webkit-scrollbar-thumb {
		background: var(--color-charcoal-muted);
		border-radius: 2px;
		opacity: 0.3;
	}
</style>
