<script lang="ts">
	import { X } from 'lucide-svelte';
	import type { MonthlyBudget } from '$lib/db';
	import { focusTrap } from '$lib/utils/focus-trap';

	interface Props {
		isOpen: boolean;
		budget: MonthlyBudget | null;
		month: string;
		monthDisplay: string;
		onSave: (data: { income: number; savedAmount: number; notes?: string }) => void;
		onClose: () => void;
	}

	let { isOpen, budget, month, monthDisplay, onSave, onClose }: Props = $props();

	// Form state - initialize from existing budget or defaults
	let incomeStr = $state('');
	let savedStr = $state('');
	let notes = $state('');

	// Reset form when modal opens or budget changes
	$effect(() => {
		if (isOpen) {
			incomeStr = budget?.income?.toString() ?? '';
			savedStr = budget?.savedAmount?.toString() ?? '';
			notes = budget?.notes ?? '';
		}
	});

	// Strip commas and other non-numeric characters (except decimal point)
	function cleanNumberInput(value: string): string {
		return value.replace(/[^0-9.]/g, '');
	}

	// Handle paste/input for income field
	function handleIncomeInput(e: Event) {
		const input = e.target as HTMLInputElement;
		incomeStr = cleanNumberInput(input.value);
	}

	// Handle paste/input for saved field
	function handleSavedInput(e: Event) {
		const input = e.target as HTMLInputElement;
		savedStr = cleanNumberInput(input.value);
	}

	function handleSubmit(e: Event) {
		e.preventDefault();
		const income = parseFloat(cleanNumberInput(incomeStr)) || 0;
		const savedAmount = parseFloat(cleanNumberInput(savedStr)) || 0;

		onSave({
			income,
			savedAmount,
			notes: notes.trim() || undefined
		});
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onClose();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- Backdrop -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
		onclick={handleBackdropClick}
	>
		<!-- Modal -->
		<div
			class="bg-surface rounded-xl shadow-xl shadow-[var(--color-shadow)] max-w-md w-full animate-enter"
			role="dialog"
			aria-modal="true"
			aria-labelledby="budget-modal-title"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			use:focusTrap
		>
			<!-- Header -->
			<div class="px-6 py-4 border-b border-dashed border-theme-dashed flex items-center justify-between">
				<h2 id="budget-modal-title" class="font-display text-xl font-medium text-charcoal">
					Budget for {monthDisplay}
				</h2>
				<button
					onclick={onClose}
					class="text-charcoal-muted hover:text-charcoal p-1.5 hover:bg-surface-hover rounded-lg transition-colors"
					aria-label="Close"
				>
					<X size={20} />
				</button>
			</div>

			<!-- Form -->
			<form onsubmit={handleSubmit} class="p-6 space-y-4">
				<!-- Income -->
				<div>
					<label for="income" class="block text-sm font-medium text-charcoal-soft mb-1.5">
						Monthly Income
					</label>
					<div class="relative">
						<span class="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-muted font-mono">$</span>
						<input
							type="text"
							inputmode="decimal"
							id="income"
							value={incomeStr}
							oninput={handleIncomeInput}
							placeholder="0.00"
							class="w-full pl-7 pr-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors font-mono placeholder:text-charcoal-muted"
						/>
					</div>
					<p class="mt-1.5 text-xs text-charcoal-muted">Your total income for this month</p>
				</div>

				<!-- Saved -->
				<div>
					<label for="saved" class="block text-sm font-medium text-charcoal-soft mb-1.5">
						Amount Saved
					</label>
					<div class="relative">
						<span class="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-muted font-mono">$</span>
						<input
							type="text"
							inputmode="decimal"
							id="saved"
							value={savedStr}
							oninput={handleSavedInput}
							placeholder="0.00"
							class="w-full pl-7 pr-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors font-mono placeholder:text-charcoal-muted"
						/>
					</div>
					<p class="mt-1.5 text-xs text-charcoal-muted">Amount set aside for savings this month</p>
				</div>

				<!-- Notes -->
				<div>
					<label for="notes" class="block text-sm font-medium text-charcoal-soft mb-1.5">
						Notes <span class="text-charcoal-muted font-normal">(optional)</span>
					</label>
					<input
						type="text"
						id="notes"
						bind:value={notes}
						placeholder="Any notes about this month..."
						class="w-full px-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors placeholder:text-charcoal-muted"
					/>
				</div>

				<!-- Preview -->
				{#if incomeStr || savedStr}
					{@const income = parseFloat(cleanNumberInput(incomeStr)) || 0}
					{@const saved = parseFloat(cleanNumberInput(savedStr)) || 0}
					{@const available = income - saved}
					<div class="bg-surface-alt rounded-lg p-4 border border-dashed border-theme-dashed">
						<div class="flex items-baseline text-charcoal-soft">
							<span class="text-sm">Available to spend:</span>
							<span class="ledger-line"></span>
							<span class="font-mono font-medium text-charcoal text-lg">
								${available.toLocaleString('en-US', { minimumFractionDigits: 2 })}
							</span>
						</div>
					</div>
				{/if}

				<!-- Actions -->
				<div class="flex gap-3 pt-3">
					<button
						type="submit"
						class="flex-1 bg-primary-500 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-primary-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary-500/25 focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-2 transition-all duration-150"
					>
						Save Budget
					</button>
					<button
						type="button"
						onclick={onClose}
						class="px-4 py-2.5 border border-theme text-charcoal-soft rounded-lg font-medium hover:bg-surface-hover transition-colors"
					>
						Cancel
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
