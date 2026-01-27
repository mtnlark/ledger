<script lang="ts">
	import { X, Command } from 'lucide-svelte';
	import { slide, fade } from 'svelte/transition';

	interface Props {
		onOpenQuickAdd?: () => void;
		onFocusSearch?: () => void;
	}

	let { onOpenQuickAdd, onFocusSearch }: Props = $props();

	let showHelp = $state(false);

	const shortcuts = [
		{ keys: ['⌘', 'K'], description: 'Focus search', action: 'search' },
		{ keys: ['⌘', 'N'], description: 'Quick add transaction', action: 'quickadd' },
		{ keys: ['⌘', '/'], description: 'Show keyboard shortcuts', action: 'help' },
		{ keys: ['Esc'], description: 'Close modals / Clear selection', action: 'escape' }
	];

	function handleKeydown(e: KeyboardEvent) {
		// Don't trigger shortcuts when typing in inputs
		const target = e.target as HTMLElement;
		const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

		// Allow Escape in inputs to blur them
		if (e.key === 'Escape' && isInput) {
			target.blur();
			return;
		}

		// Don't trigger other shortcuts when in inputs
		if (isInput) return;

		const isMeta = e.metaKey || e.ctrlKey;

		if (isMeta && e.key === 'k') {
			e.preventDefault();
			onFocusSearch?.();
		} else if (isMeta && e.key === 'n') {
			e.preventDefault();
			onOpenQuickAdd?.();
		} else if (isMeta && e.key === '/') {
			e.preventDefault();
			showHelp = !showHelp;
		} else if (e.key === 'Escape' && showHelp) {
			showHelp = false;
		}
	}

	function closeHelp() {
		showHelp = false;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Keyboard Shortcuts Help Modal -->
{#if showHelp}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 bg-charcoal/50 z-50"
		transition:fade={{ duration: 150 }}
		onclick={closeHelp}
		onkeydown={(e) => e.key === 'Escape' && closeHelp()}
		role="button"
		tabindex="-1"
	></div>

	<!-- Modal -->
	<div
		class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md"
		transition:slide={{ duration: 200 }}
	>
		<div class="bg-surface rounded-xl shadow-xl mx-4 overflow-hidden">
			<!-- Header -->
			<div class="flex items-center justify-between px-5 py-4 border-b border-theme-muted">
				<h2 class="font-display text-lg font-semibold text-charcoal flex items-center gap-2">
					<Command size={20} class="text-primary-500" />
					Keyboard Shortcuts
				</h2>
				<button
					onclick={closeHelp}
					class="p-1.5 rounded-lg text-charcoal-muted hover:text-charcoal hover:bg-cream transition-colors"
				>
					<X size={20} />
				</button>
			</div>

			<!-- Shortcuts List -->
			<div class="px-5 py-4 space-y-3">
				{#each shortcuts as shortcut}
					<div class="flex items-center justify-between">
						<span class="text-charcoal">{shortcut.description}</span>
						<div class="flex items-center gap-1">
							{#each shortcut.keys as key}
								<kbd class="inline-flex items-center justify-center min-w-[28px] h-7 px-2 bg-cream border border-theme-muted rounded-md text-xs font-mono font-medium text-charcoal-muted shadow-sm">
									{key}
								</kbd>
							{/each}
						</div>
					</div>
				{/each}
			</div>

			<!-- Footer hint -->
			<div class="px-5 py-3 bg-cream/50 border-t border-theme-muted">
				<p class="text-xs text-charcoal-muted text-center">
					Press <kbd class="px-1.5 py-0.5 bg-cream border border-theme-muted rounded text-xs font-mono">Esc</kbd> to close
				</p>
			</div>
		</div>
	</div>
{/if}
