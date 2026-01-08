<script lang="ts">
	import { onMount } from 'svelte';
	import { format } from 'date-fns';
	import type { Category, Settings } from '$lib/db';
	import CategoryCombobox from './CategoryCombobox.svelte';
	import MerchantAutocomplete from './MerchantAutocomplete.svelte';
	import { getMostCommonCategory } from '$lib/stores/merchants';

	interface Props {
		categories: Category[];
		settings: Settings;
		onSubmit: (data: TransactionFormData) => void;
		onCancel?: () => void;
	}

	export interface TransactionFormData {
		date: Date;
		merchant: string;
		amount: number;
		categoryId: number;
		isShared: boolean;
		splitType: 'percentage' | 'fixed';
		splitValue: number;
		notes?: string;
	}

	let { categories, settings, onSubmit, onCancel }: Props = $props();

	// Animation state
	let mounted = $state(false);
	onMount(() => {
		setTimeout(() => mounted = true, 100);
	});

	// Form state
	let dateStr = $state(format(new Date(), 'yyyy-MM-dd'));
	let merchant = $state('');
	let amountStr = $state('');
	let categoryId = $state(0);
	let isShared = $state(false);
	let splitType = $state<'percentage' | 'fixed'>(settings.defaultSplitType);
	let splitValue = $state(settings.defaultSplitValue);
	let notes = $state('');

	// Computed values
	let amount = $derived(parseFloat(amountStr) || 0);
	let partnerShare = $derived(
		isShared ? (splitType === 'percentage' ? amount * splitValue : splitValue) : 0
	);
	let yourShare = $derived(amount - partnerShare);

	// Parse date string to local date (avoids UTC timezone issues)
	function parseDateString(dateStr: string): Date {
		const [year, month, day] = dateStr.split('-').map(Number);
		return new Date(year, month - 1, day);
	}

	function handleSubmit(e: Event) {
		e.preventDefault();

		if (!merchant.trim() || amount <= 0 || !categoryId) {
			return;
		}

		onSubmit({
			date: parseDateString(dateStr),
			merchant: merchant.trim(),
			amount,
			categoryId,
			isShared,
			splitType,
			splitValue,
			notes: notes.trim() || undefined
		});

		// Reset form
		merchant = '';
		amountStr = '';
		categoryId = 0;
		isShared = false;
		splitType = settings.defaultSplitType;
		splitValue = settings.defaultSplitValue;
		notes = '';
	}

	function formatCurrency(value: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(value);
	}

	// Handle merchant selection from autocomplete
	function handleMerchantSelect(selectedMerchant: string, suggestedCategoryId: number | null) {
		merchant = selectedMerchant;
		if (suggestedCategoryId && categoryId === 0) {
			categoryId = suggestedCategoryId;
		}
	}

	// Handle merchant input (for auto-category lookup)
	async function handleMerchantInput(value: string) {
		merchant = value;
		// Try to auto-fill category when merchant changes (if not already set)
		if (value.length >= 3 && categoryId === 0) {
			const commonCategory = await getMostCommonCategory(value);
			if (commonCategory) {
				categoryId = commonCategory;
			}
		}
	}
</script>

<form
	onsubmit={handleSubmit}
	class="bg-white rounded-xl shadow-md shadow-gray-200/50 p-6 transition-all duration-500 {mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}"
	style="transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);"
