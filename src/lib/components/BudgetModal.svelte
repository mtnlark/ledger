<script lang="ts">
	import type { MonthlyBudget } from '$lib/db';

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
		class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
		onclick={handleBackdropClick}
	>
		<!-- Modal -->
		<div class="bg-white rounded-xl shadow-xl max-w-md w-full" onclick={(e) => e.stopPropagation()}>
			<!-- Header -->
			<div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
				<h2 class="text-lg font-semibold text-gray-900">
					Budget for {monthDisplay}
				</h2>
				<button
					onclick={onClose}
					class="text-gray-400 hover:text-gray-600 p-1"
					aria-label="Close"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
					</svg>
				</button>
			</div>

			<!-- Form -->
			<form onsubmit={handleSubmit} class="p-6 space-y-4">
				<!-- Income -->
				<div>
					<label for="income" class="block text-sm font-medium text-gray-700 mb-1">
						Monthly Income
					</label>
					<div class="relative">
						<span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
						<input
							type="text"
							inputmode="decimal"
							id="income"
							value={incomeStr}
							oninput={handleIncomeInput}
							placeholder="0.00"
							class="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						/>
					</div>
					<p class="mt-1 text-xs text-gray-500">Your total income for this month</p>
				</div>

				<!-- Saved -->
				<div>
					<label for="saved" class="block text-sm font-medium text-gray-700 mb-1">
						Amount Saved
					</label>
					<div class="relative">
						<span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
						<input
							type="text"
							inputmode="decimal"
							id="saved"
							value={savedStr}
							oninput={handleSavedInput}
							placeholder="0.00"
							class="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						/>
					</div>
					<p class="mt-1 text-xs text-gray-500">Amount set aside for savings this month</p>
				</div>

				<!-- Notes -->
				<div>
					<label for="notes" class="block text-sm font-medium text-gray-700 mb-1">
						Notes <span class="text-gray-400 font-normal">(optional)</span>
					</label>
					<input
						type="text"
						id="notes"
						bind:value={notes}
						placeholder="Any notes about this month..."
						class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					/>
				</div>

				<!-- Preview -->
				{#if incomeStr || savedStr}
					{@const income = parseFloat(cleanNumberInput(incomeStr)) || 0}
					{@const saved = parseFloat(cleanNumberInput(savedStr)) || 0}
					{@const available = income - saved}
					<div class="bg-gray-50 rounded-lg p-4 text-sm">
						<div class="flex justify-between text-gray-600">
							<span>Available to spend:</span>
							<span class="font-semibold text-gray-900">
								${available.toLocaleString('en-US', { minimumFractionDigits: 2 })}
							</span>
						</div>
					</div>
				{/if}

				<!-- Actions -->
				<div class="flex gap-3 pt-2">
					<button
						type="submit"
						class="flex-1 bg-blue-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
					>
						Save Budget
					</button>
					<button
						type="button"
						onclick={onClose}
						class="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
					>
						Cancel
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
