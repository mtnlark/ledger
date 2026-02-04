<script lang="ts">
	import type { Transaction } from '$lib/db';
	import TagPopover from './TagPopover.svelte';

	interface Props {
		tag: string;
		onClick?: (tag: string) => void;
		transactions?: Transaction[];
	}

	let { tag, onClick, transactions = [] }: Props = $props();

	let showPopover = $state(false);
	let hoverTimeout = $state<ReturnType<typeof setTimeout> | null>(null);

	function handleMouseEnter(): void {
		hoverTimeout = setTimeout(() => {
			showPopover = true;
		}, 300);
	}

	function handleMouseLeave(): void {
		if (hoverTimeout) {
			clearTimeout(hoverTimeout);
			hoverTimeout = null;
		}
		showPopover = false;
	}

	function handleClick(e: MouseEvent): void {
		e.stopPropagation();
		onClick?.(tag);
	}

	function handleKeydown(e: KeyboardEvent): void {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			e.stopPropagation();
			onClick?.(tag);
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
	class="relative inline-flex"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
>
	{#if onClick}
		<button
			type="button"
			onclick={handleClick}
			onkeydown={handleKeydown}
			class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700 hover:bg-primary-200 transition-colors cursor-pointer"
		>
			{tag}
		</button>
	{:else}
		<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700">
			{tag}
		</span>
	{/if}

	{#if transactions.length > 0}
		<TagPopover {tag} {transactions} visible={showPopover} />
	{/if}
</span>
