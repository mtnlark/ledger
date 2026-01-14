<script lang="ts">
	import { Trash2 } from 'lucide-svelte';
	import type { Category } from '$lib/db';

	interface Props {
		categoryId: number;
		amount: number;
		categories: Category[];
		canRemove: boolean;
		onCategoryChange: (categoryId: number) => void;
		onAmountChange: (amount: number) => void;
		onRemove: () => void;
	}

	let {
		categoryId,
		amount,
		categories,
		canRemove,
		onCategoryChange,
		onAmountChange,
		onRemove
	}: Props = $props();

	// Filter to active categories only
	let activeCategories = $derived(categories.filter((c) => c.isActive));
</script>

<div class="flex items-center gap-2">
	<select
		value={categoryId}
		onchange={(e) => onCategoryChange(parseInt(e.currentTarget.value))}
		class="flex-1 px-3 py-2 bg-surface border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors text-sm"
	>
		<option value={0}>Select category...</option>
		{#each activeCategories as cat (cat.id)}
			<option value={cat.id}>{cat.icon} {cat.name}</option>
		{/each}
	</select>
	<div class="relative w-24">
		<span class="absolute left-2 top-1/2 -translate-y-1/2 text-charcoal-muted font-mono text-sm"
			>$</span
		>
		<input
			type="number"
			value={amount}
			oninput={(e) => onAmountChange(parseFloat(e.currentTarget.value) || 0)}
			step="0.01"
			min="0"
			class="w-full pl-5 pr-2 py-2 bg-surface border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors font-mono text-sm"
		/>
	</div>
	<button
		type="button"
		onclick={onRemove}
		disabled={!canRemove}
		class="p-1.5 text-charcoal-muted hover:text-danger-500 hover:bg-danger-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
		aria-label="Remove line"
	>
		<Trash2 size={14} />
	</button>
</div>
