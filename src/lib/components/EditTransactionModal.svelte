<script lang="ts">
	import { format } from 'date-fns';
	import { X, Scissors } from 'lucide-svelte';
	import type { Category, Settings, Transaction } from '$lib/db';
	import { parseLocalDate } from '$lib/utils/date-helpers';
	import { formatCurrency, calculateSplitShares } from '$lib/utils/format-helpers';
	import CategoryCombobox from './CategoryCombobox.svelte';

	interface Props {
		isOpen: boolean;
		transaction: Transaction | null;
		categories: Category[];
		settings: Settings;
		onSave: (id: number, data: TransactionUpdateData) => void;
		onSplit?: (transaction: Transaction) => void;
		onCancelSubscription?: (merchant: string) => void;
		onClose: () => void;
	}

	export interface TransactionUpdateData {
		date: Date;
		merchant: string;
		amount: number;
		categoryId: number;
		isShared: boolean;
		splitType: 'percentage' | 'fixed';
		splitValue: number;
		notes?: string;
		isEssential: boolean;
		isSubscription: boolean;
		subscriptionFrequency?: 'monthly' | 'annual';
	}

	let { isOpen, transaction, categories, settings, onSave, onSplit, onCancelSubscription, onClose }: Props = $props();

	// Confirmation state for subscription cancellation
	let showCancelConfirm = $state(false);
	let futureDateConfirmed = $state(false);

	// Can only split transactions that aren't already split children
	let canSplit = $derived(transaction && !transaction.parentTransactionId && onSplit);

	// Future date detection
	let isFutureDate = $derived.by(() => {
		if (!dateStr) return false;
		const selected = parseLocalDate(dateStr);
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		return selected > today;
	});

	// Form state - initialized from transaction when modal opens
	let dateStr = $state('');
	let merchant = $state('');
	let amountStr = $state('');
	let categoryId = $state(0);
	let isShared = $state(false);
	let splitType = $state<'percentage' | 'fixed'>('percentage');
	let splitValue = $state(0.5);
	let notes = $state('');
	let isEssential = $state(false);
	let isSubscription = $state(false);
	let subscriptionFrequency = $state<'monthly' | 'annual'>('monthly');

	// Get selected category for essential default display
	let selectedCategory = $derived(categories.find((c) => c.id === categoryId));

	// Reset form when transaction changes
	$effect(() => {
		if (transaction && isOpen) {
			const txDate = new Date(transaction.date);
			dateStr = format(txDate, 'yyyy-MM-dd');
			merchant = transaction.merchant;
			amountStr = transaction.amount.toString();
			categoryId = transaction.categoryId;
			isShared = transaction.isShared;
			splitType = transaction.splitType;
			splitValue = transaction.splitValue;
			notes = transaction.notes ?? '';
			isEssential = transaction.isEssential ?? false;
			isSubscription = transaction.isSubscription ?? false;
			subscriptionFrequency = transaction.subscriptionFrequency ?? 'monthly';
			showCancelConfirm = false;
			futureDateConfirmed = false;
		}
	});

	// Reset future date confirmation when date changes
	$effect(() => {
		dateStr;
		futureDateConfirmed = false;
	});

	// Computed values
	let amount = $derived(parseFloat(amountStr) || 0);

	// Validate and clamp split value based on type and amount
	let validatedSplitValue = $derived.by(() => {
		if (splitType === 'percentage') {
			return Math.min(1, Math.max(0, splitValue));
		} else {
			return Math.min(amount, Math.max(0, splitValue));
		}
	});

	// Check if current input is invalid (for showing warning)
	let splitValueInvalid = $derived.by(() => {
		if (!isShared) return false;
		if (splitType === 'percentage') {
			return splitValue < 0 || splitValue > 1;
		} else {
			return splitValue < 0 || splitValue > amount;
		}
	});

	let partnerShare = $derived(
		isShared ? (splitType === 'percentage' ? amount * validatedSplitValue : validatedSplitValue) : 0
	);
	let yourShare = $derived(amount - partnerShare);

	// Auto-correct invalid split values when switching types or when amount changes
	$effect(() => {
		if (isShared && splitType === 'fixed' && amount > 0 && splitValue > amount) {
			splitValue = amount;
		}
		if (isShared && splitType === 'percentage' && splitValue > 1) {
			splitValue = 1;
		}
	});

	function handleSubmit(e: Event) {
		e.preventDefault();

		if (!transaction?.id || !merchant.trim() || amount <= 0 || !categoryId) {
			return;
		}

		// Block if future date not confirmed
		if (isFutureDate && !futureDateConfirmed) {
			return;
		}

		onSave(transaction.id, {
			date: parseLocalDate(dateStr),
			merchant: merchant.trim(),
			amount,
			categoryId,
			isShared,
			splitType,
			splitValue: validatedSplitValue, // Use validated value
			notes: notes.trim() || undefined,
			isEssential,
			isSubscription,
			subscriptionFrequency: isSubscription ? subscriptionFrequency : undefined
		});
	}

	function handleClose() {
		onClose();
	}
