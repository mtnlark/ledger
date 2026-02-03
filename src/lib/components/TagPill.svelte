<script lang="ts">
	interface Props {
		tag: string;
		onClick?: (tag: string) => void;
	}

	let { tag, onClick }: Props = $props();

	function handleClick(e: MouseEvent): void {
		e.stopPropagation();
		onClick?.(tag);
	}

	function handleKeydown(e: KeyboardEvent): void {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			e.stopPropagation();
			onClick?.(tag);
		}
	}
</script>

{#if onClick}
	<button
		type="button"
		onclick={handleClick}
		onkeydown={handleKeydown}
		class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700 hover:bg-primary-200 transition-colors cursor-pointer"
	>
		{tag}
	</button>
{:else}
	<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700">
		{tag}
	</span>
{/if}
