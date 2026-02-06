<script lang="ts">
	import { X } from 'lucide-svelte';
	import { fade, scale } from 'svelte/transition';
	import { focusTrap } from '$lib/utils/focus-trap';
	import type { Snippet } from 'svelte';

	interface Props {
		isOpen: boolean;
		title: string;
		titleId?: string;
		maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
		zIndex?: number;
		showCloseButton?: boolean;
		onClose: () => void;
		children: Snippet;
	}

	let {
		isOpen,
		title,
		titleId,
		maxWidth = 'md',
		zIndex = 50,
		showCloseButton = true,
		onClose,
		children
	}: Props = $props();

	// Generate a unique ID for accessibility if not provided
	const generatedTitleId = titleId ?? `modal-title-${Math.random().toString(36).substring(2, 9)}`;

	// Max width classes
	const maxWidthClasses: Record<string, string> = {
		sm: 'max-w-sm',
		md: 'max-w-md',
		lg: 'max-w-lg',
		xl: 'max-w-xl'
	};

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onClose();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (isOpen && e.key === 'Escape') {
			onClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}

	<!-- Backdrop -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 backdrop-blur-sm"
		style="z-index: {zIndex};"
		onclick={handleBackdropClick}
		transition:fade={{ duration: 150 }}
	>
		<!-- Modal -->
		<div
			class="bg-surface rounded-xl shadow-xl shadow-[var(--color-shadow)] w-full {maxWidthClasses[
				maxWidth
			]} max-h-[90vh] overflow-y-auto"
			transition:scale={{ duration: 200, start: 0.95 }}
			role="dialog"
			aria-modal="true"
			aria-labelledby={generatedTitleId}
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			use:focusTrap
		>
			<!-- Header -->
			<div
				class="px-6 py-4 border-b border-dashed border-theme-dashed flex items-center justify-between"
			>
				<h2 id={generatedTitleId} class="font-display text-xl font-medium text-charcoal">
					{title}
				</h2>
				{#if showCloseButton}
					<button
						type="button"
						onclick={onClose}
						class="text-charcoal-muted hover:text-charcoal p-1.5 hover:bg-surface-hover rounded-lg transition-colors"
						aria-label="Close"
					>
						<X size={20} />
					</button>
				{/if}
			</div>

			<!-- Content -->
			{@render children()}
		</div>
	</div>
{/if}
