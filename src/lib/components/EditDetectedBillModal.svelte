<script lang="ts">
	import ModalContainer from './ModalContainer.svelte';
	import { formatCurrency } from '$lib/utils/format-helpers';

	interface Props {
		isOpen: boolean;
		merchant: string;
		detectedAmount: number;
		isVariable: boolean;
		onSave: (action: 'keep' | 'fixed' | 'remove', fixedAmount?: number) => void;
		onClose: () => void;
	}

	let { isOpen, merchant, detectedAmount, isVariable, onSave, onClose }: Props = $props();

	let selectedAction = $state<'keep' | 'fixed' | 'remove'>('keep');
	let fixedAmount = $state('');
	let isSubmitting = $state(false);

	// Reset state when modal opens
	$effect(() => {
		if (isOpen) {
			selectedAction = 'keep';
			fixedAmount = detectedAmount.toFixed(2);
			isSubmitting = false;
		}
	});

	async function handleSave() {
		if (isSubmitting) return;
		isSubmitting = true;

		try {
			if (selectedAction === 'fixed') {
				const amount = parseFloat(fixedAmount);
				if (isNaN(amount) || amount <= 0) {
					isSubmitting = false;
					return;
				}
				onSave('fixed', amount);
			} else {
				onSave(selectedAction);
			}
			onClose();
		} finally {
			isSubmitting = false;
		}
	}
</script>

<ModalContainer {isOpen} onClose={onClose} title="Edit Detected Bill">
	<div class="px-6 py-4 space-y-4">
		<div>
			<p class="font-medium text-charcoal">{merchant}</p>
			<p class="text-sm text-charcoal-muted">
				Detected: ~{formatCurrency(detectedAmount)}/mo
				{#if isVariable}
					<span class="text-warning-600">(varies)</span>
				{/if}
			</p>
		</div>

		<div class="space-y-3">
			<label class="flex items-start gap-3 p-3 rounded-lg border border-theme hover:bg-surface-hover cursor-pointer transition-colors">
				<input
					type="radio"
					name="action"
					value="keep"
					bind:group={selectedAction}
					class="mt-0.5"
				/>
				<div>
					<p class="text-sm font-medium text-charcoal">Keep as detected</p>
					<p class="text-xs text-charcoal-muted">Use the auto-calculated amount{isVariable ? ' (variable)' : ''}</p>
				</div>
			</label>

			<label class="flex items-start gap-3 p-3 rounded-lg border border-theme hover:bg-surface-hover cursor-pointer transition-colors">
				<input
					type="radio"
					name="action"
					value="fixed"
					bind:group={selectedAction}
					class="mt-0.5"
				/>
				<div class="flex-1">
					<p class="text-sm font-medium text-charcoal">Set fixed amount</p>
					<p class="text-xs text-charcoal-muted">
						{#if selectedAction === 'fixed'}
							Enter your expected monthly amount
						{:else}
							Select to enter a custom amount
						{/if}
					</p>
					{#if selectedAction === 'fixed'}
						<div class="mt-2">
							<div class="relative">
								<span class="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-muted">$</span>
								<input
									type="number"
									step="0.01"
									min="0.01"
									bind:value={fixedAmount}
									class="w-full pl-7 pr-3 py-2 text-sm border border-theme rounded-lg bg-surface focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 font-mono"
									placeholder="0.00"
								/>
							</div>
						</div>
					{/if}
				</div>
			</label>

			<label class="flex items-start gap-3 p-3 rounded-lg border border-danger-200 hover:bg-danger-50 cursor-pointer transition-colors">
				<input
					type="radio"
					name="action"
					value="remove"
					bind:group={selectedAction}
					class="mt-0.5"
				/>
				<div>
					<p class="text-sm font-medium text-danger-700">Remove from recurring list</p>
					<p class="text-xs text-charcoal-muted">This bill won't appear in your recurring expenses</p>
				</div>
			</label>
		</div>

		<!-- Actions -->
		<div class="flex justify-end gap-3 pt-2">
			<button
				type="button"
				onclick={onClose}
				class="px-4 py-2 text-sm font-medium text-charcoal-soft hover:text-charcoal transition-colors"
			>
				Cancel
			</button>
			<button
				type="button"
				onclick={handleSave}
				disabled={isSubmitting || (selectedAction === 'fixed' && (!fixedAmount || parseFloat(fixedAmount) <= 0))}
				class="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
			>
				{#if isSubmitting}
					<span class="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></span>
				{/if}
				Save
			</button>
		</div>
	</div>
</ModalContainer>
