<script lang="ts">
	import { Trash2, FolderInput, X, ChevronUp, Check } from 'lucide-svelte';
	import type { Category } from '$lib/db';

	interface Props {
		selectedCount: number;
		categories: Category[];
		onDelete: () => void;
		onCategoryChange: (categoryId: number) => void;
		onCancel: () => void;
	}

	let { selectedCount, categories, onDelete, onCategoryChange, onCancel }: Props = $props();

	// Category dropdown state
	let showCategoryDropdown = $state(false);
	let highlightedIndex = $state(0);

	// Get active categories
	let activeCategories = $derived(categories.filter((c) => c.isActive));

	function handleCategorySelect(categoryId: number) {
		showCategoryDropdown = false;
		onCategoryChange(categoryId);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!showCategoryDropdown) return;

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				highlightedIndex = Math.min(highlightedIndex + 1, activeCategories.length - 1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				highlightedIndex = Math.max(highlightedIndex - 1, 0);
				break;
			case 'Enter':
				e.preventDefault();
				if (activeCategories[highlightedIndex]) {
					handleCategorySelect(activeCategories[highlightedIndex].id!);
				}
				break;
			case 'Escape':
				e.preventDefault();
				showCategoryDropdown = false;
				break;
		}
	}

	function toggleCategoryDropdown() {
		showCategoryDropdown = !showCategoryDropdown;
		highlightedIndex = 0;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Floating action bar -->
<div
	class="fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-sm border-t border-theme shadow-lg shadow-[var(--color-shadow)] animate-slide-up"
>
	<div class="max-w-4xl mx-auto px-4 py-3">
		<div class="flex items-center justify-between gap-4">
			<!-- Selected count -->
			<div class="flex items-center gap-2">
				<span class="text-sm font-medium text-charcoal">
					{selectedCount} selected
				</span>
			</div>

			<!-- Actions -->
			<div class="flex items-center gap-2">
				<!-- Change Category dropdown -->
				<div class="relative">
					<button
						type="button"
						onclick={toggleCategoryDropdown}
						class="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-charcoal-soft bg-surface-alt border border-theme rounded-lg hover:bg-surface-hover transition-colors"
					>
						<FolderInput size={16} />
						<span>Change Category</span>
						<ChevronUp
							size={14}
							class="transition-transform {showCategoryDropdown ? 'rotate-180' : ''}"
						/>
					</button>

					<!-- Dropdown (opens upward) -->
					{#if showCategoryDropdown}
						<!-- Backdrop to close dropdown -->
						<button
							type="button"
							class="fixed inset-0 z-40"
							onclick={() => (showCategoryDropdown = false)}
							aria-label="Close dropdown"
						></button>

						<ul
							role="listbox"
							class="absolute bottom-full left-0 mb-2 w-64 bg-surface border border-theme rounded-lg shadow-lg max-h-64 overflow-auto z-50"
						>
							{#each activeCategories as cat, index (cat.id)}
								<li
									role="option"
									aria-selected={false}
									class="px-3 py-2 cursor-pointer flex items-center gap-2 text-sm {index ===
									highlightedIndex
										? 'bg-primary-50 text-primary-900'
										: 'hover:bg-surface-hover'}"
									onmouseenter={() => (highlightedIndex = index)}
									onmousedown={() => handleCategorySelect(cat.id!)}
								>
									<span class="text-base">{cat.icon}</span>
									<span>{cat.name}</span>
								</li>
							{/each}
						</ul>
					{/if}
				</div>

				<!-- Delete button -->
				<button
					type="button"
					onclick={onDelete}
					class="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-danger-500 rounded-lg hover:bg-danger-600 transition-colors"
				>
					<Trash2 size={16} />
					<span>Delete</span>
				</button>

				<!-- Cancel button -->
				<button
					type="button"
					onclick={onCancel}
					class="p-2 text-charcoal-muted hover:text-charcoal hover:bg-surface-hover rounded-lg transition-colors"
					aria-label="Cancel selection"
				>
					<X size={20} />
				</button>
			</div>
		</div>
	</div>
</div>

<style>
	@keyframes slide-up {
		from {
			transform: translateY(100%);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.animate-slide-up {
		animation: slide-up 200ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}
</style>
