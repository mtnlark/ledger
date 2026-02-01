<script lang="ts">
	import { onMount } from 'svelte';
	import { format } from 'date-fns';
	import { ChevronDown, Plus, Scissors, Trash2 } from 'lucide-svelte';
	import { slide } from 'svelte/transition';
	import type { Category, Settings } from '$lib/db';
	import { parseLocalDate } from '$lib/utils/date-helpers';
	import { formatCurrency } from '$lib/utils/format-helpers';
	import { isSplitBalanced, roundCurrency } from '$lib/utils/currency';
	import { validateTransactionForm } from '$lib/utils/transaction-validation';
	import CategoryCombobox from './CategoryCombobox.svelte';
	import MerchantAutocomplete from './MerchantAutocomplete.svelte';
	import SharedExpenseFields from './SharedExpenseFields.svelte';
	import EssentialToggle from './EssentialToggle.svelte';
	import SubscriptionFields from './SubscriptionFields.svelte';
	import { getMostCommonCategory } from '$lib/stores/merchants';

	const STORAGE_KEY = 'ledger-addform-expanded';

	interface Props {
		categories: Category[];
		settings: Settings;
		isExpanded?: boolean;
		onSubmit: (data: TransactionFormData) => void;
		onSplitSubmit?: (data: SplitTransactionFormData) => void;
		onCancel?: () => void;
	}

	export interface TransactionFormData {
		date: Date;
		merchant: string;
		amount: number;
		categoryId: number;
		isShared: boolean;
		isSettled: boolean;
		splitType: 'percentage' | 'fixed';
		splitValue: number;
		notes?: string;
		isEssential: boolean;
		isSubscription: boolean;
		subscriptionFrequency?: 'monthly' | 'annual';
	}

	export interface SplitTransactionFormData {
		date: Date;
		merchant: string;
		isShared: boolean;
		isSettled: boolean;
		splitType: 'percentage' | 'fixed';
		splitValue: number;
		isEssential: boolean;
		isSubscription: boolean;
		subscriptionFrequency?: 'monthly' | 'annual';
		splits: { categoryId: number; amount: number }[];
	}

	interface SplitLine {
		categoryId: number;
		amount: number;
	}

	let { categories, settings, isExpanded = $bindable(false), onSubmit, onSplitSubmit, onCancel }: Props = $props();

	// Animation state
	let mounted = $state(false);
	let initializedFromStorage = false;

	onMount(() => {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored !== null) {
			isExpanded = stored === 'true';
		}
		initializedFromStorage = true;
		setTimeout(() => mounted = true, 100);
	});

	// Persist expanded state to localStorage after initial load
	$effect(() => {
		if (initializedFromStorage) {
			localStorage.setItem(STORAGE_KEY, String(isExpanded));
		}
	});

	function toggleExpanded() {
		isExpanded = !isExpanded;
	}

	// Form state
	let dateStr = $state(format(new Date(), 'yyyy-MM-dd'));
	let merchant = $state('');
	let amountStr = $state('');
	let categoryId = $state(0);
	let isShared = $state(false);
	let isSettled = $state(false);
	// Initial values from settings (intentionally not reactive - form defaults only)
	let splitType = $state<'percentage' | 'fixed'>(settings.defaultSplitType);
	let splitValue = $state(settings.defaultSplitValue);
	let notes = $state('');
	let isEssential = $state(false);
	let isSubscription = $state(false);
	let subscriptionFrequency = $state<'monthly' | 'annual'>('monthly');
	let futureDateConfirmed = $state(false);

	// Validation state
	let touched = $state(new Set<string>());
	let errors = $state<Record<string, string>>({});

	function handleBlur(field: string) {
		touched = new Set([...touched, field]);
		const result = validateTransactionForm({
			merchant,
			amount,
			categoryId,
			isSplitMode,
			splits: splitLines,
			isFutureDate,
			futureDateConfirmed
		});
		// Only update the error for the blurred field
		if (result.errors[field]) {
			errors = { ...errors, [field]: result.errors[field] };
		} else {
			const { [field]: _, ...rest } = errors;
			errors = rest;
		}
	}

	function validateAllFields(): boolean {
		touched = new Set(['merchant', 'amount', 'category']);
		const result = validateTransactionForm({
			merchant,
			amount,
			categoryId,
			isSplitMode,
			splits: splitLines,
			isFutureDate,
			futureDateConfirmed
		});
		errors = result.errors;
		return result.isValid;
	}

	// Future date detection
	let isFutureDate = $derived.by(() => {
		if (!dateStr) return false;
		const selected = parseLocalDate(dateStr);
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		return selected > today;
	});

	// Split mode state
	let isSplitMode = $state(false);
	let splitLines = $state<SplitLine[]>([]);

	// Get active categories for dropdowns
	let activeCategories = $derived(categories.filter((c) => c.isActive));

	// Get selected category for essential default
	let selectedCategory = $derived(categories.find((c) => c.id === categoryId));

	// Computed values
	let amount = $derived(parseFloat(amountStr) || 0);

	// Validate and clamp split value based on type and amount
	let validatedSplitValue = $derived.by(() => {
		if (splitType === 'percentage') {
			return Math.min(1, Math.max(0, splitValue));
		} else {
			return Math.min(amount, Math.max(0, splitValue));
		}
	});

	// Check if current input is invalid (for showing warning)
	let splitValueInvalid = $derived.by(() => {
		if (!isShared) return false;
		if (splitType === 'percentage') {
			return splitValue < 0 || splitValue > 1;
		} else {
			return splitValue < 0 || splitValue > amount;
		}
	});

	let partnerShare = $derived(
		isShared ? (splitType === 'percentage' ? amount * validatedSplitValue : validatedSplitValue) : 0
	);
	let yourShare = $derived(amount - partnerShare);

	// Split mode computed values
	let splitTotal = $derived(splitLines.reduce((sum, l) => sum + (l.amount || 0), 0));
	let splitRemaining = $derived(amount - splitTotal);
	let isSplitValid = $derived(
		splitLines.length >= 2 &&
		amount > 0 &&
		isSplitBalanced(splitRemaining) &&
		splitLines.every((l) => l.categoryId > 0 && l.amount > 0)
	);

	// Auto-correct invalid split values when switching types or when amount changes
	$effect(() => {
		if (isShared && splitType === 'fixed' && amount > 0 && splitValue > amount) {
			splitValue = amount;
		}
		if (isShared && splitType === 'percentage' && splitValue > 1) {
			splitValue = 1;
		}
	});

	// Reset future date confirmation when date changes
	$effect(() => {
		dateStr;
		futureDateConfirmed = false;
	});

	// Split mode functions
	function enableSplitMode() {
		isSplitMode = true;
		// Initialize with one line containing full amount (if we have a category selected) or empty
		if (categoryId > 0) {
			splitLines = [{ categoryId, amount }];
		} else {
			splitLines = [{ categoryId: 0, amount }];
		}
	}

	function disableSplitMode() {
		isSplitMode = false;
		splitLines = [];
	}

	function addSplitLine() {
		const newAmount = splitRemaining > 0 ? roundCurrency(splitRemaining) : 0;
		splitLines = [...splitLines, { categoryId: 0, amount: newAmount }];
	}

	function removeSplitLine(index: number) {
		if (splitLines.length > 1) {
			splitLines = splitLines.filter((_, i) => i !== index);
		}
	}

	function updateSplitLine(index: number, field: 'categoryId' | 'amount', value: number) {
		splitLines = splitLines.map((line, i) => (i === index ? { ...line, [field]: value } : line));
	}

	function handleSubmit(e: Event) {
		e.preventDefault();

		if (!validateAllFields()) {
			return;
		}

		// Block if future date not confirmed
		if (isFutureDate && !futureDateConfirmed) {
			return;
		}

		// Handle split mode submission
		if (isSplitMode) {
			if (!isSplitValid || !onSplitSubmit) {
				return;
			}

			onSplitSubmit({
				date: parseLocalDate(dateStr),
				merchant: merchant.trim(),
				isShared,
				isSettled: isShared ? isSettled : false,
				splitType,
				splitValue: validatedSplitValue,
				isEssential,
				isSubscription,
				subscriptionFrequency: isSubscription ? subscriptionFrequency : undefined,
				splits: splitLines
			});
		} else {
			if (!categoryId) {
				return;
			}

			onSubmit({
				date: parseLocalDate(dateStr),
				merchant: merchant.trim(),
				amount,
				categoryId,
				isShared,
				isSettled: isShared ? isSettled : false,
				splitType,
				splitValue: validatedSplitValue,
				notes: notes.trim() || undefined,
				isEssential,
				isSubscription,
				subscriptionFrequency: isSubscription ? subscriptionFrequency : undefined
			});
		}

		// Reset form
		merchant = '';
		amountStr = '';
		categoryId = 0;
		isShared = false;
		isSettled = false;
		splitType = settings.defaultSplitType;
		splitValue = settings.defaultSplitValue;
		notes = '';
		isEssential = false;
		isSubscription = false;
		subscriptionFrequency = 'monthly';
		isSplitMode = false;
		splitLines = [];
		futureDateConfirmed = false;
		touched = new Set();
		errors = {};
	}

	// Handle merchant selection from autocomplete
	function handleMerchantSelect(selectedMerchant: string, suggestedCategoryId: number | null) {
		merchant = selectedMerchant;
		if (suggestedCategoryId && categoryId === 0) {
			handleCategoryChange(suggestedCategoryId);
		}
	}

	// Handle merchant input (for auto-category lookup)
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

	// Handle category change - update isEssential to match category default
	function handleCategoryChange(newCategoryId: number) {
		categoryId = newCategoryId;
		const category = categories.find((c) => c.id === newCategoryId);
		if (category) {
			isEssential = category.isEssential;
		}
	}
