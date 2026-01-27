<script lang="ts">
	import { X } from 'lucide-svelte';
	import type { SavingsAccountType } from '$lib/db';
	import { focusTrap } from '$lib/utils/focus-trap';
	import { addSavingsAccount, getAllSavingsAccounts } from '$lib/stores/savingsAccounts';

	interface Props {
		isOpen: boolean;
		onSave: () => void;
		onClose: () => void;
	}

	let { isOpen, onSave, onClose }: Props = $props();

	// Form state
	let name = $state('');
	let accountType = $state<SavingsAccountType>('savings');
	let icon = $state('');
	let color = $state('#5B8C5A');
	let initialBalanceStr = $state('');
	let isSubmitting = $state(false);

	// Reset form when modal opens
	$effect(() => {
		if (isOpen) {
			name = '';
			accountType = 'savings';
			icon = '';
			color = '#5B8C5A';
			initialBalanceStr = '';
			isSubmitting = false;
		}
	});

	// Clean number input
	function cleanNumberInput(value: string): string {
		return value.replace(/[^0-9.]/g, '');
	}

	function handleBalanceInput(e: Event) {
		const input = e.target as HTMLInputElement;
		initialBalanceStr = cleanNumberInput(input.value);
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (isSubmitting || !name.trim()) return;

		isSubmitting = true;
		try {
			// Get next sortOrder
			const existing = await getAllSavingsAccounts();
			const nextSortOrder = existing.length > 0 ? Math.max(...existing.map((a) => a.sortOrder)) + 1 : 1;

			const initialBalance =
				accountType === 'savings' ? parseFloat(cleanNumberInput(initialBalanceStr)) || 0 : undefined;

			await addSavingsAccount({
				name: name.trim(),
				accountType,
				icon: icon || undefined,
				color,
				sortOrder: nextSortOrder,
				currentBalance: initialBalance
			});
			onSave();
		} catch (error) {
			console.error('Failed to add account:', error);
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

	// Account type options
	const accountTypes: { value: SavingsAccountType; label: string; description: string }[] = [
		{ value: 'savings', label: 'Savings', description: 'Track balance (e.g., emergency fund, HYSA)' },
		{ value: 'retirement', label: 'Retirement', description: 'Track contributions only (e.g., 401k, IRA)' },
		{ value: 'investment', label: 'Investment', description: 'Track contributions only (e.g., brokerage)' }
	];
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
			class="bg-surface rounded-xl shadow-xl shadow-[var(--color-shadow)] max-w-md w-full max-h-[90vh] overflow-y-auto animate-enter"
			role="dialog"
			aria-modal="true"
			aria-labelledby="add-account-title"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			use:focusTrap
		>
			<!-- Header -->
			<div
				class="px-6 py-4 border-b border-dashed border-theme-dashed flex items-center justify-between"
			>
				<h2 id="add-account-title" class="font-display text-xl font-medium text-charcoal">
					Add Savings Account
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
					<label for="account-name" class="block text-sm font-medium text-charcoal-soft mb-1.5">
						Account Name
					</label>
					<input
						type="text"
						id="account-name"
						bind:value={name}
						placeholder="e.g., Emergency Fund"
						class="w-full px-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors placeholder:text-charcoal-muted"
					/>
				</div>

				<!-- Account Type -->
				<fieldset>
					<legend class="block text-sm font-medium text-charcoal-soft mb-1.5">Account Type</legend>
					<div class="space-y-2">
						{#each accountTypes as opt}
							<label
								class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors {accountType ===
								opt.value
									? 'border-primary-500 bg-primary-50'
									: 'border-theme hover:bg-surface-hover'}"
							>
								<input
									type="radio"
									name="accountType"
									value={opt.value}
									bind:group={accountType}
									class="mt-0.5"
								/>
								<div>
									<span class="font-medium text-charcoal">{opt.label}</span>
									<p class="text-xs text-charcoal-muted mt-0.5">{opt.description}</p>
								</div>
							</label>
						{/each}
					</div>
				</fieldset>

				<!-- Icon -->
				<div>
					<label for="account-icon" class="block text-sm font-medium text-charcoal-soft mb-1.5">
						Icon <span class="text-charcoal-muted font-normal">(optional)</span>
					</label>
					<div class="flex gap-2 items-center">
						<input
							type="text"
							id="account-icon"
							bind:value={icon}
							placeholder="e.g., 💰"
							maxlength="2"
							class="w-16 px-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors text-center text-xl"
						/>
						<div class="flex gap-1 flex-wrap">
							{#each iconSuggestions[accountType] as emoji}
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
					<label for="account-color" class="block text-sm font-medium text-charcoal-soft mb-1.5">
						Color
					</label>
					<div class="flex gap-2 items-center">
						<input
							type="color"
							id="account-color"
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

				<!-- Initial Balance (savings only) -->
				{#if accountType === 'savings'}
					<div>
						<label
							for="account-balance"
							class="block text-sm font-medium text-charcoal-soft mb-1.5"
						>
							Current Balance <span class="text-charcoal-muted font-normal">(optional)</span>
						</label>
						<div class="relative">
							<span class="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-muted font-mono"
								>$</span
							>
							<input
								type="text"
								inputmode="decimal"
								id="account-balance"
								value={initialBalanceStr}
								oninput={handleBalanceInput}
								placeholder="0.00"
								class="w-full pl-7 pr-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors font-mono placeholder:text-charcoal-muted"
							/>
						</div>
						<p class="mt-1.5 text-xs text-charcoal-muted">
							Starting balance for this account (can be updated later)
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
								<p class="text-xs text-charcoal-muted capitalize">{accountType}</p>
							</div>
						</div>
					</div>
				{/if}

				<!-- Actions -->
				<div class="flex gap-3 pt-3">
					<button
						type="submit"
						disabled={!name.trim() || isSubmitting}
						class="flex-1 bg-primary-500 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-primary-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary-500/25 focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none transition-all duration-150"
					>
						{isSubmitting ? 'Adding...' : 'Add Account'}
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
