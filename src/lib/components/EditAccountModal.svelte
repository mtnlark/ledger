<script lang="ts">
	import { format } from 'date-fns';
	import { Trash2, X } from 'lucide-svelte';
	import type { SavingsAccount, SavingsAccountType } from '$lib/db';
	import { cleanNumberInput } from '$lib/utils/form-validation';
	import { updateSavingsAccount, deleteSavingsAccount } from '$lib/stores/savingsAccounts';
	import { toast } from '$lib/stores/toast';
	import ModalContainer from './ModalContainer.svelte';

	interface Props {
		isOpen: boolean;
		account: SavingsAccount | null;
		onSave: () => void;
		onDelete: () => void;
		onClose: () => void;
	}

	let { isOpen, account, onSave, onDelete, onClose }: Props = $props();

	// Form state
	let name = $state('');
	let icon = $state('');
	let color = $state('#5B8C5A');
	let currentBalanceStr = $state('');
	let targetAmountStr = $state('');
	let targetDateStr = $state('');
	let isSubmitting = $state(false);
	let showDeleteConfirm = $state(false);

	// Reset form when modal opens or account changes
	$effect(() => {
		if (isOpen && account) {
			name = account.name;
			icon = account.icon || '';
			color = account.color || '#5B8C5A';
			currentBalanceStr = account.currentBalance?.toString() || '';
			targetAmountStr = account.targetAmount?.toString() || '';
			targetDateStr = account.targetDate ? format(account.targetDate, 'yyyy-MM-dd') : '';
			isSubmitting = false;
			showDeleteConfirm = false;
		}
	});

	// Check if goal has any values
	let hasGoalValues = $derived(targetAmountStr.trim() !== '' || targetDateStr.trim() !== '');

	function handleBalanceInput(e: Event) {
		const input = e.target as HTMLInputElement;
		currentBalanceStr = cleanNumberInput(input.value);
	}

	function handleTargetAmountInput(e: Event) {
		const input = e.target as HTMLInputElement;
		targetAmountStr = cleanNumberInput(input.value);
	}

	function handleRemoveGoal() {
		targetAmountStr = '';
		targetDateStr = '';
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (isSubmitting || !account?.id || !name.trim()) return;

		isSubmitting = true;
		try {
			const currentBalance =
				account.accountType === 'savings'
					? parseFloat(cleanNumberInput(currentBalanceStr)) || 0
					: undefined;

			// Parse goal fields (empty string means clear the goal)
			const targetAmount = targetAmountStr.trim()
				? parseFloat(cleanNumberInput(targetAmountStr)) || undefined
				: undefined;
			const targetDate = targetDateStr.trim()
				? new Date(targetDateStr + 'T00:00:00')
				: undefined;

			await updateSavingsAccount(account.id, {
				name: name.trim(),
				icon: icon || undefined,
				color,
				currentBalance,
				targetAmount,
				targetDate
			});
			onSave();
		} catch (error) {
			console.error('Failed to update account:', error);
			toast.error('Failed to save changes. Please try again.');
			isSubmitting = false;
		}
	}

	async function handleDelete() {
		if (!account?.id || isSubmitting) return;

		isSubmitting = true;
		try {
			await deleteSavingsAccount(account.id);
			onDelete();
		} catch (error) {
			console.error('Failed to delete account:', error);
			toast.error('Failed to delete account');
			isSubmitting = false;
		}
	}

	// Icon suggestions by type
	const iconSuggestions: Record<SavingsAccountType, string[]> = {
		savings: ['💰', '☔', '🌱', '🏦', '💵', '🐷'],
		retirement: ['🌅', '🌳', '🏖️', '🎯', '📈', '⏳'],
		investment: ['🪴', '📊', '💹', '🚀', '💎', '🏛️']
	};

	// Color presets matching the design system
	const colorPresets = [
		'#5B8C5A', // success green
		'#D4915D', // warning amber
		'#C45D3A', // primary terracotta
		'#7B9E87', // sage
		'#8B7355', // earth brown
		'#6B8E6B', // forest
		'#9B8AA6', // purple
		'#5B8A8A' // teal
	];
</script>

