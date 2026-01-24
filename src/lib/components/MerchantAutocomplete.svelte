<script lang="ts">
	import { getMerchantSuggestions, type MerchantSuggestion } from '$lib/stores/merchants';
	import type { Category } from '$lib/db';
	import { createCategoryHelpers } from '$lib/utils/category-helpers';

	interface Props {
		value: string;
		categories?: Category[];
		placeholder?: string;
		onInput: (value: string) => void;
		onSelect?: (merchant: string, categoryId: number | null) => void;
		class?: string;
		inputId?: string;
	}

	let {
		value,
		categories = [],
		placeholder = 'e.g., Shell, Amazon',
		onInput,
		onSelect,
		class: className = '',
		inputId = 'merchant'
	}: Props = $props();

	// Create category helpers bound to current categories
	let categoryHelpers = $derived(createCategoryHelpers(categories));

	let suggestions = $state<MerchantSuggestion[]>([]);
	let showSuggestions = $state(false);
	let selectedIndex = $state(-1);
	let inputElement = $state<HTMLInputElement | null>(null);

	// Debounce timer (per-instance to avoid cross-component interference)
	let debounceTimer = $state<ReturnType<typeof setTimeout> | undefined>(undefined);

	async function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		const newValue = target.value;
		onInput(newValue);

		// Debounce suggestions fetch
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(async () => {
			if (newValue.length >= 1) {
				suggestions = await getMerchantSuggestions(newValue, 5);
				showSuggestions = suggestions.length > 0;
				selectedIndex = -1;
			} else {
				suggestions = [];
				showSuggestions = false;
			}
		}, 150);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!showSuggestions || suggestions.length === 0) return;

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, -1);
				break;
			case 'Enter':
				if (selectedIndex >= 0) {
					e.preventDefault();
					selectSuggestion(suggestions[selectedIndex]);
				}
				break;
			case 'Escape':
				showSuggestions = false;
				selectedIndex = -1;
				break;
		}
	}

	function selectSuggestion(suggestion: MerchantSuggestion) {
		onInput(suggestion.merchant);
		showSuggestions = false;
		selectedIndex = -1;

		if (onSelect) {
			onSelect(suggestion.merchant, suggestion.mostCommonCategoryId);
		}

		// Focus back on input
		inputElement?.focus();
	}

	function handleFocus() {
		if (suggestions.length > 0 && value.length >= 1) {
			showSuggestions = true;
		}
	}

	function handleBlur(e: FocusEvent) {
		// Delay hiding to allow click on suggestion
		setTimeout(() => {
			showSuggestions = false;
			selectedIndex = -1;
		}, 150);
	}

	function getCategoryLabel(categoryId: number): string {
		const { icon, name } = categoryHelpers.getDisplay(categoryId);
		return name !== 'Unknown' ? `${icon} ${name}` : '';
	}
</script>

<div class="relative">
	<input
		type="text"
		id={inputId}
		{value}
		{placeholder}
		oninput={handleInput}
		onkeydown={handleKeydown}
		onfocus={handleFocus}
		onblur={handleBlur}
		bind:this={inputElement}
		autocomplete="off"
		class="w-full px-3 py-2.5 bg-cream border border-[rgba(45,42,38,0.15)] rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors placeholder:text-charcoal-muted {className}"
	/>

	{#if showSuggestions && suggestions.length > 0}
		<ul
			class="absolute z-50 w-full mt-1 bg-surface border border-theme rounded-lg shadow-lg overflow-hidden"
			role="listbox"
		>
			{#each suggestions as suggestion, i (suggestion.merchant)}
				<li
					role="option"
					aria-selected={i === selectedIndex}
					class="px-3 py-2.5 cursor-pointer transition-colors {i === selectedIndex
						? 'bg-primary-50 text-primary-700'
						: 'hover:bg-surface-hover'}"
					onmousedown={() => selectSuggestion(suggestion)}
				>
					<div class="flex items-center justify-between">
						<span class="font-medium text-charcoal">{suggestion.merchant}</span>
						<span class="text-xs text-charcoal-muted">
							{suggestion.count} {suggestion.count === 1 ? 'time' : 'times'}
						</span>
					</div>
					{#if suggestion.mostCommonCategoryId && categories.length > 0}
						<div class="text-xs text-charcoal-muted mt-0.5">
							Usually: {getCategoryLabel(suggestion.mostCommonCategoryId)}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
