<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { X, CheckCircle, AlertCircle, Info, AlertTriangle, Trash2 } from 'lucide-svelte';
	import { toasts, toast, type ToastType } from '$lib/stores/toast';

	const iconMap: Record<ToastType, typeof CheckCircle> = {
		success: CheckCircle,
		error: AlertCircle,
		info: Info,
		warning: AlertTriangle,
		undo: Trash2
	};

	const colorMap: Record<ToastType, { bg: string; border: string; text: string; icon: string }> = {
		success: {
			bg: 'bg-success-50',
			border: 'border-success-200',
			text: 'text-success-800',
			icon: 'text-success-500'
		},
		error: {
			bg: 'bg-danger-50',
			border: 'border-danger-200',
			text: 'text-danger-800',
			icon: 'text-danger-500'
		},
		info: {
			bg: 'bg-primary-50',
			border: 'border-primary-200',
			text: 'text-primary-800',
			icon: 'text-primary-500'
		},
		warning: {
			bg: 'bg-warning-50',
			border: 'border-warning-200',
			text: 'text-warning-800',
			icon: 'text-warning-500'
		},
		undo: {
			bg: 'bg-charcoal',
			border: 'border-charcoal',
			text: 'text-cream',
			icon: 'text-cream/80'
		}
	};

	function handleAction(t: (typeof $toasts)[0]) {
		if (t.onAction) {
			t.onAction();
		}
		// Dismiss without calling onDismiss since action was taken
		toast.dismissWithoutCallback(t.id);
	}
</script>

<!-- Toast container - fixed position at bottom of screen, above bottom nav on mobile -->
<div
	class="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-md px-4"
	aria-live="polite"
	aria-label="Notifications"
>
	{#each $toasts as t (t.id)}
		{@const colors = colorMap[t.type]}
		{@const Icon = iconMap[t.type]}
		<div
			role="alert"
			in:fly={{ y: 20, duration: 300 }}
			out:fade={{ duration: 200 }}
			class="rounded-lg shadow-lg border overflow-hidden {colors.bg} {colors.border}"
		>
			<div class="flex items-center gap-3 px-4 py-3">
				<Icon size={20} class={colors.icon} />
				<p class="flex-1 text-sm font-medium {colors.text}">{t.message}</p>
				{#if t.actionLabel && t.onAction}
					<button
						onclick={() => handleAction(t)}
						class="px-3 py-1 text-sm font-medium rounded-md bg-primary-500 text-white hover:bg-primary-600 transition-colors"
					>
						{t.actionLabel}
					</button>
				{/if}
				<button
					onclick={() => toast.dismiss(t.id)}
					class="p-1 rounded-lg transition-colors {t.type === 'undo' ? 'hover:bg-white/10' : 'hover:bg-black/5'} {colors.text}"
					aria-label="Dismiss notification"
				>
					<X size={16} />
				</button>
			</div>
			{#if t.showCountdown && t.duration > 0}
				<div class="h-1 bg-black/10">
					<div
						class="h-full bg-primary-500 origin-left animate-shrink"
						style="animation-duration: {t.duration}ms"
					></div>
				</div>
			{/if}
		</div>
	{/each}
</div>

<style>
	@keyframes shrink {
		from {
			transform: scaleX(1);
		}
		to {
			transform: scaleX(0);
		}
	}

	.animate-shrink {
		animation: shrink linear forwards;
	}
</style>
