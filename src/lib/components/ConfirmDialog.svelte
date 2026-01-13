<script lang="ts">
	import { X, AlertTriangle } from 'lucide-svelte';

	interface Props {
		isOpen: boolean;
		title?: string;
		message: string;
		confirmText?: string;
		cancelText?: string;
		variant?: 'danger' | 'warning' | 'default';
		onConfirm: () => void;
		onCancel: () => void;
	}

	let {
		isOpen,
		title = 'Confirm',
		message,
		confirmText = 'Confirm',
		cancelText = 'Cancel',
		variant = 'default',
		onConfirm,
		onCancel
	}: Props = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onCancel();
		}
	}

	let buttonClass = $derived(
		variant === 'danger'
			? 'bg-danger-500 hover:bg-danger-600 focus:ring-danger-500/20'
			: variant === 'warning'
				? 'bg-warning-500 hover:bg-warning-600 focus:ring-warning-500/20'
				: 'bg-primary-500 hover:bg-primary-600 focus:ring-primary-500/20'
	);
</script>

<svelte:window onkeydown={isOpen ? handleKeydown : undefined} />

{#if isOpen}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm"
		onclick={onCancel}
		onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onCancel(); }}
		role="button"
		tabindex="-1"
		aria-label="Close dialog"
	></div>

	<!-- Dialog -->
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<div
			class="bg-surface rounded-xl shadow-xl shadow-[var(--color-shadow)] w-full max-w-sm animate-enter"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			aria-labelledby="confirm-dialog-title"
			tabindex="-1"
		>
			<!-- Header -->
			<div class="flex items-center gap-3 px-6 py-4 border-b border-dashed border-theme-dashed">
				{#if variant === 'danger' || variant === 'warning'}
					<div class="w-10 h-10 rounded-full flex items-center justify-center {variant === 'danger' ? 'bg-danger-100' : 'bg-warning-100'}">
						<AlertTriangle size={20} class="{variant === 'danger' ? 'text-danger-500' : 'text-warning-500'}" />
					</div>
				{/if}
				<h2 id="confirm-dialog-title" class="font-display text-lg font-medium text-charcoal flex-1">
					{title}
				</h2>
				<button
					type="button"
					onclick={onCancel}
					class="p-2 text-charcoal-muted hover:text-charcoal hover:bg-cream rounded-lg transition-colors"
					aria-label="Close"
				>
					<X size={18} />
				</button>
			</div>

			<!-- Body -->
			<div class="px-6 py-4">
				<p class="text-charcoal-soft">{message}</p>
			</div>

			<!-- Footer -->
			<div class="flex gap-3 px-6 py-4 border-t border-dashed border-theme-dashed bg-surface-alt rounded-b-xl">
				<button
					type="button"
					onclick={onConfirm}
					class="flex-1 text-white py-2.5 px-4 rounded-lg font-medium focus:ring-2 focus:ring-offset-2 transition-all duration-150 {buttonClass}"
				>
					{confirmText}
				</button>
				<button
					type="button"
					onclick={onCancel}
					class="flex-1 px-4 py-2.5 border border-[rgba(45,42,38,0.15)] text-charcoal-soft rounded-lg font-medium hover:bg-cream transition-colors"
				>
					{cancelText}
				</button>
			</div>
		</div>
	</div>
{/if}
