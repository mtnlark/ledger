<script lang="ts">
	import type { ComponentType } from 'svelte';
	import { Receipt, Users, BarChart3, FileText } from 'lucide-svelte';

	interface Props {
		icon?: ComponentType;
		title: string;
		description?: string;
		actionLabel?: string;
		onAction?: () => void;
	}

	let { icon: Icon = Receipt as ComponentType, title, description, actionLabel, onAction }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center py-12 px-6 text-center">
	<div class="relative w-24 h-24 flex items-center justify-center mb-4">
		<!-- Decorative hand-drawn rings -->
		<svg class="absolute inset-0 w-full h-full text-charcoal-muted opacity-[0.15]" viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="4 3" stroke-linecap="round">
			<circle cx="48" cy="48" r="44" />
			<circle cx="48" cy="48" r="36" stroke-dasharray="2 5" />
		</svg>
		<!-- Accent dots -->
		<svg class="absolute inset-0 w-full h-full text-primary-300 opacity-60" viewBox="0 0 96 96" fill="currentColor">
			<circle cx="14" cy="28" r="2" />
			<circle cx="82" cy="68" r="1.5" />
			<circle cx="76" cy="22" r="1" />
		</svg>
		<div class="w-14 h-14 rounded-full bg-surface-alt flex items-center justify-center">
			<Icon size={28} class="text-charcoal-muted" />
		</div>
	</div>
	<h3 class="font-display text-lg font-medium text-charcoal mb-1">{title}</h3>
	{#if description}
		<p class="text-sm text-charcoal-muted max-w-xs">{description}</p>
	{/if}
	{#if actionLabel && onAction}
		<button
			onclick={onAction}
			class="mt-4 px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary-500/25 active:scale-[0.97] transition-all duration-150"
		>
			{actionLabel}
		</button>
	{/if}
</div>
