<script lang="ts">
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

	let isExpanded = $state(defaultExpanded);
</script>

<div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
	<!-- Header (always visible, clickable) -->
	<button
		class="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
		onclick={() => (isExpanded = !isExpanded)}
	>
		<div class="text-left">
			<h2 class="text-lg font-semibold text-gray-900">{title}</h2>
			{#if description}
				<p class="text-sm text-gray-500 mt-0.5">{description}</p>
			{/if}
		</div>
		<div class="text-gray-400 ml-4 flex-shrink-0">
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
		<div transition:slide={{ duration: 200 }} class="px-6 pb-6 border-t border-gray-100 pt-4">
			{@render children()}
		</div>
	{/if}
</div>
