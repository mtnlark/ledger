<script lang="ts">
	import { tagIndex } from '$lib/stores/tags.js';

	interface Props {
		value: string;
		onInput: (value: string) => void;
		placeholder?: string;
		id?: string;
	}

	let { value, onInput, placeholder = '', id }: Props = $props();

	let inputElement = $state<HTMLInputElement | null>(null);
	let showSuggestions = $state(false);
	let suggestions = $state<string[]>([]);
	let selectedIndex = $state(-1);
	let hashStartIndex = $state(-1);

	function handleInput(e: Event): void {
		const input = e.currentTarget as HTMLInputElement;
		const newValue = input.value;
		const cursorPos = input.selectionStart ?? 0;

		onInput(newValue);

		const beforeCursor = newValue.slice(0, cursorPos);
		const hashMatch = beforeCursor.match(/#([a-zA-Z0-9-]*)$/);

		if (hashMatch) {
			hashStartIndex = beforeCursor.lastIndexOf('#');
			const prefix = hashMatch[1];
			suggestions = tagIndex.getTagSuggestions(prefix).slice(0, 5);
			showSuggestions = suggestions.length > 0;
			selectedIndex = -1;
		} else {
			showSuggestions = false;
			hashStartIndex = -1;
		}
	}

	function selectSuggestion(tag: string): void {
		if (hashStartIndex === -1) return;

		const before = value.slice(0, hashStartIndex);
		const cursorPos = inputElement?.selectionStart ?? value.length;
		const after = value.slice(cursorPos);

		const newValue = `${before}#${tag}${after ? ' ' + after.trimStart() : ' '}`;
		onInput(newValue);

		showSuggestions = false;
		hashStartIndex = -1;

		setTimeout(() => {
			inputElement?.focus();
			const newCursorPos = before.length + tag.length + 2;
			inputElement?.setSelectionRange(newCursorPos, newCursorPos);
		}, 0);
	}

	function handleKeydown(e: KeyboardEvent): void {
		if (!showSuggestions) return;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, -1);
		} else if (e.key === 'Enter' && selectedIndex >= 0) {
			e.preventDefault();
			selectSuggestion(suggestions[selectedIndex]);
		} else if (e.key === 'Escape') {
			showSuggestions = false;
		}
	}

	function handleBlur(): void {
		setTimeout(() => {
			showSuggestions = false;
		}, 150);
	}
</script>

<div class="relative">
	<input
		type="text"
		{id}
		bind:this={inputElement}
		{value}
		oninput={handleInput}
		onkeydown={handleKeydown}
		onblur={handleBlur}
		{placeholder}
		class="w-full px-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors placeholder:text-charcoal-muted"
	/>

	{#if showSuggestions}
		<div class="absolute left-0 right-0 top-full mt-1 bg-surface rounded-lg shadow-lg border border-theme z-50 py-1">
			{#each suggestions as tag, i (tag)}
				<button
					type="button"
					onclick={() => selectSuggestion(tag)}
					class="w-full px-3 py-2 text-left text-sm hover:bg-surface-hover transition-colors {i === selectedIndex ? 'bg-primary-50' : ''}"
				>
					#{tag}
				</button>
			{/each}
		</div>
	{/if}
</div>
