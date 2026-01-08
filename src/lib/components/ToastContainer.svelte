<script lang="ts">
	import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-svelte';
	import { toasts, toast, type ToastType } from '$lib/stores/toast';
	import { fly, fade } from 'svelte/transition';

	const iconMap: Record<ToastType, typeof CheckCircle> = {
		success: CheckCircle,
		error: AlertCircle,
		info: Info,
		warning: AlertTriangle
	};

	const colorMap: Record<ToastType, { bg: string; border: string; text: string; icon: string }> = {
		success: {
			bg: 'bg-green-50',
			border: 'border-green-200',
			text: 'text-green-800',
			icon: 'text-green-500'
		},
		error: {
			bg: 'bg-red-50',
			border: 'border-red-200',
			text: 'text-red-800',
			icon: 'text-red-500'
		},
		info: {
			bg: 'bg-blue-50',
			border: 'border-blue-200',
			text: 'text-blue-800',
			icon: 'text-blue-500'
		},
		warning: {
			bg: 'bg-amber-50',
			border: 'border-amber-200',
			text: 'text-amber-800',
			icon: 'text-amber-500'
		}
	};
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
			in:fly={{ y: 20, duration: 200 }}
			out:fade={{ duration: 150 }}
			class="flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border {colors.bg} {colors.border}"
		>
			<Icon size={20} class={colors.icon} />
			<p class="flex-1 text-sm font-medium {colors.text}">{t.message}</p>
			<button
				onclick={() => toast.dismiss(t.id)}
				class="p-1 rounded-lg hover:bg-black/5 transition-colors {colors.text}"
				aria-label="Dismiss notification"
			>
				<X size={16} />
			</button>
		</div>
	{/each}
</div>
