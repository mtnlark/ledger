<script lang="ts">
	import { format } from 'date-fns';
	import { Trash2 } from 'lucide-svelte';
	import { CONTRIBUTION_SOURCES, type SavingsAccount, type SavingsContribution, type ContributionSource } from '$lib/db';
	import { parseLocalDate, formatDateForInput } from '$lib/utils/date-helpers';
	import { cleanNumberInput } from '$lib/utils/form-validation';
	import { updateContribution, deleteContribution } from '$lib/stores/savingsContributions';
	import { toast } from '$lib/stores/toast';
	import ModalContainer from './ModalContainer.svelte';

	interface Props {
		isOpen: boolean;
		contribution: SavingsContribution | null;
		accounts: SavingsAccount[];
		onSave: () => void;
		onDelete: () => void;
		onClose: () => void;
	}

	let { isOpen, contribution, accounts, onSave, onDelete, onClose }: Props = $props();

	// Only show modal when open AND we have a contribution
	let isModalOpen = $derived(isOpen && contribution !== null);

	// Form state
	let dateStr = $state('');
	let accountId = $state<number | ''>('');
	let amountStr = $state('');
	let source = $state<'bank_transfer' | 'payroll_deduction' | 'interest' | 'employer_match' | 'other'>('bank_transfer');
	let notes = $state('');
	let isSubmitting = $state(false);
	let showDeleteConfirm = $state(false);

	// Reset form when modal opens or contribution changes
	$effect(() => {
		if (isOpen && contribution) {
			dateStr = formatDateForInput(new Date(contribution.date));
			accountId = contribution.accountId;
			amountStr = contribution.amount.toString();
			source = contribution.source;
			notes = contribution.notes ?? '';
			isSubmitting = false;
			showDeleteConfirm = false;
		}
	});

	function handleAmountInput(e: Event) {
		const input = e.target as HTMLInputElement;
		amountStr = cleanNumberInput(input.value);
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (isSubmitting || !contribution?.id || !accountId || !amountStr) return;

		const amount = parseFloat(cleanNumberInput(amountStr));
		if (isNaN(amount) || amount <= 0) return;

		isSubmitting = true;
		try {
			await updateContribution(contribution.id, {
				date: parseLocalDate(dateStr),
				accountId: accountId as number,
				amount,
				source,
				notes: notes.trim() || undefined
			});
			onSave();
		} catch (error) {
			console.error('Failed to update contribution:', error);
			toast.error('Failed to save changes. Please try again.');
			isSubmitting = false;
		}
	}

	async function handleDelete() {
		if (!contribution?.id || isSubmitting) return;

		isSubmitting = true;
		try {
			await deleteContribution(contribution.id);
			onDelete();
		} catch (error) {
			console.error('Failed to delete contribution:', error);
			toast.error('Failed to delete contribution. Please try again.');
			isSubmitting = false;
		}
	}

	// Derive source options from central constant
	const sourceOptions = (Object.entries(CONTRIBUTION_SOURCES) as [ContributionSource, typeof CONTRIBUTION_SOURCES[ContributionSource]][]).map(
		([value, meta]) => ({ value, label: meta.label, description: meta.description })
	);
</script>

<ModalContainer isOpen={isModalOpen} title="Edit Contribution" titleId="edit-contribution-title" {onClose}>
	<form onsubmit={handleSubmit} class="p-6 space-y-4">
		<!-- Date & Amount Row -->
		<div class="grid grid-cols-2 gap-4">
			<div>
				<label for="edit-contrib-date" class="block text-sm font-medium text-charcoal-soft mb-1.5">
					Date
				</label>
				<input
					type="date"
					id="edit-contrib-date"
					bind:value={dateStr}
					class="w-full px-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
				/>
			</div>
			<div>
				<label for="edit-contrib-amount" class="block text-sm font-medium text-charcoal-soft mb-1.5">
					Amount
				</label>
				<div class="relative">
					<span class="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-muted font-mono"
						>$</span
					>
					<input
						type="text"
						inputmode="decimal"
						id="edit-contrib-amount"
						value={amountStr}
						oninput={handleAmountInput}
						placeholder="0.00"
						class="w-full pl-7 pr-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors font-mono placeholder:text-charcoal-muted"
					/>
				</div>
			</div>
		</div>

		<!-- Account -->
		<div>
			<label for="edit-contrib-account" class="block text-sm font-medium text-charcoal-soft mb-1.5">
				Account
			</label>
			<select
				id="edit-contrib-account"
				bind:value={accountId}
				class="w-full px-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
			>
				{#each accounts as account (account.id)}
					<option value={account.id}>
						{account.icon} {account.name}
					</option>
				{/each}
			</select>
		</div>

		<!-- Source -->
		<div>
			<label for="edit-contrib-source" class="block text-sm font-medium text-charcoal-soft mb-1.5">
				Source
			</label>
			<select
				id="edit-contrib-source"
				bind:value={source}
				class="w-full px-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
			>
				{#each sourceOptions as opt}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
			<p class="mt-1.5 text-xs text-charcoal-muted">
				{sourceOptions.find((o) => o.value === source)?.description}
			</p>
		</div>

		<!-- Notes -->
		<div>
			<label for="edit-contrib-notes" class="block text-sm font-medium text-charcoal-soft mb-1.5">
				Notes <span class="text-charcoal-muted font-normal">(optional)</span>
			</label>
			<input
				type="text"
				id="edit-contrib-notes"
				bind:value={notes}
				placeholder="Any notes about this contribution..."
				class="w-full px-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors placeholder:text-charcoal-muted"
			/>
		</div>

		<!-- Delete Section -->
		<div class="border-t border-dashed border-theme-dashed pt-4">
			{#if showDeleteConfirm}
				<div class="bg-danger-50 border border-danger-200 rounded-lg p-3">
					<p class="text-sm text-danger-700 mb-3">
						Delete this contribution? This cannot be undone.
					</p>
					<div class="flex gap-2">
						<button
							type="button"
							onclick={handleDelete}
							disabled={isSubmitting}
							class="px-3 py-1.5 bg-danger-500 text-white text-sm font-medium rounded-lg hover:bg-danger-600 transition-colors disabled:opacity-50"
						>
							Delete
						</button>
						<button
							type="button"
							onclick={() => (showDeleteConfirm = false)}
							class="px-3 py-1.5 text-sm text-charcoal-soft hover:bg-surface-hover rounded-lg transition-colors"
						>
							Cancel
						</button>
					</div>
				</div>
			{:else}
				<button
					type="button"
					onclick={() => (showDeleteConfirm = true)}
					class="flex items-center gap-2 text-sm text-danger-600 hover:text-danger-700"
				>
					<Trash2 size={14} />
					Delete contribution
				</button>
			{/if}
		</div>

		<!-- Actions -->
		<div class="flex gap-3 pt-3">
			<button
				type="submit"
				disabled={!accountId || !amountStr || isSubmitting}
				class="flex-1 bg-primary-500 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-primary-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary-500/25 focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none transition-all duration-150"
			>
				{isSubmitting ? 'Saving...' : 'Save Changes'}
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
