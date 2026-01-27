<script lang="ts">
	import { X, Trash2 } from 'lucide-svelte';
	import type { SavingsAccount, SavingsAccountType } from '$lib/db';
	import { focusTrap } from '$lib/utils/focus-trap';
	import { cleanNumberInput } from '$lib/utils/form-validation';
	import { updateSavingsAccount, deleteSavingsAccount } from '$lib/stores/savingsAccounts';
	import { toast } from '$lib/stores/toast';

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
	let isSubmitting = $state(false);
	let showDeleteConfirm = $state(false);

	// Reset form when modal opens or account changes
	$effect(() => {
		if (isOpen && account) {
			name = account.name;
			icon = account.icon || '';
			color = account.color || '#5B8C5A';
			currentBalanceStr = account.currentBalance?.toString() || '';
			isSubmitting = false;
			showDeleteConfirm = false;
		}
	});

	function handleBalanceInput(e: Event) {
		const input = e.target as HTMLInputElement;
		currentBalanceStr = cleanNumberInput(input.value);
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

			await updateSavingsAccount(account.id, {
				name: name.trim(),
				icon: icon || undefined,
				color,
				currentBalance
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

<svelte:window onkeydown={handleKeydown} />

{#if isOpen && account}
	<!-- Backdrop -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
		onclick={handleBackdropClick}
	>
		<!-- Modal -->
		<div
			class="bg-surface rounded-xl shadow-xl shadow-[var(--color-shadow)] max-w-md w-full max-h-[90vh] overflow-y-auto animate-enter"
			role="dialog"
			aria-modal="true"
			aria-labelledby="edit-account-title"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			use:focusTrap
		>
			<!-- Header -->
			<div
				class="px-6 py-4 border-b border-dashed border-theme-dashed flex items-center justify-between"
			>
				<h2 id="edit-account-title" class="font-display text-xl font-medium text-charcoal">
					Edit Account
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
		</div>
	</div>
{/if}
