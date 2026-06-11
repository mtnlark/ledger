<script lang="ts">
	import { Trash2, FolderInput, X, ChevronUp, Tag, Plus, Minus } from 'lucide-svelte';
	import type { Category } from '$lib/db';

	interface Props {
		selectedCount: number;
		categories: Category[];
		availableTags?: string[];
		onDelete: () => void;
		onCategoryChange: (categoryId: number) => void;
		onTagAdd?: (tag: string) => void;
		onTagRemove?: (tag: string) => void;
		onCancel: () => void;
	}

	let { selectedCount, categories, availableTags = [], onDelete, onCategoryChange, onTagAdd, onTagRemove, onCancel }: Props = $props();

	// Category dropdown state
	let showCategoryDropdown = $state(false);
	let highlightedIndex = $state(0);

	// Tag dropdown state
	let showTagDropdown = $state(false);
	let tagInput = $state('');
	let tagHighlightedIndex = $state(-1);

	// Get active categories
	let activeCategories = $derived(categories.filter((c) => c.isActive));

	// Filter tags based on input
	let filteredTags = $derived(
		tagInput.trim()
			? availableTags.filter((t) => t.toLowerCase().includes(tagInput.trim().toLowerCase()))
			: availableTags
	);

	// Validate tag input format
	let normalizedTagInput = $derived(tagInput.trim().replace(/^#/, '').toLowerCase());
	let isValidTag = $derived(/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(normalizedTagInput));
	let isNewTag = $derived(isValidTag && !availableTags.includes(normalizedTagInput));

	function handleCategorySelect(categoryId: number) {
		showCategoryDropdown = false;
		onCategoryChange(categoryId);
	}

	function handleTagAdd(tag: string) {
		showTagDropdown = false;
		tagInput = '';
		onTagAdd?.(tag);
	}

	function handleTagRemove(tag: string) {
		showTagDropdown = false;
		tagInput = '';
		onTagRemove?.(tag);
	}

	function handleTagInputKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			if (tagHighlightedIndex >= 0 && filteredTags[tagHighlightedIndex]) {
				handleTagAdd(filteredTags[tagHighlightedIndex]);
			} else if (normalizedTagInput && isValidTag) {
				handleTagAdd(normalizedTagInput);
			}
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			tagHighlightedIndex = Math.min(tagHighlightedIndex + 1, filteredTags.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			tagHighlightedIndex = Math.max(tagHighlightedIndex - 1, -1);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			showTagDropdown = false;
			tagInput = '';
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (showTagDropdown) return; // Tag dropdown handles its own keys
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
		showTagDropdown = false;
		highlightedIndex = 0;
	}

	function toggleTagDropdown() {
		showTagDropdown = !showTagDropdown;
		showCategoryDropdown = false;
		tagInput = '';
		tagHighlightedIndex = -1;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Floating action bar -->
<div
	class="fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-sm border-t border-theme shadow-lg shadow-[var(--color-shadow)] animate-slide-up"
>
	<div class="max-w-4xl mx-auto px-4 py-3">
		<div class="flex items-center justify-between gap-4" role="toolbar" aria-label="Bulk actions">
			<!-- Selected count -->
			<div class="flex items-center gap-2">
				<span class="text-sm font-medium text-charcoal">
					{selectedCount} selected
				</span>
				<span class="sr-only" aria-live="polite" aria-atomic="true">
					{selectedCount} transactions selected
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

				<!-- Tag dropdown -->
				{#if onTagAdd || onTagRemove}
					<div class="relative">
						<button
							type="button"
							onclick={toggleTagDropdown}
							class="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-charcoal-soft bg-surface-alt border border-theme rounded-lg hover:bg-surface-hover transition-colors"
						>
							<Tag size={16} />
							<span>Tag</span>
							<ChevronUp
								size={14}
								class="transition-transform {showTagDropdown ? 'rotate-180' : ''}"
							/>
						</button>

						{#if showTagDropdown}
							<!-- Backdrop to close dropdown -->
							<button
								type="button"
								class="fixed inset-0 z-40"
								onclick={() => { showTagDropdown = false; tagInput = ''; }}
								aria-label="Close tag dropdown"
							></button>

							<div
								class="absolute bottom-full left-0 mb-2 w-64 bg-surface border border-theme rounded-lg shadow-lg z-50 overflow-hidden"
							>
								<!-- Tag input -->
								<div class="p-2 border-b border-theme">
									<!-- svelte-ignore a11y_autofocus -- focus moves into the just-opened dropdown -->
									<input
										type="text"
										bind:value={tagInput}
										onkeydown={handleTagInputKeydown}
										placeholder="Type a tag name..."
										class="w-full px-2 py-1.5 text-sm bg-surface-alt border border-theme rounded focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
										autofocus
									/>
									{#if normalizedTagInput && isValidTag && isNewTag}
										<button
											type="button"
											class="mt-1.5 w-full flex items-center gap-2 px-2 py-1.5 text-sm text-primary-600 hover:bg-surface-hover rounded transition-colors"
											onmousedown={() => handleTagAdd(normalizedTagInput)}
										>
											<Plus size={14} />
											<span>Add <strong>#{normalizedTagInput}</strong> (new)</span>
										</button>
									{/if}
									{#if normalizedTagInput && !isValidTag && normalizedTagInput.length > 0}
										<p class="mt-1 text-xs text-charcoal-muted">Letters, numbers, and hyphens only</p>
									{/if}
								</div>

								<!-- Existing tags list -->
								<ul class="max-h-48 overflow-auto" role="listbox">
									{#each filteredTags as tag, index (tag)}
										<li
											role="option"
											aria-selected={index === tagHighlightedIndex}
											class="px-2 py-1.5 flex items-center justify-between text-sm {index === tagHighlightedIndex ? 'bg-primary-50 text-primary-900' : 'hover:bg-surface-hover'}"
											onmouseenter={() => (tagHighlightedIndex = index)}
										>
											<span class="font-mono text-xs">#{tag}</span>
											<div class="flex items-center gap-1">
												<button
													type="button"
													class="p-1 rounded hover:bg-success-100 text-success-600 transition-colors"
													title="Add #{tag} to selected"
													onmousedown={() => handleTagAdd(tag)}
												>
													<Plus size={14} />
												</button>
												<button
													type="button"
													class="p-1 rounded hover:bg-danger-100 text-danger-500 transition-colors"
													title="Remove #{tag} from selected"
													onmousedown={() => handleTagRemove(tag)}
												>
													<Minus size={14} />
												</button>
											</div>
										</li>
									{:else}
										{#if tagInput.trim()}
											<li class="px-3 py-2 text-sm text-charcoal-muted">No matching tags</li>
										{:else}
											<li class="px-3 py-2 text-sm text-charcoal-muted">No tags yet</li>
										{/if}
									{/each}
								</ul>
							</div>
						{/if}
					</div>
				{/if}

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