>
	<h2 class="font-display text-xl font-medium text-charcoal mb-5">Add Transaction</h2>

	<div class="space-y-4">
		<!-- Date & Merchant Row -->
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<label for="date" class="block text-sm font-medium text-charcoal-soft mb-1.5">Date</label>
				<input
					type="date"
					id="date"
					bind:value={dateStr}
					class="w-full px-3 py-2.5 bg-cream border border-[rgba(45,42,38,0.15)] rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
				/>
			</div>
			<div>
				<label for="merchant" class="block text-sm font-medium text-charcoal-soft mb-1.5">
					Merchant
					{#if categoryId > 0 && merchant.length >= 3}
						<span class="text-xs text-success-600 font-normal ml-1">(category auto-filled)</span>
					{/if}
				</label>
				<MerchantAutocomplete
					value={merchant}
					{categories}
					placeholder="e.g., Shell, Amazon, MOM's"
					onInput={handleMerchantInput}
					onSelect={handleMerchantSelect}
					inputId="merchant"
				/>
			</div>
		</div>

		<!-- Amount & Category Row -->
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<label for="amount" class="block text-sm font-medium text-charcoal-soft mb-1.5">Amount</label>
				<div class="relative">
					<span class="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-muted font-mono">$</span>
					<input
						type="number"
						id="amount"
						bind:value={amountStr}
						step="0.01"
						min="0"
						placeholder="0.00"
						class="w-full pl-7 pr-3 py-2.5 bg-cream border border-[rgba(45,42,38,0.15)] rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors font-mono placeholder:text-charcoal-muted"
					/>
				</div>
			</div>
			<div>
				<label for="category" class="block text-sm font-medium text-charcoal-soft mb-1.5">Category</label>
				<CategoryCombobox
					{categories}
					value={categoryId}
					onSelect={(id) => (categoryId = id)}
				/>
			</div>
		</div>

		<!-- Shared Toggle -->
		<div class="border-t border-dashed border-gray-200 pt-4">
			<label class="flex items-center gap-3 cursor-pointer">
				<input
					type="checkbox"
					bind:checked={isShared}
					class="w-5 h-5 text-success-500 border-gray-300 rounded focus:ring-success-500/20"
				/>
				<span class="text-sm font-medium text-charcoal-soft">
					Shared with {settings.partnerName}
				</span>
			</label>

			<!-- Split Options (shown when shared) -->
			{#if isShared}
				<div class="mt-4 ml-8 p-4 bg-success-50 border border-success-100 rounded-lg space-y-3">
					<!-- Split Type Toggle -->
					<div class="flex gap-2">
						<button
							type="button"
							onclick={() => (splitType = 'percentage')}
							class="px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-150 {splitType ===
							'percentage'
								? 'bg-success-500 text-white shadow-sm'
								: 'bg-white text-charcoal-soft border border-[rgba(45,42,38,0.15)] hover:bg-cream'}"
						>
							% Percentage
						</button>
						<button
							type="button"
							onclick={() => (splitType = 'fixed')}
							class="px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-150 {splitType ===
							'fixed'
								? 'bg-success-500 text-white shadow-sm'
								: 'bg-white text-charcoal-soft border border-[rgba(45,42,38,0.15)] hover:bg-cream'}"
						>
							$ Fixed Amount
						</button>
					</div>

					<!-- Split Value Input -->
					{#if splitType === 'percentage'}
						<div>
							<label for="splitPercent" class="block text-sm text-charcoal-soft mb-1">
								{settings.partnerName}'s share: <span class="font-mono font-medium">{Math.round(splitValue * 100)}%</span>
							</label>
							<input
								type="range"
								id="splitPercent"
								min="0"
								max="1"
								step="0.05"
								bind:value={splitValue}
								class="w-full accent-success-500"
							/>
						</div>
					{:else}
						<div>
							<label for="splitFixed" class="block text-sm text-charcoal-soft mb-1">
								{settings.partnerName}'s exact share
							</label>
							<div class="relative">
								<span class="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-muted font-mono">$</span>
								<input
									type="number"
									id="splitFixed"
									bind:value={splitValue}
									step="0.01"
									min="0"
									max={amount}
									class="w-full pl-7 pr-3 py-2 bg-white border border-[rgba(45,42,38,0.15)] rounded-lg focus:ring-2 focus:ring-success-500/20 focus:border-success-500 transition-colors font-mono"
								/>
							</div>
						</div>
					{/if}

					<!-- Split Summary -->
					{#if amount > 0}
						<div class="text-sm pt-2 border-t border-success-200">
							<div class="flex justify-between text-charcoal-soft">
								<span>{settings.partnerName} pays:</span>
								<span class="font-mono font-medium text-charcoal">{formatCurrency(partnerShare)}</span>
							</div>
							<div class="flex justify-between text-charcoal-soft">
								<span>You pay:</span>
								<span class="font-mono font-medium text-charcoal">{formatCurrency(yourShare)}</span>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Notes (optional) -->
		<div>
			<label for="notes" class="block text-sm font-medium text-charcoal-soft mb-1.5">
				Notes <span class="text-charcoal-muted font-normal">(optional)</span>
			</label>
			<input
				type="text"
				id="notes"
				bind:value={notes}
				placeholder="Any additional notes..."
				class="w-full px-3 py-2.5 bg-cream border border-[rgba(45,42,38,0.15)] rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors placeholder:text-charcoal-muted"
			/>
		</div>

		<!-- Actions -->
		<div class="flex gap-3 pt-3">
			<button
				type="submit"
				disabled={!merchant.trim() || amount <= 0 || !categoryId}
				class="flex-1 bg-primary-500 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-primary-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary-500/25 focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none transition-all duration-150"
			>
				Add Transaction
			</button>
			{#if onCancel}
				<button
					type="button"
					onclick={onCancel}
					class="px-4 py-2.5 border border-[rgba(45,42,38,0.15)] text-charcoal-soft rounded-lg font-medium hover:bg-cream transition-colors"
				>
					Cancel
				</button>
			{/if}
		</div>
	</div>
</form>
