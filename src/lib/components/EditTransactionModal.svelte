<script lang="ts">
	import { format } from 'date-fns';
	import { X } from 'lucide-svelte';
	import type { Category, Settings, Transaction } from '$lib/db';
	import CategoryCombobox from './CategoryCombobox.svelte';

	interface Props {
		isOpen: boolean;
		transaction: Transaction | null;
		categories: Category[];
		settings: Settings;
		onSave: (id: number, data: TransactionUpdateData) => void;
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
	}

	let { isOpen, transaction, categories, settings, onSave, onClose }: Props = $props();

	// Form state - initialized from transaction when modal opens
	let dateStr = $state('');
	let merchant = $state('');
	let amountStr = $state('');
	let categoryId = $state(0);
	let isShared = $state(false);
	let splitType = $state<'percentage' | 'fixed'>('percentage');
	let splitValue = $state(0.5);
	let notes = $state('');

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
		}
	});

	// Computed values
	let amount = $derived(parseFloat(amountStr) || 0);
	let partnerShare = $derived(
		isShared ? (splitType === 'percentage' ? amount * splitValue : splitValue) : 0
	);
	let yourShare = $derived(amount - partnerShare);

	// Parse date string to local date (avoids UTC timezone issues)
	function parseDateString(dateStr: string): Date {
		const [year, month, day] = dateStr.split('-').map(Number);
		return new Date(year, month - 1, day);
	}

	function handleSubmit(e: Event) {
		e.preventDefault();

		if (!transaction?.id || !merchant.trim() || amount <= 0 || !categoryId) {
			return;
		}

		onSave(transaction.id, {
			date: parseDateString(dateStr),
			merchant: merchant.trim(),
			amount,
			categoryId,
			isShared,
			splitType,
			splitValue,
			notes: notes.trim() || undefined
		});
	}

	function handleClose() {
		onClose();
	}

	function formatCurrency(value: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(value);
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
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<div
			class="bg-white rounded-xl shadow-xl shadow-gray-300/50 w-full max-w-lg max-h-[90vh] overflow-y-auto animate-enter"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			aria-labelledby="edit-modal-title"
		>
			<form onsubmit={handleSubmit}>
				<!-- Header -->
				<div class="flex items-center justify-between px-6 py-4 border-b border-dashed border-gray-200">
					<h2 id="edit-modal-title" class="font-display text-xl font-medium text-charcoal">Edit Transaction</h2>
					<button
						type="button"
						onclick={handleClose}
						class="p-2 text-charcoal-muted hover:text-charcoal hover:bg-cream rounded-lg transition-colors"
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
								class="w-full px-3 py-2.5 bg-cream border border-[rgba(45,42,38,0.15)] rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
							/>
						</div>
						<div>
							<label for="edit-merchant" class="block text-sm font-medium text-charcoal-soft mb-1.5">Merchant</label>
							<input
								type="text"
								id="edit-merchant"
								bind:value={merchant}
								placeholder="e.g., Shell, Amazon, MOM's"
								class="w-full px-3 py-2.5 bg-cream border border-[rgba(45,42,38,0.15)] rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors placeholder:text-charcoal-muted"
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
									class="w-full pl-7 pr-3 py-2.5 bg-cream border border-[rgba(45,42,38,0.15)] rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors font-mono placeholder:text-charcoal-muted"
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
					<div class="border-t border-dashed border-gray-200 pt-4">
						<label class="flex items-center gap-3 cursor-pointer">
							<input
								type="checkbox"
								bind:checked={isShared}
								class="w-5 h-5 text-success-500 border-gray-300 rounded focus:ring-success-500/20"
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
											: 'bg-white text-charcoal-soft border border-[rgba(45,42,38,0.15)] hover:bg-cream'}"
									>
										% Percentage
									</button>
									<button
										type="button"
										onclick={() => (splitType = 'fixed')}
										class="px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-150 {splitType ===
										'fixed'
											? 'bg-success-500 text-white shadow-sm'
											: 'bg-white text-charcoal-soft border border-[rgba(45,42,38,0.15)] hover:bg-cream'}"
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
										</label>
										<div class="relative">
											<span class="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-muted font-mono">$</span>
											<input
												type="number"
												id="edit-splitFixed"
												bind:value={splitValue}
												step="0.01"
												min="0"
												max={amount}
												class="w-full pl-7 pr-3 py-2 bg-white border border-[rgba(45,42,38,0.15)] rounded-lg focus:ring-2 focus:ring-success-500/20 focus:border-success-500 transition-colors font-mono"
											/>
										</div>
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
							class="w-full px-3 py-2.5 bg-cream border border-[rgba(45,42,38,0.15)] rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors placeholder:text-charcoal-muted"
						/>
					</div>
				</div>

				<!-- Footer -->
				<div class="flex gap-3 px-6 py-4 border-t border-dashed border-gray-200 bg-cream-dark rounded-b-xl">
					<button
						type="submit"
						disabled={!merchant.trim() || amount <= 0 || !categoryId}
						class="flex-1 bg-primary-500 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-primary-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary-500/25 focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none transition-all duration-150"
					>
						Save Changes
					</button>
					<button
						type="button"
						onclick={handleClose}
						class="px-4 py-2.5 border border-[rgba(45,42,38,0.15)] text-charcoal-soft rounded-lg font-medium hover:bg-cream transition-colors"
					>
						Cancel
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
