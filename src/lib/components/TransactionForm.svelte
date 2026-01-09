<script lang="ts">
	import { onMount } from 'svelte';
	import { format } from 'date-fns';
	import { ChevronDown, Plus, Scissors, Trash2 } from 'lucide-svelte';
	import { slide } from 'svelte/transition';
	import type { Category, Settings } from '$lib/db';
	import { parseLocalDate } from '$lib/utils/date-helpers';
	import CategoryCombobox from './CategoryCombobox.svelte';
	import MerchantAutocomplete from './MerchantAutocomplete.svelte';
	import { getMostCommonCategory } from '$lib/stores/merchants';

	const STORAGE_KEY = 'ledger-addform-expanded';

	interface Props {
		categories: Category[];
		settings: Settings;
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

	let { categories, settings, onSubmit, onSplitSubmit, onCancel }: Props = $props();

	// Animation state
	let mounted = $state(false);
	let isExpanded = $state(false);

	onMount(() => {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored !== null) {
			isExpanded = stored === 'true';
		}
		setTimeout(() => mounted = true, 100);
	});

	function toggleExpanded() {
		isExpanded = !isExpanded;
		localStorage.setItem(STORAGE_KEY, String(isExpanded));
	}

	// Form state
	let dateStr = $state(format(new Date(), 'yyyy-MM-dd'));
	let merchant = $state('');
	let amountStr = $state('');
	let categoryId = $state(0);
	let isShared = $state(false);
	let isSettled = $state(false);
	let splitType = $state<'percentage' | 'fixed'>(settings.defaultSplitType);
	let splitValue = $state(settings.defaultSplitValue);
	let notes = $state('');
	let isEssential = $state(false);
	let isSubscription = $state(false);
	let subscriptionFrequency = $state<'monthly' | 'annual'>('monthly');
	let futureDateConfirmed = $state(false);

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
		Math.abs(splitRemaining) < 0.01 &&
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
		const newAmount = splitRemaining > 0 ? Math.round(splitRemaining * 100) / 100 : 0;
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

		if (!merchant.trim() || amount <= 0) {
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

<div
	class="bg-white rounded-xl shadow-md shadow-gray-200/50 overflow-hidden transition-all duration-500 {mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}"
	style="transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);"
>
	<!-- Collapsible Header -->
	<button
		type="button"
		onclick={toggleExpanded}
		class="w-full px-6 py-4 flex items-center justify-between hover:bg-cream/50 transition-colors"
	>
		<div class="flex items-center gap-3">
			<div class="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
				<Plus size={18} class="text-primary-600" />
			</div>
			<h2 class="font-display text-xl font-medium text-charcoal">Add Transaction</h2>
		</div>
		<ChevronDown
			size={20}
			class="text-charcoal-muted transition-transform duration-200 {isExpanded ? 'rotate-180' : ''}"
		/>
	</button>

	<!-- Collapsible Content -->
	{#if isExpanded}
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
					class="w-full px-3 py-2.5 bg-cream border rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors {isFutureDate && !futureDateConfirmed ? 'border-warning-500' : 'border-[rgba(45,42,38,0.15)]'}"
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
			{#if !isSplitMode}
				<div>
					<label for="category" class="block text-sm font-medium text-charcoal-soft mb-1.5">Category</label>
					<CategoryCombobox
						{categories}
						value={categoryId}
						onSelect={handleCategoryChange}
					/>
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
							class="flex-1 px-3 py-2 bg-white border border-[rgba(45,42,38,0.15)] rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors text-sm"
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
								class="w-full pl-5 pr-2 py-2 bg-white border border-[rgba(45,42,38,0.15)] rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors font-mono text-sm"
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
				<div class="p-2 rounded-lg text-sm {Math.abs(splitRemaining) < 0.01 ? 'bg-success-50 border border-success-200' : 'bg-warning-50 border border-warning-200'}">
					<div class="flex justify-between">
						<span class="text-charcoal-soft">Total:</span>
						<span class="font-mono font-medium text-charcoal">{formatCurrency(splitTotal)}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-charcoal-soft">Remaining:</span>
						<span class="font-mono font-medium {Math.abs(splitRemaining) < 0.01 ? 'text-success-600' : splitRemaining > 0 ? 'text-warning-600' : 'text-danger-600'}">
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
				class="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-charcoal-soft hover:text-charcoal border border-[rgba(45,42,38,0.15)] hover:bg-cream rounded-lg transition-colors"
			>
				<Scissors size={16} />
				<span>Split by Category</span>
			</button>
		{/if}

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
								{#if amount > 0}
									<span class="text-charcoal-muted">(max {formatCurrency(amount)})</span>
								{/if}
							</label>
							<div class="relative">
								<span class="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-muted font-mono">$</span>
								<input
									type="number"
									id="splitFixed"
									bind:value={splitValue}
									onblur={() => { if (splitValue > amount) splitValue = amount; if (splitValue < 0) splitValue = 0; }}
									step="0.01"
									min="0"
									max={amount}
									class="w-full pl-7 pr-3 py-2 bg-white border rounded-lg focus:ring-2 transition-colors font-mono {splitValueInvalid ? 'border-warning-500 focus:ring-warning-500/20 focus:border-warning-500' : 'border-[rgba(45,42,38,0.15)] focus:ring-success-500/20 focus:border-success-500'}"
								/>
							</div>
							{#if splitValueInvalid}
								<p class="text-xs text-warning-600 mt-1">Value will be clamped to {formatCurrency(validatedSplitValue)}</p>
							{/if}
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

					<!-- Already Settled Option -->
					<label class="flex items-center gap-2 pt-2 cursor-pointer">
						<input
							type="checkbox"
							bind:checked={isSettled}
							class="w-4 h-4 text-success-500 border-gray-300 rounded focus:ring-success-500/20"
						/>
						<span class="text-sm text-charcoal-soft">Already settled</span>
					</label>
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

		<!-- Essential Toggle -->
		<div class="border-t border-dashed border-gray-200 pt-4">
			<label class="flex items-center justify-between cursor-pointer">
				<div>
					<span class="text-sm font-medium text-charcoal-soft">Essential spending</span>
					<p class="text-xs text-charcoal-muted mt-0.5">
						{#if selectedCategory}
							{selectedCategory.isEssential ? 'Category default: Need' : 'Category default: Want'}
						{:else}
							Mark as a "need" vs discretionary "want"
						{/if}
					</p>
				</div>
				<button
					type="button"
					onclick={() => (isEssential = !isEssential)}
					class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-2 {isEssential ? 'bg-primary-500' : 'bg-gray-200'}"
					role="switch"
					aria-checked={isEssential}
					aria-label="Toggle essential spending"
				>
					<span
						class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {isEssential ? 'translate-x-5' : 'translate-x-0'}"
					></span>
				</button>
			</label>
		</div>

		<!-- Subscription Toggle -->
		<div class="border-t border-dashed border-gray-200 pt-4">
			<label class="flex items-center justify-between cursor-pointer">
				<div>
					<span class="text-sm font-medium text-charcoal-soft">Subscription</span>
					<p class="text-xs text-charcoal-muted mt-0.5">Recurring payment (e.g., streaming, news)</p>
				</div>
				<button
					type="button"
					onclick={() => (isSubscription = !isSubscription)}
					class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-2 {isSubscription ? 'bg-primary-500' : 'bg-gray-200'}"
					role="switch"
					aria-checked={isSubscription}
					aria-label="Toggle subscription"
				>
					<span
						class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {isSubscription ? 'translate-x-5' : 'translate-x-0'}"
					></span>
				</button>
			</label>

			<!-- Frequency selector (shown when subscription is enabled) -->
			{#if isSubscription}
				<div class="mt-3 ml-0 flex gap-2" transition:slide={{ duration: 150 }}>
					<button
						type="button"
						onclick={() => (subscriptionFrequency = 'monthly')}
						class="px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-150 {subscriptionFrequency === 'monthly'
							? 'bg-primary-500 text-white shadow-sm'
							: 'bg-cream text-charcoal-soft border border-[rgba(45,42,38,0.15)] hover:bg-cream-dark'}"
					>
						Monthly
					</button>
					<button
						type="button"
						onclick={() => (subscriptionFrequency = 'annual')}
						class="px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-150 {subscriptionFrequency === 'annual'
							? 'bg-primary-500 text-white shadow-sm'
							: 'bg-cream text-charcoal-soft border border-[rgba(45,42,38,0.15)] hover:bg-cream-dark'}"
					>
						Annual
					</button>
				</div>
			{/if}
		</div>

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
						class="px-4 py-2.5 border border-[rgba(45,42,38,0.15)] text-charcoal-soft rounded-lg font-medium hover:bg-cream transition-colors"
					>
						Cancel
					</button>
				{/if}
			</div>
			</div>
		</form>
	{/if}
</div>
