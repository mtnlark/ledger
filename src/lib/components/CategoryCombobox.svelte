<script lang="ts">
	import type { Category } from '$lib/db';

	interface Props {
		categories: Category[];
		value: number;
		onSelect: (categoryId: number) => void;
	}

	let { categories, value, onSelect }: Props = $props();

	// Internal state
	let searchText = $state('');
	let isOpen = $state(false);
	let highlightedIndex = $state(0);
	let inputRef = $state<HTMLInputElement | null>(null);

	// Get active categories
	let activeCategories = $derived(categories.filter((c) => c.isActive));

	// Filter categories based on search
	let filteredCategories = $derived(
		searchText.trim() === ''
			? activeCategories
			: activeCategories.filter((c) =>
					c.name.toLowerCase().includes(searchText.toLowerCase())
				)
	);

	// Get selected category display
	let selectedCategory = $derived(categories.find((c) => c.id === value));
	let displayText = $derived(
		selectedCategory ? `${selectedCategory.icon} ${selectedCategory.name}` : ''
	);

	// Sync display text when value changes externally (e.g., form reset)
	$effect(() => {
		if (value === 0) {
			searchText = '';
		} else if (selectedCategory && !isOpen) {
			searchText = displayText;
		}
	});

	function handleFocus() {
		isOpen = true;
		searchText = '';
		highlightedIndex = 0;
	}

	function handleBlur(e: FocusEvent) {
		// Delay to allow click events on dropdown items
		setTimeout(() => {
			isOpen = false;
			// Restore display text if nothing selected
			if (selectedCategory) {
				searchText = displayText;
			} else {
				searchText = '';
			}
		}, 150);
	}

	function handleInput(e: Event) {
		const input = e.target as HTMLInputElement;
		searchText = input.value;
		isOpen = true;
		highlightedIndex = 0;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!isOpen) {
			if (e.key === 'ArrowDown' || e.key === 'Enter') {
				isOpen = true;
				e.preventDefault();
			}
			return;
		}

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				highlightedIndex = Math.min(highlightedIndex + 1, filteredCategories.length - 1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				highlightedIndex = Math.max(highlightedIndex - 1, 0);
				break;
			case 'Enter':
				e.preventDefault();
				if (filteredCategories[highlightedIndex]) {
					selectCategory(filteredCategories[highlightedIndex]);
				}
				break;
			case 'Escape':
				e.preventDefault();
				isOpen = false;
				if (selectedCategory) {
					searchText = displayText;
				}
				break;
			case 'Tab':
				// Allow default tab behavior but close dropdown
				isOpen = false;
				break;
		}
	}

	function selectCategory(cat: Category) {
		onSelect(cat.id!);
		searchText = `${cat.icon} ${cat.name}`;
		isOpen = false;
		inputRef?.blur();
	}
</script>

<div class="relative">
	<input
		bind:this={inputRef}
		type="text"
		id="category"
		value={isOpen ? searchText : (value ? displayText : '')}
		oninput={handleInput}
		onfocus={handleFocus}
		onblur={handleBlur}
		onkeydown={handleKeydown}
		placeholder="Type to search categories..."
		autocomplete="off"
		role="combobox"
		aria-expanded={isOpen}
		aria-haspopup="listbox"
		aria-autocomplete="list"
		class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
	/>

	<!-- Dropdown arrow -->
	<button
		type="button"
		tabindex={-1}
		onclick={() => {
			isOpen = !isOpen;
			if (isOpen) inputRef?.focus();
		}}
		class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
	>
		<svg
			class="w-4 h-4 transition-transform {isOpen ? 'rotate-180' : ''}"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</button>

	<!-- Dropdown list -->
	{#if isOpen}
		<ul
			role="listbox"
			class="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto"
		>
			{#if filteredCategories.length === 0}
				<li class="px-3 py-2 text-sm text-gray-500">No matching categories</li>
			{:else}
				{#each filteredCategories as cat, index (cat.id)}
					<li
						role="option"
						aria-selected={cat.id === value}
						class="px-3 py-2 cursor-pointer flex items-center gap-2 {index === highlightedIndex
							? 'bg-blue-50 text-blue-900'
							: 'hover:bg-gray-50'} {cat.id === value ? 'font-medium' : ''}"
						onmouseenter={() => (highlightedIndex = index)}
						onmousedown={() => selectCategory(cat)}
					>
						<span class="text-lg">{cat.icon}</span>
						<span class="text-sm">{cat.name}</span>
						{#if cat.id === value}
							<svg class="w-4 h-4 ml-auto text-blue-600" fill="currentColor" viewBox="0 0 20 20">
								<path
									fill-rule="evenodd"
									d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
									clip-rule="evenodd"
								/>
							</svg>
						{/if}
					</li>
				{/each}
			{/if}
		</ul>
	{/if}
</div>