</script>

{#if isOpen && transaction}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
		onclick={handleClose}
		onkeydown={(e) => e.key === 'Escape' && handleClose()}
		role="button"
		tabindex="-1"
		aria-label="Close modal"
	></div>

	<!-- Modal -->
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
		<div
			class="bg-surface rounded-xl shadow-xl shadow-[var(--color-shadow)] w-full max-w-lg max-h-[90vh] overflow-y-auto animate-enter pointer-events-auto"
			role="dialog"
			aria-modal="true"
			aria-labelledby="edit-modal-title"
			tabindex="-1"
		>
			<form onsubmit={handleSubmit}>
				<!-- Header -->
				<div class="flex items-center justify-between px-6 py-4 border-b border-dashed border-theme-dashed">
					<h2 id="edit-modal-title" class="font-display text-xl font-medium text-charcoal">Edit Transaction</h2>
					<button
						type="button"
						onclick={handleClose}
						class="p-2 text-charcoal-muted hover:text-charcoal hover:bg-surface-hover rounded-lg transition-colors"
						aria-label="Close"
					>
						<X size={20} />
					</button>
				</div>

				<!-- Body -->
				<div class="p-6 space-y-4">
					<!-- Date & Merchant Row -->
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<label for="edit-date" class="block text-sm font-medium text-charcoal-soft mb-1.5">Date</label>
							<input
								type="date"
								id="edit-date"
								bind:value={dateStr}
								class="w-full px-3 py-2.5 bg-surface-alt border rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors {isFutureDate && !futureDateConfirmed ? 'border-warning-500' : 'border-theme'}"
							/>
							{#if isFutureDate && !futureDateConfirmed}
								<div class="mt-2 p-2 bg-warning-50 border border-warning-200 rounded-lg">
									<p class="text-xs text-warning-700 mb-2">This date is in the future. Are you sure?</p>
									<button
										type="button"
										onclick={() => (futureDateConfirmed = true)}
										class="text-xs font-medium text-warning-700 hover:text-warning-800 underline"
									>
										Yes, use future date
									</button>
								</div>
							{/if}
						</div>
						<div>
							<label for="edit-merchant" class="block text-sm font-medium text-charcoal-soft mb-1.5">Merchant</label>
							<input
								type="text"
								id="edit-merchant"
								bind:value={merchant}
								placeholder="e.g., Shell, Amazon, MOM's"
								class="w-full px-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors placeholder:text-charcoal-muted"
							/>
						</div>
					</div>

					<!-- Amount & Category Row -->
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<label for="edit-amount" class="block text-sm font-medium text-charcoal-soft mb-1.5">Amount</label>
							<div class="relative">
								<span class="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-muted font-mono">$</span>
								<input
									type="number"
									id="edit-amount"
									bind:value={amountStr}
									step="0.01"
									min="0"
									placeholder="0.00"
									class="w-full pl-7 pr-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors font-mono placeholder:text-charcoal-muted"
								/>
							</div>
						</div>
						<div>
							<label for="edit-category" class="block text-sm font-medium text-charcoal-soft mb-1.5">Category</label>
							<CategoryCombobox
								{categories}
								value={categoryId}
								onSelect={(id) => (categoryId = id)}
							/>
						</div>
					</div>

					<!-- Shared Toggle -->
					<div class="border-t border-dashed border-theme-dashed pt-4">
						<label class="flex items-center gap-3 cursor-pointer">
							<input
								type="checkbox"
								bind:checked={isShared}
								class="w-5 h-5 text-success-500 border-[var(--color-border)] rounded focus:ring-success-500/20"
							/>
							<span class="text-sm font-medium text-charcoal-soft">
								Shared with {settings.partnerName}
							</span>
						</label>

						<!-- Split Options (shown when shared) -->
						{#if isShared}
							<div class="mt-4 ml-8 p-4 bg-success-50 border border-success-100 rounded-lg space-y-3">
								<!-- Split Type Toggle -->
								<div class="flex gap-2">
									<button
										type="button"
										onclick={() => (splitType = 'percentage')}
										class="px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-150 {splitType ===
										'percentage'
											? 'bg-success-500 text-white shadow-sm'
											: 'bg-surface text-charcoal-soft border border-theme hover:bg-surface-hover'}"
									>
										% Percentage
									</button>
									<button
										type="button"
										onclick={() => (splitType = 'fixed')}
										class="px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-150 {splitType ===
										'fixed'
											? 'bg-success-500 text-white shadow-sm'
											: 'bg-surface text-charcoal-soft border border-theme hover:bg-surface-hover'}"
									>
										$ Fixed Amount
									</button>
								</div>

								<!-- Split Value Input -->
								{#if splitType === 'percentage'}
									<div>
										<label for="edit-splitPercent" class="block text-sm text-charcoal-soft mb-1">
											{settings.partnerName}'s share: <span class="font-mono font-medium">{Math.round(splitValue * 100)}%</span>
										</label>
										<input
											type="range"
											id="edit-splitPercent"
											min="0"
											max="1"
											step="0.05"
											bind:value={splitValue}
											class="w-full accent-success-500"
										/>
									</div>
								{:else}
									<div>
										<label for="edit-splitFixed" class="block text-sm text-charcoal-soft mb-1">
											{settings.partnerName}'s exact share
											{#if amount > 0}
												<span class="text-charcoal-muted">(max {formatCurrency(amount)})</span>
											{/if}
										</label>
										<div class="relative">
											<span class="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-muted font-mono">$</span>
											<input
												type="number"
												id="edit-splitFixed"
												bind:value={splitValue}
												onblur={() => { if (splitValue > amount) splitValue = amount; if (splitValue < 0) splitValue = 0; }}
												step="0.01"
												min="0"
												max={amount}
												class="w-full pl-7 pr-3 py-2 bg-surface border rounded-lg focus:ring-2 transition-colors font-mono {splitValueInvalid ? 'border-warning-500 focus:ring-warning-500/20 focus:border-warning-500' : 'border-theme focus:ring-success-500/20 focus:border-success-500'}"
											/>
										</div>
										{#if splitValueInvalid}
											<p class="text-xs text-warning-600 mt-1">Value will be clamped to {formatCurrency(validatedSplitValue)}</p>
										{/if}
									</div>
								{/if}

								<!-- Split Summary -->
								{#if amount > 0}
									<div class="text-sm pt-2 border-t border-success-200">
										<div class="flex justify-between text-charcoal-soft">
											<span>{settings.partnerName} pays:</span>
											<span class="font-mono font-medium text-charcoal">{formatCurrency(partnerShare)}</span>
										</div>
										<div class="flex justify-between text-charcoal-soft">
											<span>You pay:</span>
											<span class="font-mono font-medium text-charcoal">{formatCurrency(yourShare)}</span>
										</div>
									</div>
								{/if}
							</div>
						{/if}
					</div>

					<!-- Notes (optional) -->
					<div>
						<label for="edit-notes" class="block text-sm font-medium text-charcoal-soft mb-1.5">
							Notes <span class="text-charcoal-muted font-normal">(optional)</span>
						</label>
						<input
							type="text"
							id="edit-notes"
							bind:value={notes}
							placeholder="Any additional notes..."
							class="w-full px-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors placeholder:text-charcoal-muted"
						/>
					</div>

					<!-- Essential Toggle -->
					<div class="border-t border-dashed border-theme-dashed pt-4">
						<label class="flex items-center justify-between cursor-pointer">
							<div>
								<span class="text-sm font-medium text-charcoal-soft">Essential spending</span>
								<p class="text-xs text-charcoal-muted mt-0.5">
									{#if selectedCategory}
										Category default: {selectedCategory.isEssential ? 'Need' : 'Want'}
									{:else}
										Mark as a "need" vs discretionary "want"
									{/if}
								</p>
							</div>
							<button
								type="button"
								onclick={() => (isEssential = !isEssential)}
								class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-2 {isEssential ? 'bg-primary-500' : 'bg-[var(--color-border-dashed)]'}"
								role="switch"
								aria-checked={isEssential}
								aria-label="Toggle essential spending"
							>
								<span
									class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {isEssential ? 'translate-x-5' : 'translate-x-0'}"
								></span>
							</button>
						</label>
					</div>

					<!-- Subscription Toggle -->
					<div class="border-t border-dashed border-theme-dashed pt-4">
						<label class="flex items-center justify-between cursor-pointer">
							<div>
								<span class="text-sm font-medium text-charcoal-soft">Subscription</span>
								<p class="text-xs text-charcoal-muted mt-0.5">Recurring payment (e.g., streaming, news)</p>
							</div>
							<button
								type="button"
								onclick={() => (isSubscription = !isSubscription)}
								class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-2 {isSubscription ? 'bg-primary-500' : 'bg-[var(--color-border-dashed)]'}"
								role="switch"
								aria-checked={isSubscription}
								aria-label="Toggle subscription"
							>
								<span
									class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {isSubscription ? 'translate-x-5' : 'translate-x-0'}"
								></span>
							</button>
						</label>

						<!-- Frequency selector (shown when subscription is enabled) -->
						{#if isSubscription}
							<div class="mt-3 flex gap-2">
								<button
									type="button"
									onclick={() => (subscriptionFrequency = 'monthly')}
									class="px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-150 {subscriptionFrequency === 'monthly'
										? 'bg-primary-500 text-white shadow-sm'
										: 'bg-surface-alt text-charcoal-soft border border-theme hover:bg-surface-hover'}"
								>
									Monthly
								</button>
								<button
									type="button"
									onclick={() => (subscriptionFrequency = 'annual')}
									class="px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-150 {subscriptionFrequency === 'annual'
										? 'bg-primary-500 text-white shadow-sm'
										: 'bg-surface-alt text-charcoal-soft border border-theme hover:bg-surface-hover'}"
								>
									Annual
								</button>
							</div>

							<!-- Cancel Subscription Option -->
							{#if onCancelSubscription}
								<div class="mt-3 pt-3 border-t border-dashed border-theme-dashed">
									{#if !showCancelConfirm}
										<button
											type="button"
											onclick={() => (showCancelConfirm = true)}
											class="text-sm text-danger-500 hover:text-danger-600 hover:underline transition-colors"
										>
											Cancel this subscription...
										</button>
									{:else}
										<div class="bg-danger-50 border border-danger-100 rounded-lg p-3">
											<p class="text-sm text-charcoal mb-3">
												Mark <span class="font-medium">{merchant}</span> as cancelled? It won't count toward your recurring total.
											</p>
											<div class="flex gap-2">
												<button
													type="button"
													onclick={() => {
														onCancelSubscription(merchant);
														onClose();
													}}
													class="px-3 py-1.5 text-sm font-medium bg-danger-500 text-white rounded-lg hover:bg-danger-600 transition-colors"
												>
													Yes, Cancel
												</button>
												<button
													type="button"
													onclick={() => (showCancelConfirm = false)}
													class="px-3 py-1.5 text-sm font-medium text-charcoal-soft border border-theme rounded-lg hover:bg-surface-hover transition-colors"
												>
													Never mind
												</button>
											</div>
										</div>
									{/if}
								</div>
							{/if}
						{/if}
					</div>

					<!-- Split by Category Button -->
					{#if canSplit}
						<div class="border-t border-dashed border-theme-dashed pt-4">
							<button
								type="button"
								onclick={() => transaction && onSplit?.(transaction)}
								class="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-charcoal-soft hover:text-charcoal border border-theme hover:bg-surface-hover rounded-lg transition-colors"
							>
								<Scissors size={16} />
								<span>Split by Category</span>
							</button>
							<p class="text-xs text-charcoal-muted mt-2 text-center">
								Split this transaction into multiple categories
							</p>
						</div>
					{/if}
				</div>

				<!-- Footer -->
				<div class="flex gap-3 px-6 py-4 border-t border-dashed border-theme-dashed bg-surface-alt rounded-b-xl">
					<button
						type="submit"
						disabled={!merchant.trim() || amount <= 0 || !categoryId || (isFutureDate && !futureDateConfirmed)}
						class="flex-1 bg-primary-500 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-primary-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary-500/25 focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none transition-all duration-150"
					>
						Save Changes
					</button>
					<button
						type="button"
						onclick={handleClose}
						class="px-4 py-2.5 border border-theme text-charcoal-soft rounded-lg font-medium hover:bg-surface-hover transition-colors"
					>
						Cancel
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
