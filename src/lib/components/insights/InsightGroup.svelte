<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { ChevronDown, ChevronUp } from 'lucide-svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		description?: string;
		defaultExpanded?: boolean;
		preview: Snippet;
		children: Snippet;
	}

	let { title, description, defaultExpanded = false, preview, children }: Props = $props();

	// Create a storage key based on title
	let storageKey = $derived(`ledger-insight-${title.toLowerCase().replace(/\s+/g, '-')}`);

	let isExpanded = $state(defaultExpanded);

	onMount(() => {
		const stored = localStorage.getItem(storageKey);
		if (stored !== null) {
			isExpanded = stored === 'true';
		}
	});

	function toggleExpanded() {
		isExpanded = !isExpanded;
		localStorage.setItem(storageKey, String(isExpanded));
	}
</script>

<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden card-interactive">
	<!-- Header (always visible, clickable) -->
	<button
		class="w-full px-6 py-4 flex items-center justify-between hover:bg-cream/50 transition-colors"
		onclick={toggleExpanded}
	>
		<div class="text-left">
			<h2 class="font-display text-xl font-medium text-charcoal">{title}</h2>
			{#if description}
				<p class="text-sm text-charcoal-muted mt-0.5">{description}</p>
			{/if}
		</div>
		<div class="text-charcoal-muted ml-4 flex-shrink-0">
			{#if isExpanded}
				<ChevronUp size={20} />
			{:else}
				<ChevronDown size={20} />
			{/if}
		</div>
	</button>

	<!-- Preview (shown when collapsed) -->
	{#if !isExpanded}
		<div class="px-6 pb-4 pt-0">
			{@render preview()}
		</div>
	{/if}

	<!-- Full content (shown when expanded) -->
	{#if isExpanded}
		<div transition:slide={{ duration: 200 }} class="px-6 pb-6 border-t border-dashed border-theme-dashed pt-4">
			{@render children()}
		</div>
	{/if}
</div>
