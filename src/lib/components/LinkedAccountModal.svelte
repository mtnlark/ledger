<script lang="ts">
	import { Trash2 } from 'lucide-svelte';
	import ModalContainer from './ModalContainer.svelte';
	import type { AccountClass, LinkedAccount, LinkedAccountType } from '$lib/db';
	import { cleanNumberInput } from '$lib/utils/form-validation';
	import { accountClassForType } from '$lib/utils/net-worth';

	// One modal serves add (account === null) and edit; the fields are identical.
	interface Props {
		isOpen: boolean;
		/** null = add mode */
		account: LinkedAccount | null;
		onSave: (data: {
			name: string;
			institution: string;
			accountType: LinkedAccountType;
			accountClass: AccountClass;
			balance: number;
			isActive: boolean;
		}) => Promise<void> | void;
		onDelete?: () => void;
		onClose: () => void;
	}

	let { isOpen, account, onSave, onDelete, onClose }: Props = $props();

	const ASSET_TYPES: Array<{ value: LinkedAccountType; label: string }> = [
		{ value: 'checking', label: 'Checking' },
		{ value: 'savings', label: 'Savings' },
		{ value: 'investment', label: 'Investment' },
		{ value: 'retirement', label: 'Retirement' },
		{ value: 'other', label: 'Other' }
	];
	const LIABILITY_TYPES: Array<{ value: LinkedAccountType; label: string }> = [
		{ value: 'credit', label: 'Credit card' },
		{ value: 'loan', label: 'Loan' }
	];

	let name = $state('');
	let institution = $state('');
	let accountType = $state<LinkedAccountType>('checking');
	let balanceStr = $state('');
	let isActive = $state(true);
	let isSubmitting = $state(false);

	// Reset form whenever the modal opens
	$effect(() => {
		if (isOpen) {
			name = account?.name ?? '';
			institution = account?.institution ?? '';
			accountType = account?.accountType ?? 'checking';
			balanceStr = account ? String(account.currentBalance) : '';
			isActive = account?.isActive ?? true;
			isSubmitting = false;
		}
	});

	let balance = $derived(parseFloat(cleanNumberInput(balanceStr)) || 0);
	// Class follows the type — users never pick asset/liability directly
	let accountClass = $derived(accountClassForType(accountType));
	let isValid = $derived(name.trim().length > 0 && balanceStr.trim() !== '' && !isNaN(parseFloat(cleanNumberInput(balanceStr))));

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!isValid || isSubmitting) return;
		isSubmitting = true;
		try {
			await onSave({
				name: name.trim(),
				institution: institution.trim(),
				accountType,
				accountClass,
				balance,
				isActive
			});
		} finally {
			isSubmitting = false;
		}
	}
</script>

<ModalContainer {isOpen} title={account ? 'Edit Account' : 'Add Account'} maxWidth="md" {onClose}>
	<form onsubmit={handleSubmit} class="px-6 py-5 space-y-4">
		<div>
			<label for="la-name" class="block text-sm font-medium text-charcoal-soft mb-1.5">Account name</label>
			<input
				id="la-name"
				type="text"
				bind:value={name}
				placeholder="e.g., Chase Checking"
				class="w-full px-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
			/>
		</div>

		<div>
			<label for="la-institution" class="block text-sm font-medium text-charcoal-soft mb-1.5">
				Institution <span class="text-charcoal-muted font-normal">(optional)</span>
			</label>
			<input
				id="la-institution"
				type="text"
				bind:value={institution}
				placeholder="e.g., Chase"
				class="w-full px-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
			/>
		</div>

		<div class="grid grid-cols-2 gap-4">
			<div>
				<label for="la-type" class="block text-sm font-medium text-charcoal-soft mb-1.5">Type</label>
				<select
					id="la-type"
					bind:value={accountType}
					class="w-full px-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
				>
					<optgroup label="Assets">
						{#each ASSET_TYPES as opt (opt.value)}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</optgroup>
					<optgroup label="Liabilities">
						{#each LIABILITY_TYPES as opt (opt.value)}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</optgroup>
				</select>
			</div>
			<div>
				<label for="la-balance" class="block text-sm font-medium text-charcoal-soft mb-1.5">
					{accountClass === 'liability' ? 'Amount owed' : account ? 'Current balance' : 'Starting balance'}
				</label>
				<div class="relative">
					<span class="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-muted font-mono">$</span>
					<input
						id="la-balance"
						type="text"
						inputmode="decimal"
						bind:value={balanceStr}
						placeholder="0.00"
						class="w-full pl-7 pr-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors font-mono"
					/>
				</div>
			</div>
		</div>

		{#if account}
			<label class="flex items-center gap-2 cursor-pointer">
				<input type="checkbox" bind:checked={isActive} class="rounded" />
				<span class="text-sm text-charcoal-soft">Include in net worth</span>
				<span class="text-xs text-charcoal-muted">(uncheck to hide a closed account; history is kept)</span>
			</label>
		{/if}

		<div class="flex items-center gap-3 pt-3">
			{#if account && onDelete}
				<button
					type="button"
					onclick={onDelete}
					class="p-2 text-charcoal-muted hover:text-danger-500 hover:bg-danger-50 rounded-lg transition-colors"
					aria-label="Delete account"
					title="Delete account and its history"
				>
					<Trash2 size={16} />
				</button>
			{/if}
			<div class="flex-1"></div>
			<button
				type="button"
				onclick={onClose}
				class="px-4 py-2.5 border border-theme text-charcoal-soft rounded-lg font-medium hover:bg-surface-alt transition-colors"
			>
				Cancel
			</button>
			<button
				type="submit"
				disabled={!isValid || isSubmitting}
				class="px-4 py-2.5 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
			>
				{#if isSubmitting}
					<div class="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></div>
				{/if}
				{account ? 'Save' : 'Add Account'}
			</button>
		</div>
	</form>
</ModalContainer>
