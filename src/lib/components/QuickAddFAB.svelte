<script lang="ts">
	import { Plus, X, Check } from 'lucide-svelte';
	import { scale, fly } from 'svelte/transition';
	import { getMostCommonCategory } from '$lib/stores/merchants';
	import MerchantAutocomplete from './MerchantAutocomplete.svelte';
	import CategoryCombobox from './CategoryCombobox.svelte';
	import type { Category, Settings } from '$lib/db';

	interface Props {
		categories: Category[];
		settings: Settings;
		onSubmit: (data: QuickAddData) => void | Promise<void>;
	}

	export interface QuickAddData {
		date: Date;
		merchant: string;
		amount: number;
		categoryId: number;
		isShared: boolean;
		isSettled: boolean;
		splitType: 'percentage' | 'fixed';
		splitValue: number;
		isEssential: boolean;
		isSubscription: boolean;
	}

	let { categories, settings, onSubmit }: Props = $props();

	let isExpanded = $state(false);
	let merchant = $state('');
	let amountStr = $state('');
	let categoryId = $state(0);
	let isShared = $state(false);
	let isSettled = $state(false);
	let isEssential = $state(false);
	let isSubmitting = $state(false);

	// Get selected category for essential default
	let selectedCategory = $derived(categories.find((c) => c.id === categoryId));

	// Focus management
	let amountInput = $state<HTMLInputElement | null>(null);

	let amount = $derived(parseFloat(amountStr) || 0);
	let isValid = $derived(merchant.trim() !== '' && amount > 0 && categoryId > 0);

	function toggle() {
		if (isExpanded) {
			close();
		} else {
			open();
		}
	}

	function open() {
		isExpanded = true;
		// Focus amount input after animation
		setTimeout(() => {
			amountInput?.focus();
		}, 100);
	}

	function close() {
		isExpanded = false;
		resetForm();
	}

	function resetForm() {
		merchant = '';
		amountStr = '';
		categoryId = 0;
		isShared = false;
		isSettled = false;
		isEssential = false;
		isSubmitting = false;
	}

	// Handle category change - update isEssential to match category default
	function handleCategoryChange(newCategoryId: number) {
		categoryId = newCategoryId;
		const category = categories.find((c) => c.id === newCategoryId);
		if (category) {
			isEssential = category.isEssential;
		}
	}

	async function handleMerchantSelect(selectedMerchant: string, suggestedCategoryId: number | null) {
		merchant = selectedMerchant;
		if (suggestedCategoryId && categoryId === 0) {
			handleCategoryChange(suggestedCategoryId);
		}
	}

	async function handleMerchantInput(value: string) {
		merchant = value;
		// Try to auto-fill category when merchant changes (if not already set)
		if (value.length >= 3 && categoryId === 0) {
			const commonCategory = await getMostCommonCategory(value);
			if (commonCategory) {
				handleCategoryChange(commonCategory);
			}
		}
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!isValid || isSubmitting) return;

		isSubmitting = true;

		try {
			await onSubmit({
				date: new Date(),
				merchant: merchant.trim(),
				amount,
				categoryId,
				isShared,
				isSettled: isShared ? isSettled : false,
				splitType: settings.defaultSplitType,
				splitValue: settings.defaultSplitValue,
				isEssential,
				isSubscription: false
			});

			close();
		} catch {
			// Keep form open on failure so user can retry
		} finally {
			isSubmitting = false;
		}
	}

	// Handle escape key
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && isExpanded) {
			close();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Backdrop (when expanded) -->
{#if isExpanded}
	<button
		class="fixed inset-0 bg-charcoal/20 backdrop-blur-sm z-40 cursor-default"
		transition:scale={{ duration: 200 }}
		onclick={close}
		aria-label="Close quick add form"
	></button>
{/if}

<!-- FAB Container -->
<div class="fixed bottom-20 right-4 z-50 sm:bottom-6 sm:right-6">
	{#if isExpanded}
		<!-- Expanded Form -->
		<div
			class="bg-surface rounded-2xl shadow-xl shadow-charcoal/15 w-[calc(100vw-2rem)] max-w-sm overflow-hidden"
			transition:fly={{ y: 20, duration: 200 }}
		>
			<form onsubmit={handleSubmit}>
				<!-- Header -->
				<div class="px-4 py-3 bg-primary-500 text-white flex items-center justify-between">
					<h3 class="font-display font-medium">Quick Add</h3>
					<button
						type="button"
						onclick={close}
						class="p-1 hover:bg-white/20 rounded-lg transition-colors"
					>
						<X size={20} />
					</button>
				</div>

				<!-- Form Fields -->
				<div class="p-4 space-y-4">
					<!-- Amount -->
					<div>
						<label for="quick-amount" class="block text-sm font-medium text-charcoal-soft mb-1.5">
							Amount
						</label>
						<div class="relative">
							<span class="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-muted font-mono">$</span>
							<input
								type="number"
								id="quick-amount"
								bind:value={amountStr}
								bind:this={amountInput}
								step="0.01"
								min="0"
								placeholder="0.00"
								inputmode="decimal"
								class="w-full pl-7 pr-3 py-3 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors font-mono text-lg placeholder:text-charcoal-muted"
							/>
						</div>
					</div>

					<!-- Merchant with Autocomplete -->
					<div>
						<label for="quick-merchant" class="block text-sm font-medium text-charcoal-soft mb-1.5">
							Merchant
						</label>
						<MerchantAutocomplete
							value={merchant}
							{categories}
							placeholder="Start typing..."
							onInput={handleMerchantInput}
							onSelect={handleMerchantSelect}
							inputId="quick-merchant"
						/>
					</div>

					<!-- Category -->
					<div>
						<label for="quick-category" class="block text-sm font-medium text-charcoal-soft mb-1.5">
							Category
							{#if categoryId > 0}
								<span class="text-xs text-success-600 font-normal ml-1">(auto-filled)</span>
							{/if}
						</label>
						<CategoryCombobox
							{categories}
							value={categoryId}
							onSelect={handleCategoryChange}
						/>
					</div>

					<!-- Essential Toggle -->
					<div class="flex items-center justify-between">
						<div>
							<span class="text-sm font-medium text-charcoal-soft">Essential</span>
							{#if selectedCategory}
								<span class="text-xs text-charcoal-muted ml-1">
									(default: {selectedCategory.isEssential ? 'Need' : 'Want'})
								</span>
							{/if}
						</div>
						<button
							type="button"
							onclick={() => (isEssential = !isEssential)}
							class="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-2 {isEssential ? 'bg-primary-500' : 'bg-[var(--color-border-dashed)]'}"
							role="switch"
							aria-checked={isEssential}
							aria-label="Mark as essential expense"
						>
							<span
								class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {isEssential ? 'translate-x-4' : 'translate-x-0'}"
							></span>
						</button>
					</div>

					<!-- Shared Toggles -->
					<div class="flex items-center gap-4">
						<label class="flex items-center gap-2 cursor-pointer">
							<input
								type="checkbox"
								bind:checked={isShared}
								class="w-4 h-4 text-success-500 border-[var(--color-border)] rounded focus:ring-success-500/20"
							/>
							<span class="text-sm text-charcoal-soft">Shared with {settings.partnerName}</span>
						</label>
						{#if isShared}
							<label class="flex items-center gap-2 cursor-pointer">
								<input
									type="checkbox"
									bind:checked={isSettled}
									class="w-4 h-4 text-success-500 border-[var(--color-border)] rounded focus:ring-success-500/20"
								/>
								<span class="text-sm text-charcoal-soft">Already settled</span>
							</label>
						{/if}
					</div>
				</div>

				<!-- Actions -->
				<div class="px-4 pb-4 flex gap-3">
					<button
						type="button"
						onclick={close}
						class="flex-1 py-2.5 px-4 border border-theme text-charcoal-soft rounded-lg font-medium hover:bg-surface-hover transition-colors"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={!isValid || isSubmitting}
						class="flex-1 bg-primary-500 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-primary-600 focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 flex items-center justify-center gap-2"
					>
						{#if isSubmitting}
							<div class="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></div>
						{:else}
							<Check size={18} />
						{/if}
						Add
					</button>
				</div>
			</form>
		</div>
	{:else}
		<!-- Collapsed FAB Button -->
		<button
			onclick={toggle}
			class="w-14 h-14 bg-primary-500 text-white rounded-full shadow-lg shadow-primary-500/30 hover:bg-primary-600 hover:shadow-xl hover:shadow-primary-500/40 hover:scale-105 active:scale-95 transition-all duration-150 flex items-center justify-center"
			aria-label="Quick add transaction"
			transition:scale={{ duration: 150 }}
		>
			<Plus size={28} strokeWidth={2.5} />
		</button>
	{/if}
</div>
