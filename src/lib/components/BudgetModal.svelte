<script lang="ts">
	import { ArrowRight } from 'lucide-svelte';
	import type { MonthlyBudget } from '$lib/db';
	import { cleanNumberInput } from '$lib/utils/form-validation';
	import { formatCurrency } from '$lib/utils/format-helpers';
	import ModalContainer from './ModalContainer.svelte';

	interface Props {
		isOpen: boolean;
		budget: MonthlyBudget | null;
		savedFromContributions: number;
		month: string;
		monthDisplay: string;
		onSave: (data: { income: number; notes?: string }) => void;
		onClose: () => void;
	}

	let { isOpen, budget, savedFromContributions, month, monthDisplay, onSave, onClose }: Props = $props();

	// Form state - initialize from existing budget or defaults
	let incomeStr = $state('');
	let notes = $state('');

	// Reset form when modal opens or budget changes
	$effect(() => {
		if (isOpen) {
			incomeStr = budget?.income?.toString() ?? '';
			notes = budget?.notes ?? '';
		}
	});

	// Handle paste/input for income field
	function handleIncomeInput(e: Event) {
		const input = e.target as HTMLInputElement;
		incomeStr = cleanNumberInput(input.value);
	}

	function handleSubmit(e: Event) {
		e.preventDefault();
		const income = parseFloat(cleanNumberInput(incomeStr)) || 0;

		onSave({
			income,
			notes: notes.trim() || undefined
		});
	}
</script>

<ModalContainer {isOpen} title="Budget for {monthDisplay}" titleId="budget-modal-title" {onClose}>
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

		<!-- Saved (read-only, from contributions) -->
		<div>
			<span class="block text-sm font-medium text-charcoal-soft mb-1.5">
				Amount Saved
			</span>
			<div class="px-3 py-2.5 bg-surface-alt border border-theme rounded-lg">
				<span class="font-mono text-charcoal">{formatCurrency(savedFromContributions)}</span>
			</div>
			<div class="mt-1.5 flex items-center justify-between">
				<p class="text-xs text-charcoal-muted">From savings contributions this month</p>
				<a
					href="/savings"
					class="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium"
					onclick={onClose}
				>
					Manage savings
					<ArrowRight size={12} />
				</a>
			</div>
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
		{#if incomeStr}
			{@const income = parseFloat(cleanNumberInput(incomeStr)) || 0}
			{@const available = income - savedFromContributions}
			<div class="bg-surface-alt rounded-lg p-4 border border-dashed border-theme-dashed">
				<div class="flex items-baseline text-charcoal-soft">
					<span class="text-sm">Available to spend:</span>
					<span class="ledger-line"></span>
					<span class="font-mono font-medium text-charcoal text-lg">
						{formatCurrency(available)}
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
</ModalContainer>
