<script lang="ts">
	import { ChevronLeft } from 'lucide-svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		title?: string;
		showBack?: boolean;
		children?: Snippet;
	}

	let { title = 'Ledger', showBack = false, children }: Props = $props();
</script>

<header class="bg-white border-b border-dashed border-gray-200 sticky top-0 z-20">
	<div class="max-w-4xl mx-auto px-4 py-4">
		<div class="flex items-center gap-4">
			<!-- Back button (mobile only when showBack) -->
			{#if showBack}
				<a
					href="/"
					class="p-2 hover:bg-cream rounded-lg transition-colors md:hidden text-charcoal-soft"
					aria-label="Back to dashboard"
				>
					<ChevronLeft size={20} />
				</a>
			{/if}

			<!-- Title -->
			<h1 class="font-display text-xl font-medium text-charcoal">{title}</h1>

			<!-- Spacer to push slot content to the right -->
			<div class="flex-1"></div>

			<!-- Slot for additional header content (like month navigation) -->
			{#if children}
				{@render children()}
			{/if}
		</div>
	</div>
</header>
