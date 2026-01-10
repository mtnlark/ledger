<script lang="ts">
	import { onMount } from 'svelte';
	import { X, Trash2 } from 'lucide-svelte';
	import { scale } from 'svelte/transition';
	import type { Category } from '$lib/db';
	import { updateCategory, addCategory, deleteCategory, getCategoryUsageCount } from '$lib/stores/categories';
	import { toast } from '$lib/stores/toast';

	interface Props {
		category: Category | null; // null = adding new
		onSave: () => void;
		onClose: () => void;
	}

	let { category, onSave, onClose }: Props = $props();

	const isEditing = $derived(category !== null);

	// Form state
	let name = $state(category?.name ?? '');
	let icon = $state(category?.icon ?? '');
	let color = $state(category?.color ?? '#6B7280');
	let isEssential = $state(category?.isEssential ?? false);
	let isSaving = $state(false);

	// Delete state
	let showDeleteConfirm = $state(false);
	let usageCount = $state(0);
	let isDeleting = $state(false);

	onMount(async () => {
		if (category?.id) {
			usageCount = await getCategoryUsageCount(category.id);
		}
	});

	// Predefined color palette
	const colorPalette = [
		'#EF4444', // red
		'#F97316', // orange
		'#F59E0B', // amber
		'#EAB308', // yellow
		'#84CC16', // lime
		'#22C55E', // green
		'#10B981', // emerald
		'#14B8A6', // teal
		'#06B6D4', // cyan
		'#0EA5E9', // sky
		'#3B82F6', // blue
		'#6366F1', // indigo
		'#8B5CF6', // violet
		'#A855F7', // purple
		'#D946EF', // fuchsia
		'#EC4899', // pink
		'#F43F5E', // rose
		'#6B7280', // gray
		'#78716C', // stone
		'#A1887F'  // warm brown
	];

	// Common emoji suggestions for categories
	const emojiSuggestions = [
		'🛒', '🍽️', '🚗', '⛽', '🏠', '💊', '🎬', '✈️',
		'👕', '💇', '🐕', '🎁', '💪', '☕', '💳', '📱',
		'🔌', '🅿️', '💰', '🛍️', '🎮', '📚', '🌿', '🎵'
	];

	let isValid = $derived(name.trim() !== '' && icon.trim() !== '');

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!isValid || isSaving) return;

		isSaving = true;

		try {
			if (isEditing && category) {
				await updateCategory(category.id!, {
					name: name.trim(),
					icon: icon.trim(),
					color,
					isEssential
				});
				toast.success('Category updated');
			} else {
				await addCategory({
					name: name.trim(),
					icon: icon.trim(),
					color,
					isActive: true,
					isEssential
				});
				toast.success('Category added');
			}
			onSave();
		} catch (error) {
			toast.error(isEditing ? 'Failed to update category' : 'Failed to add category');
		} finally {
			isSaving = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (showDeleteConfirm) {
				showDeleteConfirm = false;
			} else {
				onClose();
			}
		}
	}

	async function handleDelete() {
		if (!category?.id || isDeleting) return;

		isDeleting = true;
		try {
			await deleteCategory(category.id);
			toast.success('Category deleted');
			onSave();
		} catch (error) {
			toast.error('Failed to delete category');
		} finally {
			isDeleting = false;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Backdrop -->
<button
	class="fixed inset-0 bg-charcoal/30 backdrop-blur-sm z-50 cursor-default"
	onclick={onClose}
	aria-label="Close modal"
	transition:scale={{ duration: 150 }}
></button>

<!-- Modal -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
>
	<div
		class="bg-surface rounded-2xl shadow-xl max-w-md w-full pointer-events-auto"
		transition:scale={{ duration: 200, start: 0.95 }}
	>
		<form onsubmit={handleSubmit}>
			<!-- Header -->
			<div class="px-6 py-4 border-b border-dashed border-theme-dashed flex items-center justify-between">
				<h2 class="font-display text-xl font-medium text-charcoal">
					{isEditing ? 'Edit Category' : 'Add Category'}
				</h2>
				<button
					type="button"
					onclick={onClose}
					class="p-2 text-charcoal-muted hover:text-charcoal hover:bg-surface-hover rounded-lg transition-colors"
				>
					<X size={20} />
				</button>
			</div>

			<!-- Form Body -->
			<div class="p-6 space-y-5">
				<!-- Preview -->
				<div class="flex justify-center">
					<div
						class="w-16 h-16 rounded-xl flex items-center justify-center text-2xl transition-all"
						style="background-color: {color}20; border: 3px solid {color}"
					>
						{icon || '?'}
					</div>
				</div>

				<!-- Name -->
				<div>
					<label for="category-name" class="block text-sm font-medium text-charcoal-soft mb-1.5">
						Name
					</label>
					<input
						type="text"
						id="category-name"
						bind:value={name}
						placeholder="e.g., Groceries"
						class="w-full px-3 py-2.5 bg-cream border border-[rgba(45,42,38,0.15)] rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors placeholder:text-charcoal-muted"
					/>
				</div>

				<!-- Icon -->
				<div>
					<label for="category-icon" class="block text-sm font-medium text-charcoal-soft mb-1.5">
						Icon (Emoji)
					</label>
					<input
						type="text"
						id="category-icon"
						bind:value={icon}
						placeholder="🛒"
						maxlength="4"
						class="w-full px-3 py-2.5 bg-cream border border-[rgba(45,42,38,0.15)] rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors placeholder:text-charcoal-muted text-center text-xl"
					/>
					<!-- Emoji suggestions -->
					<div class="flex flex-wrap gap-1.5 mt-2">
						{#each emojiSuggestions as emoji}
							<button
								type="button"
								onclick={() => (icon = emoji)}
								class="w-8 h-8 rounded-lg hover:bg-surface-hover border border-transparent hover:border-theme transition-colors text-lg {icon === emoji ? 'bg-primary-100 border-primary-300' : ''}"
							>
								{emoji}
							</button>
						{/each}
					</div>
				</div>

				<!-- Color -->
				<div>
					<label class="block text-sm font-medium text-charcoal-soft mb-1.5">
						Color
					</label>
					<div class="flex flex-wrap gap-2">
						{#each colorPalette as paletteColor}
							<button
								type="button"
								onclick={() => (color = paletteColor)}
								class="w-8 h-8 rounded-lg transition-all hover:scale-110 {color === paletteColor ? 'ring-2 ring-offset-2 ring-charcoal' : ''}"
								style="background-color: {paletteColor}"
								aria-label="Select color {paletteColor}"
							></button>
						{/each}
					</div>
					<!-- Custom color input -->
					<div class="flex items-center gap-2 mt-3">
						<input
							type="color"
							bind:value={color}
							class="w-10 h-10 rounded-lg cursor-pointer border border-[rgba(45,42,38,0.15)]"
						/>
						<input
							type="text"
							bind:value={color}
							placeholder="#000000"
							maxlength="7"
							class="w-24 px-2 py-1.5 bg-cream border border-[rgba(45,42,38,0.15)] rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
						/>
						<span class="text-xs text-charcoal-muted">Custom color</span>
					</div>
				</div>

				<!-- Essential Toggle -->
				<div class="pt-4 border-t border-dashed border-theme-dashed">
					<label class="flex items-center justify-between cursor-pointer">
						<div>
							<span class="font-medium text-charcoal">Essential spending</span>
							<p class="text-sm text-charcoal-muted mt-0.5">
								Mark as a "need" vs discretionary "want"
							</p>
						</div>
						<button
							type="button"
							onclick={() => (isEssential = !isEssential)}
							class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-2 {isEssential ? 'bg-primary-500' : 'bg-gray-200'}"
							role="switch"
							aria-checked={isEssential}
						>
							<span
								class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {isEssential ? 'translate-x-5' : 'translate-x-0'}"
							></span>
						</button>
					</label>
				</div>

				<!-- Delete Section (only when editing) -->
				{#if isEditing}
					<div class="pt-4 border-t border-dashed border-theme-dashed">
						{#if !showDeleteConfirm}
							<button
								type="button"
								onclick={() => (showDeleteConfirm = true)}
								class="flex items-center gap-2 text-sm text-red-600 hover:text-red-700 transition-colors"
							>
								<Trash2 size={16} />
								Delete category
							</button>
						{:else}
							<div class="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
								<p class="text-sm text-red-800 font-medium">Delete "{category?.name}"?</p>
								{#if usageCount > 0}
									<p class="text-sm text-red-700">
										This category is used by <strong>{usageCount}</strong> transaction{usageCount === 1 ? '' : 's'}.
										Those transactions will show "Unknown" category.
									</p>
								{:else}
									<p class="text-sm text-red-700">This action cannot be undone.</p>
								{/if}
								<div class="flex gap-2">
									<button
										type="button"
										onclick={() => (showDeleteConfirm = false)}
										class="px-3 py-1.5 text-sm bg-surface border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
									>
										Cancel
									</button>
									<button
										type="button"
										onclick={handleDelete}
										disabled={isDeleting}
										class="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
									>
										{isDeleting ? 'Deleting...' : 'Yes, delete'}
									</button>
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="px-6 pb-6 flex gap-3">
				<button
					type="button"
					onclick={onClose}
					class="flex-1 py-2.5 px-4 border border-[rgba(45,42,38,0.15)] text-charcoal-soft rounded-lg font-medium hover:bg-surface-hover transition-colors"
				>
					Cancel
				</button>
				<button
					type="submit"
					disabled={!isValid || isSaving}
					class="flex-1 bg-primary-500 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-primary-600 focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
				>
					{#if isSaving}
						Saving...
					{:else}
						{isEditing ? 'Save Changes' : 'Add Category'}
					{/if}
				</button>
			</div>
		</form>
	</div>
</div>
