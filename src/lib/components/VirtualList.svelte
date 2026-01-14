<script lang="ts" generics="T">
	import { onMount } from 'svelte';

	interface Props {
		items: T[];
		itemHeight: number;
		containerHeight?: number;
		overscan?: number;
		getKey?: (item: T, index: number) => string | number;
	}

	let {
		items,
		itemHeight,
		containerHeight = 600,
		overscan = 3,
		getKey = (_item: T, index: number) => index
	}: Props = $props();

	let scrollTop = $state(0);
	let containerRef: HTMLDivElement;

	// Calculate visible range
	let visibleRange = $derived.by(() => {
		const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
		const visibleCount = Math.ceil(containerHeight / itemHeight) + 2 * overscan;
		const endIndex = Math.min(items.length, startIndex + visibleCount);
		return { startIndex, endIndex };
	});

	// Get visible items with their positions
	let visibleItems = $derived(
		items.slice(visibleRange.startIndex, visibleRange.endIndex).map((item, i) => ({
			item,
			index: visibleRange.startIndex + i,
			style: `position: absolute; top: ${(visibleRange.startIndex + i) * itemHeight}px; left: 0; right: 0; height: ${itemHeight}px;`
		}))
	);

	// Total height for scroll area
	let totalHeight = $derived(items.length * itemHeight);

	function handleScroll(e: Event) {
		const target = e.target as HTMLDivElement;
		scrollTop = target.scrollTop;
	}

	onMount(() => {
		// Initial scroll position
		if (containerRef) {
			scrollTop = containerRef.scrollTop;
		}
	});
</script>

<div
	bind:this={containerRef}
	class="virtual-list-container"
	style="height: {containerHeight}px; overflow-y: auto; position: relative;"
	onscroll={handleScroll}
>
	<div class="virtual-list-spacer" style="height: {totalHeight}px; position: relative;">
		{#each visibleItems as { item, index, style } (getKey(item, index))}
			<div {style}>
				<slot {item} {index} />
			</div>
		{/each}
	</div>
</div>