</script>

{#if isExpanded}
	<!-- Expanded: full card with form -->
	<div
		class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden transition-all duration-500 {mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}"
		style="transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);"
	>
		<!-- Card Header -->
		<button
			type="button"
			onclick={toggleExpanded}
			class="w-full px-6 py-4 flex items-center justify-between hover:bg-surface-hover transition-colors"
		>
			<div class="flex items-center gap-3">
				<div class="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
					<Plus size={18} class="text-primary-600" />
				</div>
				<h2 class="font-display text-xl font-medium text-charcoal">Add Transaction</h2>
			</div>
			<ChevronDown
				size={20}
				class="text-charcoal-muted transition-transform duration-200 rotate-180"
			/>
		</button>

		<form onsubmit={handleSubmit} transition:slide={{ duration: 200 }}>
			<div class="px-6 pb-6 space-y-4">
		<!-- Date & Merchant Row -->
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<label for="date" class="block text-sm font-medium text-charcoal-soft mb-1.5">Date</label>
				<input
					type="date"
					id="date"
					bind:value={dateStr}
					class="w-full px-3 py-2.5 bg-surface-alt border rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors {isFutureDate && !futureDateConfirmed ? 'border-warning-500' : 'border-theme'}"
				/>
				{#if isFutureDate && !futureDateConfirmed}
					<div class="mt-2 p-2 bg-warning-50 border border-warning-200 rounded-lg">
						<p class="text-xs text-warning-700 mb-2">This date is in the future. Are you sure?</p>
						<button
							type="button"
							onclick={() => (futureDateConfirmed = true)}
							class="text-xs font-medium text-warning-700 hover:text-warning-800 underline"
						>
							Yes, use future date
						</button>
					</div>
				{/if}
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
					onBlur={() => handleBlur('merchant')}
					inputId="merchant"
				/>
				{#if touched.has('merchant') && errors.merchant}
					<p class="text-xs text-danger-500 mt-1">{errors.merchant}</p>
				{/if}
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
						onblur={() => handleBlur('amount')}
						step="0.01"
						min="0"
						placeholder="0.00"
						class="w-full pl-7 pr-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors font-mono placeholder:text-charcoal-muted"
					/>
				</div>
				{#if touched.has('amount') && errors.amount}
					<p class="text-xs text-danger-500 mt-1">{errors.amount}</p>
				{/if}
			</div>
			{#if !isSplitMode}
				<div>
					<label for="category" class="block text-sm font-medium text-charcoal-soft mb-1.5">Category</label>
					<CategoryCombobox
						{categories}
						value={categoryId}
						onSelect={(id) => { handleCategoryChange(id); handleBlur('category'); }}
					/>
				{#if touched.has('category') && errors.category}
					<p class="text-xs text-danger-500 mt-1">{errors.category}</p>
				{/if}
				</div>
			{/if}
		</div>

		<!-- Split by Category Section -->
		{#if isSplitMode}
			<div class="border border-primary-200 bg-primary-50/50 rounded-lg p-4 space-y-3" transition:slide={{ duration: 200 }}>
				<div class="flex items-center justify-between">
					<span class="text-sm font-medium text-charcoal-soft">Split into categories</span>
					<button
						type="button"
						onclick={disableSplitMode}
						class="text-xs text-charcoal-muted hover:text-charcoal"
					>
						Cancel split
					</button>
				</div>

				{#each splitLines as line, index (index)}
					<div class="flex items-center gap-2">
						<select
							value={line.categoryId}
							onchange={(e) => updateSplitLine(index, 'categoryId', parseInt(e.currentTarget.value))}
							class="flex-1 px-3 py-2 bg-surface border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors text-sm"
						>
							<option value={0}>Select category...</option>
							{#each activeCategories as cat (cat.id)}
								<option value={cat.id}>{cat.icon} {cat.name}</option>
							{/each}
						</select>
						<div class="relative w-24">
							<span class="absolute left-2 top-1/2 -translate-y-1/2 text-charcoal-muted font-mono text-sm">$</span>
							<input
								type="number"
								value={line.amount}
								oninput={(e) => updateSplitLine(index, 'amount', parseFloat(e.currentTarget.value) || 0)}
								step="0.01"
								min="0"
								class="w-full pl-5 pr-2 py-2 bg-surface border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors font-mono text-sm"
							/>
						</div>
						<button
							type="button"
							onclick={() => removeSplitLine(index)}
							disabled={splitLines.length <= 1}
							class="p-1.5 text-charcoal-muted hover:text-danger-500 hover:bg-danger-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
							aria-label="Remove line"
						>
							<Trash2 size={14} />
						</button>
					</div>
				{/each}

				<button
					type="button"
					onclick={addSplitLine}
					class="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-100 border border-dashed border-primary-300 rounded-lg transition-colors"
				>
					<Plus size={14} />
					<span>Add Line</span>
				</button>

				<!-- Validation Summary -->
				<div class="p-2 rounded-lg text-sm {isSplitBalanced(splitRemaining) ? 'bg-success-50 border border-success-200' : 'bg-warning-50 border border-warning-200'}">
					<div class="flex justify-between">
						<span class="text-charcoal-soft">Total:</span>
						<span class="font-mono font-medium text-charcoal">{formatCurrency(splitTotal)}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-charcoal-soft">Remaining:</span>
						<span class="font-mono font-medium {isSplitBalanced(splitRemaining) ? 'text-success-600' : splitRemaining > 0 ? 'text-warning-600' : 'text-danger-600'}">
							{formatCurrency(splitRemaining)}
						</span>
					</div>
					{#if splitLines.length < 2}
						<p class="text-xs text-warning-600 mt-1">Add at least 2 lines to split</p>
					{/if}
				</div>
			</div>
		{:else if onSplitSubmit && amount > 0}
			<!-- Split by Category Button (shown when not in split mode) -->
			<button
				type="button"
				onclick={enableSplitMode}
				class="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-charcoal-soft hover:text-charcoal border border-theme hover:bg-surface-alt rounded-lg transition-colors"
			>
				<Scissors size={16} />
				<span>Split by Category</span>
			</button>
		{/if}

		<SharedExpenseFields
			bind:isShared
			bind:splitType
			bind:splitValue
			{amount}
			partnerName={settings.partnerName}
			bind:isSettled
			showSettledOption={true}
		/>

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
				class="w-full px-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors placeholder:text-charcoal-muted"
			/>
		</div>

		<EssentialToggle bind:isEssential {selectedCategory} />

		<SubscriptionFields
			bind:isSubscription
			bind:subscriptionFrequency
			showTransition={true}
		/>

			<!-- Actions -->
			<div class="flex gap-3 pt-3">
				<button
					type="submit"
					disabled={!merchant.trim() || amount <= 0 || (isSplitMode ? !isSplitValid : !categoryId) || (isFutureDate && !futureDateConfirmed)}
					class="flex-1 bg-primary-500 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-primary-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary-500/25 focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none transition-all duration-150"
				>
					{isSplitMode ? `Add ${splitLines.length} Transactions` : 'Add Transaction'}
				</button>
				{#if onCancel}
					<button
						type="button"
						onclick={onCancel}
						class="px-4 py-2.5 border border-theme text-charcoal-soft rounded-lg font-medium hover:bg-surface-alt transition-colors"
					>
						Cancel
					</button>
				{/if}
			</div>
			</div>
		</form>
	</div>
{/if}
