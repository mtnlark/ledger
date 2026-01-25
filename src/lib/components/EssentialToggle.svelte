<script lang="ts">
	import type { Category } from '$lib/db';

	interface Props {
		isEssential: boolean;
		selectedCategory?: Category | null;
	}

	let {
		isEssential = $bindable(),
		selectedCategory = null
	}: Props = $props();
</script>

<!-- Essential Toggle -->
<div class="border-t border-dashed border-theme-dashed pt-4">
	<label class="flex items-center justify-between cursor-pointer">
		<div>
			<span class="text-sm font-medium text-charcoal-soft">Essential spending</span>
			<p class="text-xs text-charcoal-muted mt-0.5">
				{#if selectedCategory}
					Category default: {selectedCategory.isEssential ? 'Need' : 'Want'}
				{:else}
					Mark as a "need" vs discretionary "want"
				{/if}
			</p>
		</div>
		<button
			type="button"
			onclick={() => (isEssential = !isEssential)}
			class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-2 {isEssential ? 'bg-primary-500' : 'bg-[var(--color-border-dashed)]'}"
			role="switch"
			aria-checked={isEssential}
			aria-label="Toggle essential spending"
		>
			<span
				class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {isEssential ? 'translate-x-5' : 'translate-x-0'}"
			></span>
		</button>
	</label>
</div>
