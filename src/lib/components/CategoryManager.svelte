<script lang="ts">
	import { ChevronUp, ChevronDown, Pencil, Plus, Eye, EyeOff } from 'lucide-svelte';
	import type { Category } from '$lib/db';
	import {
		moveCategoryUp,
		moveCategoryDown,
		toggleCategoryActive,
		addCategory
	} from '$lib/stores/categories';
	import { toast } from '$lib/stores/toast';
	import CategoryEditModal from './CategoryEditModal.svelte';

	interface Props {
		categories: Category[];
		onUpdate: () => void;
	}

	let { categories, onUpdate }: Props = $props();

	// Modal state
	let editingCategory = $state<Category | null>(null);
	let isAddingNew = $state(false);

	async function handleMoveUp(id: number) {
		try {
			await moveCategoryUp(id);
			onUpdate();
		} catch (error) {
			toast.error('Failed to move category');
		}
	}

	async function handleMoveDown(id: number) {
		try {
			await moveCategoryDown(id);
			onUpdate();
		} catch (error) {
			toast.error('Failed to move category');
		}
	}

	async function handleToggleActive(id: number) {
		try {
			await toggleCategoryActive(id);
			onUpdate();
		} catch (error) {
			toast.error('Failed to toggle category');
		}
	}

	function openEditModal(category: Category) {
		editingCategory = category;
	}

	function openAddModal() {
		isAddingNew = true;
	}

	function closeModal() {
		editingCategory = null;
		isAddingNew = false;
	}

	function handleSaved() {
		closeModal();
		onUpdate();
	}
</script>

<div class="space-y-4">
	<!-- Category List -->
	<div class="divide-y divide-gray-100">
		{#each categories as category, index (category.id)}
			<div
				class="flex items-center gap-3 py-3 px-2 hover:bg-cream/50 rounded-lg transition-colors {!category.isActive ? 'opacity-50' : ''}"
			>
				<!-- Icon & Color Preview -->
				<div
					class="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
					style="background-color: {category.color}20; border: 2px solid {category.color}"
				>
					{category.icon}
				</div>

				<!-- Name -->
				<div class="flex-1 min-w-0">
					<span class="font-medium text-charcoal truncate block">{category.name}</span>
					{#if !category.isActive}
						<span class="text-xs text-charcoal-muted">Inactive</span>
					{/if}
				</div>

				<!-- Actions -->
				<div class="flex items-center gap-1">
					<!-- Move Up -->
					<button
						onclick={() => handleMoveUp(category.id!)}
						disabled={index === 0}
						class="p-2 text-charcoal-muted hover:text-charcoal hover:bg-cream rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
						aria-label="Move up"
					>
						<ChevronUp size={18} />
					</button>

					<!-- Move Down -->
					<button
						onclick={() => handleMoveDown(category.id!)}
						disabled={index === categories.length - 1}
						class="p-2 text-charcoal-muted hover:text-charcoal hover:bg-cream rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
						aria-label="Move down"
					>
						<ChevronDown size={18} />
					</button>

					<!-- Toggle Active -->
					<button
						onclick={() => handleToggleActive(category.id!)}
						class="p-2 text-charcoal-muted hover:text-charcoal hover:bg-cream rounded-lg transition-colors"
						aria-label={category.isActive ? 'Deactivate category' : 'Activate category'}
					>
						{#if category.isActive}
							<Eye size={18} />
						{:else}
							<EyeOff size={18} />
						{/if}
					</button>

					<!-- Edit -->
					<button
						onclick={() => openEditModal(category)}
						class="p-2 text-charcoal-muted hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
						aria-label="Edit category"
					>
						<Pencil size={18} />
					</button>
				</div>
			</div>
		{/each}
	</div>

	<!-- Add New Category Button -->
	<button
		onclick={openAddModal}
		class="w-full py-3 px-4 border-2 border-dashed border-gray-300 rounded-lg text-charcoal-muted hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50/50 transition-colors flex items-center justify-center gap-2 font-medium"
	>
		<Plus size={20} />
		Add New Category
	</button>
</div>

<!-- Edit Modal -->
{#if editingCategory}
	<CategoryEditModal
		category={editingCategory}
		onSave={handleSaved}
		onClose={closeModal}
	/>
{/if}

<!-- Add Modal -->
{#if isAddingNew}
	<CategoryEditModal
		category={null}
		onSave={handleSaved}
		onClose={closeModal}
	/>
{/if}
