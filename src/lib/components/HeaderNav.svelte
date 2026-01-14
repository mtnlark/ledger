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

<header class="h-16 bg-surface border-b border-dashed border-theme-dashed">
	<div class="h-full max-w-4xl mx-auto px-4">
		<div class="h-full flex items-center gap-4">
			<!-- Back button (mobile only when showBack) -->
			{#if showBack}
				<a
					href="/"
					class="p-2 hover:bg-surface-hover rounded-lg transition-colors md:hidden text-charcoal-soft"
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
