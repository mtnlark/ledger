<script lang="ts">
	import type { Transaction, Category } from '$lib/db';
	import { roundCurrency } from '$lib/utils/currency';
	import { formatCurrencyWhole } from '$lib/utils/format-helpers';

	interface Props {
		transactions: Transaction[];
		categories: Category[];
	}

	let { transactions, categories }: Props = $props();

	interface TreemapItem {
		id: number;
		name: string;
		icon: string;
		amount: number;
		percent: number;
		color: string;
	}

	// Compute category spending
	let categoryData = $derived.by(() => {
		const byCategory = new Map<number, number>();
		for (const t of transactions) {
			const userAmount = t.isShared ? t.amount - t.partnerShare : t.amount;
			byCategory.set(t.categoryId, (byCategory.get(t.categoryId) || 0) + userAmount);
		}

		const items: TreemapItem[] = [];
		let total = 0;

		for (const [catId, amount] of byCategory) {
			if (amount <= 0) continue;
			const cat = categories.find(c => c.id === catId);
			if (!cat) continue;
			total += amount;
			items.push({
				id: catId,
				name: cat.name,
				icon: cat.icon || '📁',
				amount: roundCurrency(amount),
				percent: 0,
				color: cat.color || '#C45D3A'
			});
		}

		// Calculate percentages and sort
		for (const item of items) {
			item.percent = Math.round((item.amount / total) * 100);
		}
		items.sort((a, b) => b.amount - a.amount);

		return { items, total };
	});

	// Simple squarified treemap layout
	function computeLayout(items: TreemapItem[], width: number, height: number) {
		if (items.length === 0) return [];

		const total = items.reduce((sum, i) => sum + i.amount, 0);
		const rects: Array<TreemapItem & { x: number; y: number; w: number; h: number }> = [];

		let x = 0, y = 0, remainingWidth = width, remainingHeight = height;
		let isHorizontal = width >= height;

		for (const item of items) {
			const ratio = item.amount / total;
			let w: number, h: number;

			if (isHorizontal) {
				w = remainingWidth * ratio * (items.length / (items.length - rects.length));
				h = remainingHeight;
				if (rects.length === items.length - 1) w = remainingWidth; // Last item takes rest
			} else {
				w = remainingWidth;
				h = remainingHeight * ratio * (items.length / (items.length - rects.length));
				if (rects.length === items.length - 1) h = remainingHeight;
			}

			rects.push({ ...item, x, y, w: Math.max(w, 0), h: Math.max(h, 0) });

			if (isHorizontal) {
				x += w;
				remainingWidth -= w;
			} else {
				y += h;
				remainingHeight -= h;
			}

			// Alternate direction for better squarification
			if (rects.length % 3 === 0) isHorizontal = !isHorizontal;
		}

		return rects;
	}

	let containerWidth = $state(400);
	let containerHeight = $state(250);

	let layout = $derived(computeLayout(categoryData.items, containerWidth, containerHeight));
</script>

<div
	class="relative w-full rounded-lg overflow-hidden"
	style="height: {containerHeight}px"
	bind:clientWidth={containerWidth}
>
	{#each layout as rect}
		{@const showLabel = rect.w > 60 && rect.h > 40}
		{@const showAmount = rect.w > 80 && rect.h > 50}
		<div
			class="absolute flex flex-col items-center justify-center text-white text-center p-1 transition-opacity hover:opacity-90"
			style="
				left: {rect.x}px;
				top: {rect.y}px;
				width: {rect.w}px;
				height: {rect.h}px;
				background-color: {rect.color};
			"
			title="{rect.icon} {rect.name}: {formatCurrencyWhole(rect.amount)} ({rect.percent}%)"
		>
			{#if showLabel}
				<span class="text-lg">{rect.icon}</span>
				{#if showAmount}
					<span class="text-xs font-mono font-medium mt-0.5">{formatCurrencyWhole(rect.amount)}</span>
				{/if}
			{/if}
		</div>
	{/each}
</div>

{#if categoryData.items.length === 0}
	<p class="text-sm text-charcoal-muted text-center py-8">No spending data</p>
{/if}
