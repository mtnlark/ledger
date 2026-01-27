<script lang="ts">
	import { format } from 'date-fns';
	import { X, Trash2 } from 'lucide-svelte';
	import type { SavingsAccount, SavingsContribution } from '$lib/db';
	import { parseLocalDate, formatDateForInput } from '$lib/utils/date-helpers';
	import { focusTrap } from '$lib/utils/focus-trap';
	import { updateContribution, deleteContribution } from '$lib/stores/savingsContributions';

	interface Props {
		isOpen: boolean;
		contribution: SavingsContribution | null;
		accounts: SavingsAccount[];
		onSave: () => void;
		onDelete: () => void;
		onClose: () => void;
	}

	let { isOpen, contribution, accounts, onSave, onDelete, onClose }: Props = $props();

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

	// Clean number input
	function cleanNumberInput(value: string): string {
		return value.replace(/[^0-9.]/g, '');
	}

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
			isSubmitting = false;
		}
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

	// Source options with labels
	const sourceOptions = [
		{ value: 'bank_transfer', label: 'Bank Transfer', description: 'From checking account' },
		{ value: 'payroll_deduction', label: 'Payroll Deduction', description: 'Pre-tax (401k, etc.)' },
		{ value: 'interest', label: 'Interest', description: 'Interest earned' },
		{ value: 'employer_match', label: 'Employer Match', description: '401k match, etc.' },
		{ value: 'other', label: 'Other', description: 'Other source' }
	] as const;
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen && contribution}
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
			aria-labelledby="edit-contribution-title"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			use:focusTrap
		>
			<!-- Header -->
			<div
				class="px-6 py-4 border-b border-dashed border-theme-dashed flex items-center justify-between"
			>
				<h2 id="edit-contribution-title" class="font-display text-xl font-medium text-charcoal">
					Edit Contribution
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
		</div>
	</div>
{/if}
