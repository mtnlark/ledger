<script lang="ts">
	import { ChevronLeft, Square, CheckSquare } from 'lucide-svelte';
	import ModalContainer from './ModalContainer.svelte';
	import type { Category, Settings } from '$lib/db';
	import type { RecurringSuggestion } from '$lib/stores/recurringSuggestions';
	import { formatCurrency } from '$lib/utils/format-helpers';
	import { config } from '$lib/config';
	import { format } from 'date-fns';

	interface Props {
		isOpen: boolean;
		suggestions: RecurringSuggestion[];
		categories: Category[];
		settings: Settings;
		currentMonth: string;
		onAddSelected: (items: Array<RecurringSuggestion & { date: Date }>) => Promise<void>;
		onDismiss: () => void;
		onClose: () => void;
	}

	let {
		isOpen,
		suggestions,
		categories,
		settings,
		currentMonth,
		onAddSelected,
		onDismiss,
		onClose
	}: Props = $props();

	// Two-step flow: 'select' -> 'confirm'
	let step = $state<'select' | 'confirm'>('select');

	// Selection state: track which items are checked
	let selectedIds = $state(new Set<string>());

	// Confirmation state: editable date and amount for each selected item
	let confirmationData = $state(new Map<string, { date: string; amount: string }>());

	// Loading state
	let isSubmitting = $state(false);

	// Parse current month for date defaults
	function getMonthYear(): { year: number; month: number } {
		const [year, month] = currentMonth.split('-').map(Number);
		return { year, month: month - 1 }; // month is 0-indexed
	}

	// Initialize selection when modal opens (all checked by default)
	$effect(() => {
		if (isOpen && suggestions.length > 0) {
			selectedIds = new Set(suggestions.map((s) => s.id));
			confirmationData = new Map();
			step = 'select';
		}
	});

	// Get selected count
	let selectedCount = $derived(selectedIds.size);

	// Get selected suggestions
	let selectedSuggestions = $derived(
		suggestions.filter((s) => selectedIds.has(s.id))
	);

	// Calculate total from confirmation data (or original amounts if not yet in confirm step)
	let selectedTotal = $derived(() => {
		let total = 0;
		for (const suggestion of selectedSuggestions) {
			const data = confirmationData.get(suggestion.id);
			const amount = data ? parseFloat(data.amount) || 0 : suggestion.expectedAmount;
			total += amount;
		}
		return total;
	});

	// Get category by ID
	function getCategory(categoryId: number): Category | undefined {
		return categories.find((c) => c.id === categoryId);
	}

	// Toggle selection
	function toggleSelection(id: string) {
		const newSelected = new Set(selectedIds);
		if (newSelected.has(id)) {
			newSelected.delete(id);
		} else {
			newSelected.add(id);
		}
		selectedIds = newSelected;
	}

	// Select all
	function selectAll() {
		selectedIds = new Set(suggestions.map((s) => s.id));
	}

	// Deselect all
	function deselectAll() {
		selectedIds = new Set();
	}

	// Move to confirmation step
	function goToConfirm() {
		// Initialize confirmation data for selected items
		const { year, month } = getMonthYear();
		const newData = new Map<string, { date: string; amount: string }>();

		for (const suggestion of selectedSuggestions) {
			// Clamp expected date to valid day in month
			const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
			const day = Math.min(suggestion.expectedDate, lastDayOfMonth);
			const date = new Date(year, month, day);

			newData.set(suggestion.id, {
				date: format(date, 'yyyy-MM-dd'),
				amount: suggestion.expectedAmount.toFixed(2)
			});
		}

		confirmationData = newData;
		step = 'confirm';
	}

	// Go back to selection
	function goBackToSelect() {
		step = 'select';
	}

	// Update confirmation data
	function updateConfirmationDate(id: string, date: string) {
		const newData = new Map(confirmationData);
		const existing = newData.get(id);
		if (existing) {
			newData.set(id, { ...existing, date });
			confirmationData = newData;
		}
	}

	function updateConfirmationAmount(id: string, amount: string) {
		const newData = new Map(confirmationData);
		const existing = newData.get(id);
		if (existing) {
			newData.set(id, { ...existing, amount });
			confirmationData = newData;
		}
	}

	// Handle final submission
	async function handleSubmit() {
		const itemsToAdd = selectedSuggestions.map((s) => {
			const data = confirmationData.get(s.id)!;
			return {
				...s,
				expectedAmount: parseFloat(data.amount) || s.expectedAmount,
				date: new Date(data.date + 'T12:00:00') // Noon to avoid timezone issues
			};
		});

		if (itemsToAdd.length === 0) return;

		isSubmitting = true;
		try {
			await onAddSelected(itemsToAdd);
		} finally {
			isSubmitting = false;
		}
	}

	// Format frequency display
	function formatFrequency(frequency: string): string {
		switch (frequency) {
			case 'monthly':
				return 'Monthly';
			case 'semi-annual':
				return 'Every 6 mo';
			case 'annual':
				return 'Annual';
			default:
				return frequency;
		}
	}

	// Get ordinal suffix for day
	function getOrdinal(n: number): string {
		const s = ['th', 'st', 'nd', 'rd'];
		const v = n % 100;
		return n + (s[(v - 20) % 10] || s[v] || s[0]);
	}

	// Modal title based on step
	let modalTitle = $derived(
		step === 'select' ? 'Expected Recurring Transactions' : 'Confirm Transactions'
	);
