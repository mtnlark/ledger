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
	<div class="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
		<Icon size={32} class="text-gray-400" />
	</div>
	<h3 class="text-lg font-medium text-gray-900 mb-1">{title}</h3>
	{#if description}
		<p class="text-sm text-gray-500 max-w-xs">{description}</p>
	{/if}
	{#if actionLabel && onAction}
		<button
			onclick={onAction}
			class="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
		>
			{actionLabel}
		</button>
	{/if}
</div>
