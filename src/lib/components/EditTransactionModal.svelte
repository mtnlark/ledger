<script lang="ts">
	import { format } from 'date-fns';
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
		class="fixed inset-0 bg-black/50 z-40"
		onclick={handleClose}
		onkeydown={(e) => e.key === 'Escape' && handleClose()}
		role="button"
		tabindex="-1"
		aria-label="Close modal"
	></div>

	<!-- Modal -->
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<div
			class="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			aria-labelledby="edit-modal-title"
		>
			<form onsubmit={handleSubmit}>
				<!-- Header -->
				<div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
					<h2 id="edit-modal-title" class="text-lg font-semibold text-gray-900">Edit Transaction</h2>
					<button
						type="button"
						onclick={handleClose}
						class="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
						aria-label="Close"
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
							<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
						</svg>
					</button>
				</div>

				<!-- Body -->
				<div class="p-6 space-y-4">
					<!-- Date & Merchant Row -->
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<label for="edit-date" class="block text-sm font-medium text-gray-700 mb-1">Date</label>
							<input
								type="date"
								id="edit-date"
								bind:value={dateStr}
								class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
							/>
						</div>
						<div>
							<label for="edit-merchant" class="block text-sm font-medium text-gray-700 mb-1">Merchant</label>
							<input
								type="text"
								id="edit-merchant"
								bind:value={merchant}
								placeholder="e.g., Shell, Amazon, MOM's"
								class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
							/>
						</div>
					</div>

					<!-- Amount & Category Row -->
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<label for="edit-amount" class="block text-sm font-medium text-gray-700 mb-1">Amount</label>
							<div class="relative">
								<span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
								<input
									type="number"
									id="edit-amount"
									bind:value={amountStr}
									step="0.01"
									min="0"
									placeholder="0.00"
									class="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
								/>
							</div>
						</div>
						<div>
							<label for="edit-category" class="block text-sm font-medium text-gray-700 mb-1">Category</label>
							<CategoryCombobox
								{categories}
								value={categoryId}
								onSelect={(id) => (categoryId = id)}
							/>
						</div>
					</div>

					<!-- Shared Toggle -->
					<div class="border-t border-gray-100 pt-4">
						<label class="flex items-center gap-3 cursor-pointer">
							<input
								type="checkbox"
								bind:checked={isShared}
								class="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
							/>
							<span class="text-sm font-medium text-gray-700">
								Shared with {settings.partnerName}
							</span>
						</label>

						<!-- Split Options (shown when shared) -->
						{#if isShared}
							<div class="mt-4 ml-8 p-4 bg-blue-50 rounded-lg space-y-3">
								<!-- Split Type Toggle -->
								<div class="flex gap-2">
									<button
										type="button"
										onclick={() => (splitType = 'percentage')}
										class="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors {splitType ===
										'percentage'
											? 'bg-blue-600 text-white'
											: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}"
									>
										% Percentage
									</button>
									<button
										type="button"
										onclick={() => (splitType = 'fixed')}
										class="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors {splitType ===
										'fixed'
											? 'bg-blue-600 text-white'
											: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}"
									>
										$ Fixed Amount
									</button>
								</div>

								<!-- Split Value Input -->
								{#if splitType === 'percentage'}
									<div>
										<label for="edit-splitPercent" class="block text-sm text-gray-600 mb-1">
											{settings.partnerName}'s share: {Math.round(splitValue * 100)}%
										</label>
										<input
											type="range"
											id="edit-splitPercent"
											min="0"
											max="1"
											step="0.05"
											bind:value={splitValue}
											class="w-full"
										/>
									</div>
								{:else}
									<div>
										<label for="edit-splitFixed" class="block text-sm text-gray-600 mb-1">
											{settings.partnerName}'s exact share
										</label>
										<div class="relative">
											<span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
											<input
												type="number"
												id="edit-splitFixed"
												bind:value={splitValue}
												step="0.01"
												min="0"
												max={amount}
												class="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
											/>
										</div>
									</div>
								{/if}

								<!-- Split Summary -->
								{#if amount > 0}
									<div class="text-sm text-gray-600 pt-2 border-t border-blue-100">
										<div class="flex justify-between">
											<span>{settings.partnerName} pays:</span>
											<span class="font-medium">{formatCurrency(partnerShare)}</span>
										</div>
										<div class="flex justify-between">
											<span>You pay:</span>
											<span class="font-medium">{formatCurrency(yourShare)}</span>
										</div>
									</div>
								{/if}
							</div>
						{/if}
					</div>

					<!-- Notes (optional) -->
					<div>
						<label for="edit-notes" class="block text-sm font-medium text-gray-700 mb-1">
							Notes <span class="text-gray-400 font-normal">(optional)</span>
						</label>
						<input
							type="text"
							id="edit-notes"
							bind:value={notes}
							placeholder="Any additional notes..."
							class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						/>
					</div>
				</div>

				<!-- Footer -->
				<div class="flex gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
					<button
						type="submit"
						disabled={!merchant.trim() || amount <= 0 || !categoryId}
						class="flex-1 bg-blue-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
					>
						Save Changes
					</button>
					<button
						type="button"
						onclick={handleClose}
						class="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
					>
						Cancel
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