<ModalContainer isOpen={isOpen && !!account} title="Edit Account" maxWidth="md" onClose={onClose}>
	{#if account}
			<!-- Form -->
			<form onsubmit={handleSubmit} class="p-6 space-y-4">
				<!-- Name -->
				<div>
					<label for="edit-account-name" class="block text-sm font-medium text-charcoal-soft mb-1.5">
						Account Name
					</label>
					<input
						type="text"
						id="edit-account-name"
						bind:value={name}
						placeholder="e.g., Emergency Fund"
						class="w-full px-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors placeholder:text-charcoal-muted"
					/>
				</div>

				<!-- Account Type (read-only display) -->
				<div>
					<span class="block text-sm font-medium text-charcoal-soft mb-1.5">Account Type</span>
					<p class="px-3 py-2.5 bg-surface-alt border border-theme rounded-lg text-charcoal-muted capitalize">
						{account.accountType}
						<span class="text-xs ml-2">(cannot be changed)</span>
					</p>
				</div>

				<!-- Icon -->
				<div>
					<label for="edit-account-icon" class="block text-sm font-medium text-charcoal-soft mb-1.5">
						Icon <span class="text-charcoal-muted font-normal">(optional)</span>
					</label>
					<div class="flex gap-2 items-center">
						<input
							type="text"
							id="edit-account-icon"
							bind:value={icon}
							placeholder="e.g., 💰"
							maxlength="2"
							class="w-16 px-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors text-center text-xl"
						/>
						<div class="flex gap-1 flex-wrap">
							{#each iconSuggestions[account.accountType] as emoji}
								<button
									type="button"
									onclick={() => (icon = emoji)}
									class="w-8 h-8 flex items-center justify-center text-lg hover:bg-surface-hover rounded transition-colors {icon ===
									emoji
										? 'bg-primary-50 ring-2 ring-primary-500'
										: ''}"
								>
									{emoji}
								</button>
							{/each}
						</div>
					</div>
				</div>

				<!-- Color -->
				<div>
					<label for="edit-account-color" class="block text-sm font-medium text-charcoal-soft mb-1.5">
						Color
					</label>
					<div class="flex gap-2 items-center">
						<input
							type="color"
							id="edit-account-color"
							bind:value={color}
							class="w-10 h-10 rounded-lg border border-theme cursor-pointer"
						/>
						<div class="flex gap-1 flex-wrap">
							{#each colorPresets as preset}
								<button
									type="button"
									onclick={() => (color = preset)}
									class="w-8 h-8 rounded-lg transition-all {color === preset
										? 'ring-2 ring-offset-2 ring-charcoal'
										: ''}"
									style="background-color: {preset}"
									title="Select color {preset}"
								></button>
							{/each}
						</div>
					</div>
				</div>

				<!-- Current Balance (savings only) -->
				{#if account.accountType === 'savings'}
					<div>
						<label
							for="edit-account-balance"
							class="block text-sm font-medium text-charcoal-soft mb-1.5"
						>
							Current Balance
						</label>
						<div class="relative">
							<span class="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-muted font-mono"
								>$</span
							>
							<input
								type="text"
								inputmode="decimal"
								id="edit-account-balance"
								value={currentBalanceStr}
								oninput={handleBalanceInput}
								placeholder="0.00"
								class="w-full pl-7 pr-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors font-mono placeholder:text-charcoal-muted"
							/>
						</div>
						<p class="mt-1.5 text-xs text-charcoal-muted">
							Update this to reflect your actual account balance
						</p>
					</div>
				{/if}

				<!-- Savings Goal Section (savings only) -->
				{#if account.accountType === 'savings'}
					<div class="border-t border-dashed border-theme-dashed pt-4">
						<div class="flex items-center justify-between mb-3">
							<p class="text-sm font-medium text-charcoal-soft">
								Savings Goal <span class="text-charcoal-muted font-normal">(optional)</span>
							</p>
							{#if hasGoalValues}
								<button
									type="button"
									onclick={handleRemoveGoal}
									class="text-xs text-danger-600 hover:text-danger-700 font-medium flex items-center gap-1"
								>
									<X size={12} />
									Remove Goal
								</button>
							{/if}
						</div>

						<div class="grid grid-cols-2 gap-4">
							<!-- Target Amount -->
							<div>
								<label
									for="edit-account-target"
									class="block text-sm text-charcoal-muted mb-1.5"
								>
									Target Amount
								</label>
								<div class="relative">
									<span class="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-muted font-mono"
										>$</span
									>
									<input
										type="text"
										inputmode="decimal"
										id="edit-account-target"
										value={targetAmountStr}
										oninput={handleTargetAmountInput}
										placeholder="10,000"
										class="w-full pl-7 pr-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors font-mono placeholder:text-charcoal-muted"
									/>
								</div>
							</div>

							<!-- Target Date -->
							<div>
								<label
									for="edit-account-target-date"
									class="block text-sm text-charcoal-muted mb-1.5"
								>
									Target Date
								</label>
								<input
									type="date"
									id="edit-account-target-date"
									bind:value={targetDateStr}
									class="w-full px-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
								/>
							</div>
						</div>

						<p class="mt-2 text-xs text-charcoal-muted">
							Set a goal to track your progress.
						</p>
					</div>
				{/if}

				<!-- Preview -->
				{#if name.trim()}
					<div class="bg-surface-alt rounded-lg p-4 border border-dashed border-theme-dashed">
						<p class="text-xs text-charcoal-muted mb-2">Preview</p>
						<div class="flex items-center gap-3">
							<div
								class="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
								style="background-color: {color}20"
							>
								{icon || '💰'}
							</div>
							<div>
								<p class="font-medium text-charcoal">{name}</p>
								<p class="text-xs text-charcoal-muted capitalize">{account.accountType}</p>
							</div>
						</div>
					</div>
				{/if}

				<!-- Delete Section -->
				<div class="border-t border-dashed border-theme-dashed pt-4">
					{#if showDeleteConfirm}
						<div class="bg-danger-50 border border-danger-200 rounded-lg p-3">
							<p class="text-sm text-danger-700 mb-3">
								Delete "{account.name}"? This will also delete all contributions to this account.
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
							Delete account
						</button>
					{/if}
				</div>

				<!-- Actions -->
				<div class="flex gap-3 pt-3">
					<button
						type="submit"
						disabled={!name.trim() || isSubmitting}
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
	{/if}
</ModalContainer>