</script>

<ModalContainer {isOpen} title={modalTitle} maxWidth="lg" onClose={onClose}>
	{#if step === 'select'}
		<!-- STEP 1: Selection -->
		<div class="px-6 py-4 space-y-4">
			{#if suggestions.length === 0}
				<p class="text-charcoal-muted text-center py-8">
					No recurring transactions expected this month.
				</p>
			{:else}
				<!-- Header with select all/none -->
				<div class="flex items-center justify-between text-sm">
					<div class="text-charcoal-muted">
						{selectedCount} of {suggestions.length} selected
					</div>
					<div class="flex gap-2">
						<button
							type="button"
							onclick={selectAll}
							class="text-primary-500 hover:text-primary-600 font-medium"
						>
							Select all
						</button>
						<span class="text-charcoal-muted">|</span>
						<button
							type="button"
							onclick={deselectAll}
							class="text-primary-500 hover:text-primary-600 font-medium"
						>
							None
						</button>
					</div>
				</div>

				<!-- Suggestions list -->
				<div class="space-y-2 max-h-[50vh] overflow-y-auto">
					{#each suggestions as suggestion (suggestion.id)}
						{@const category = getCategory(suggestion.categoryId)}
						{@const isSelected = selectedIds.has(suggestion.id)}

						<button
							type="button"
							onclick={() => toggleSelection(suggestion.id)}
							class="w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left {isSelected
								? 'bg-primary-50 border-primary-200'
								: 'bg-surface border-cream-dark hover:border-primary-200'}"
						>
							<!-- Checkbox -->
							<div class="flex-shrink-0 text-primary-500">
								{#if isSelected}
									<CheckSquare size={20} />
								{:else}
									<Square size={20} />
								{/if}
							</div>

							<!-- Category icon -->
							<div class="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-cream rounded-lg">
								<span class="text-lg">{category?.icon ?? config.category.defaultIcon}</span>
							</div>

							<!-- Merchant and details -->
							<div class="flex-1 min-w-0">
								<div class="font-medium text-charcoal truncate">
									{suggestion.merchant}
								</div>
								<div class="flex items-center gap-2 text-xs text-charcoal-muted">
									<span>{category?.name ?? 'Unknown'}</span>
									<span class="text-charcoal-muted/50">&middot;</span>
									<span>{formatFrequency(suggestion.frequency)}</span>
									{#if suggestion.frequency === 'monthly'}
										<span class="text-charcoal-muted/50">&middot;</span>
										<span>~{getOrdinal(suggestion.expectedDate)}</span>
									{/if}
									{#if suggestion.isShared}
										<span class="text-charcoal-muted/50">&middot;</span>
										<span class="text-primary-500">Shared</span>
									{/if}
								</div>
							</div>

							<!-- Amount -->
							<div class="flex-shrink-0 text-right font-mono text-sm">
								{#if suggestion.amountType === 'variable'}
									<span class="text-charcoal-muted">~</span>
								{/if}
								{formatCurrency(suggestion.expectedAmount)}
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Selection Actions -->
		<div
			class="px-6 py-4 border-t border-dashed border-theme-dashed bg-cream/50 flex items-center justify-between gap-3"
		>
			<button
				type="button"
				onclick={onDismiss}
				class="px-4 py-2 text-sm font-medium text-charcoal-muted hover:text-charcoal transition-colors"
			>
				Remind me next month
			</button>

			<div class="flex gap-2">
				{#if suggestions.length > 0}
					<button
						type="button"
						onclick={goToConfirm}
						class="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors disabled:opacity-50"
						disabled={selectedCount === 0}
					>
						Continue ({selectedCount})
					</button>
				{:else}
					<button
						type="button"
						onclick={onClose}
						class="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors"
					>
						Done
					</button>
				{/if}
			</div>
		</div>

	{:else}
		<!-- STEP 2: Confirmation -->
		<div class="px-6 py-4 space-y-4">
			<p class="text-sm text-charcoal-muted">
				Review and adjust dates and amounts before adding.
			</p>

			<!-- Confirmation list -->
			<div class="space-y-3 max-h-[50vh] overflow-y-auto">
				{#each selectedSuggestions as suggestion (suggestion.id)}
					{@const category = getCategory(suggestion.categoryId)}
					{@const data = confirmationData.get(suggestion.id)}

					<div class="p-4 rounded-lg border border-cream-dark bg-surface space-y-3">
						<!-- Header row -->
						<div class="flex items-center gap-3">
							<div class="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-cream rounded-lg">
								<span class="text-lg">{category?.icon ?? config.category.defaultIcon}</span>
							</div>
							<div class="flex-1 min-w-0">
								<div class="font-medium text-charcoal truncate">
									{suggestion.merchant}
								</div>
								<div class="text-xs text-charcoal-muted">
									{category?.name ?? 'Unknown'}
									{#if suggestion.isShared}
										<span class="text-charcoal-muted/50">&middot;</span>
										<span class="text-primary-500">Shared</span>
									{/if}
								</div>
							</div>
						</div>

						<!-- Date and Amount inputs -->
						<div class="grid grid-cols-2 gap-3">
							<div>
								<label class="block text-xs font-medium text-charcoal-muted mb-1">
									Date
								</label>
								<input
									type="date"
									value={data?.date ?? ''}
									onchange={(e) => updateConfirmationDate(suggestion.id, e.currentTarget.value)}
									class="w-full px-3 py-2 text-sm border border-cream-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
								/>
							</div>
							<div>
								<label class="block text-xs font-medium text-charcoal-muted mb-1">
									Amount
								</label>
								<div class="relative">
									<span class="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-muted">$</span>
									<input
										type="text"
										inputmode="decimal"
										value={data?.amount ?? ''}
										onchange={(e) => updateConfirmationAmount(suggestion.id, e.currentTarget.value)}
										class="w-full pl-7 pr-3 py-2 text-sm font-mono border border-cream-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
									/>
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>

			<!-- Running total -->
			<div
				class="flex items-center justify-between pt-4 border-t border-dashed border-theme-dashed"
			>
				<span class="text-charcoal-muted">Total:</span>
				<span class="font-mono font-medium text-charcoal">
					{formatCurrency(selectedTotal())}
				</span>
			</div>
		</div>

		<!-- Confirmation Actions -->
		<div
			class="px-6 py-4 border-t border-dashed border-theme-dashed bg-cream/50 flex items-center justify-between gap-3"
		>
			<button
				type="button"
				onclick={goBackToSelect}
				class="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-charcoal-muted hover:text-charcoal transition-colors"
				disabled={isSubmitting}
			>
				<ChevronLeft size={16} />
				Back
			</button>

			<button
				type="button"
				onclick={handleSubmit}
				class="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors disabled:opacity-50"
				disabled={isSubmitting}
			>
				{#if isSubmitting}
					Adding...
				{:else}
					Add {selectedCount} {selectedCount === 1 ? 'Transaction' : 'Transactions'}
				{/if}
			</button>
		</div>
	{/if}
</ModalContainer>
