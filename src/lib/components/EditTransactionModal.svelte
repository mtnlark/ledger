<script lang="ts">
	import { format } from 'date-fns';
	import { Scissors } from 'lucide-svelte';
	import type { Category, Settings, Transaction } from '$lib/db';
	import { parseLocalDate } from '$lib/utils/date-helpers';
	import { validateTransactionForm } from '$lib/utils/transaction-validation';
	import ModalContainer from './ModalContainer.svelte';
	import CategoryCombobox from './CategoryCombobox.svelte';
	import SharedExpenseFields from './SharedExpenseFields.svelte';
	import EssentialToggle from './EssentialToggle.svelte';
	import SubscriptionFields from './SubscriptionFields.svelte';
	import TagAutocomplete from './TagAutocomplete.svelte';
	import { getPurchaseRows, templateFromTransactions, saveTemplate } from '$lib/stores/planning';
	import { getScheduleOccurrences } from '$lib/planning/forecast';
	import { getMonthKey } from '$lib/db';
	import { addRefund } from '$lib/stores/transactions';
	import { formatDateForInput } from '$lib/utils/date-helpers';
	import { formatCurrency } from '$lib/utils/format-helpers';

	interface Props {
		isOpen: boolean;
		transaction: Transaction | null;
		categories: Category[];
		settings: Settings;
		onSave: (id: number, data: TransactionUpdateData) => void;
		onSplit?: (transaction: Transaction) => void;
		onCancelSubscription?: (merchant: string, amount?: number) => void;
		onClose: () => void;
		onEventSaved?: () => Promise<void>;
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
		isExpectedOneOff?: boolean;
		scheduleId?: string;
		scheduleDate?: string;
		isEssential: boolean;
		isSubscription: boolean;
		subscriptionFrequency?: 'monthly' | 'semi-annual' | 'annual';
	}

	let { isOpen, transaction, categories, settings, onSave, onSplit, onCancelSubscription, onClose, onEventSaved }: Props = $props();

	// Confirmation state for subscription cancellation
	let futureDateConfirmed = $state(false);
	let isSubmitting = $state(false);

	// Can only split transactions that aren't already split children
	let canSplit = $derived(transaction && !transaction.parentTransactionId && !transaction.refundOfTransactionId && onSplit);

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
	let subscriptionFrequency = $state<'monthly' | 'semi-annual' | 'annual'>('monthly');
	let oneOff = $state(false);
	let scheduleLink = $state('');
	let templateName = $state('');
	let templateMessage = $state('');
	let refundAmount = $state(0);
	let refundDate = $state(formatDateForInput(new Date()));
	let refundError = $state('');
	async function recordRefund() {
		if (!transaction?.id || isSubmitting) return;
		isSubmitting = true; refundError = '';
		try { await addRefund(transaction.id, refundAmount, parseLocalDate(refundDate)); await onEventSaved?.(); onClose(); } catch (e) { refundError = String(e); } finally { isSubmitting = false; }
	}
	let occurrences = $derived(getScheduleOccurrences(settings.planning?.schedules ?? [], dateStr.slice(0, 7) || getMonthKey(new Date())));
	async function captureTemplate() {
		if (!transaction || !templateName.trim()) return;
		try { await saveTemplate(templateFromTransactions(await getPurchaseRows(transaction), templateName.trim())); templateMessage = 'Template saved'; } catch (e) { templateMessage = String(e); }
	}

	// Get selected category for essential default display
	let selectedCategory = $derived(categories.find((c) => c.id === categoryId));

	// Validation state
	let touched = $state(new Set<string>());
	let errors = $state<Record<string, string>>({});

	function handleBlur(field: string) {
		touched = new Set([...touched, field]);
		const result = validateTransactionForm({
			date: dateStr,
			merchant,
			amount,
			categoryId,
			isSplitMode: false,
			isFutureDate,
			futureDateConfirmed
		});
		if (result.errors[field]) {
			errors = { ...errors, [field]: result.errors[field] };
		} else {
			const { [field]: _, ...rest } = errors;
			errors = rest;
		}
	}

	function validateAllFields(): boolean {
		touched = new Set(['merchant', 'amount', 'category', 'date']);
		const result = validateTransactionForm({
			date: dateStr,
			merchant,
			amount,
			categoryId,
			isSplitMode: false,
			isFutureDate,
			futureDateConfirmed
		});
		errors = result.errors;
		return result.isValid;
	}

	// Reset form when transaction changes
	$effect(() => {
		if (transaction && isOpen) {
			const txDate = new Date(transaction.date);
			dateStr = format(txDate, 'yyyy-MM-dd');
			merchant = transaction.merchant;
			amountStr = Math.abs(transaction.amount).toString();
			categoryId = transaction.categoryId;
			isShared = transaction.isShared;
			splitType = transaction.splitType;
			splitValue = transaction.splitValue;
			notes = transaction.notes ?? '';
			isEssential = transaction.isEssential ?? false;
			isSubscription = transaction.isSubscription ?? false;
			oneOff = transaction.isExpectedOneOff ?? false;
			scheduleLink = transaction.scheduleId ? `${transaction.scheduleId}|${transaction.scheduleDate}` : '';
			templateName = transaction.merchant; templateMessage = '';
			refundAmount = 0; refundDate = formatDateForInput(new Date()); refundError = '';
			subscriptionFrequency = transaction.subscriptionFrequency ?? 'monthly';
			futureDateConfirmed = false;
			isSubmitting = false;
			touched = new Set();
			errors = {};
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

	// Auto-correct invalid split values when switching types or when amount changes
	$effect(() => {
		if (isShared && splitType === 'fixed' && amount > 0 && splitValue > amount) {
			splitValue = amount;
		}
		if (isShared && splitType === 'percentage' && splitValue > 1) {
			splitValue = 1;
		}
	});

	async function handleSubmit(e: Event) {
		e.preventDefault();

		if (!transaction?.id || !validateAllFields() || isSubmitting) {
			return;
		}

		// Block if future date not confirmed
		if (isFutureDate && !futureDateConfirmed) {
			return;
		}

		isSubmitting = true;
		try {
			await onSave(transaction.id, {
				date: parseLocalDate(dateStr),
				merchant: merchant.trim(),
				amount: transaction.refundOfTransactionId ? -amount : amount,
				categoryId,
				isShared,
				splitType,
				splitValue: validatedSplitValue, // Use validated value
				notes: notes.trim() || undefined,
				isExpectedOneOff: oneOff,
				scheduleId: scheduleLink.split('|')[0] || undefined,
				scheduleDate: scheduleLink.split('|')[1] || undefined,
				isEssential,
				isSubscription,
				subscriptionFrequency: isSubscription ? subscriptionFrequency : undefined
			});
		} finally {
			isSubmitting = false;
		}
	}

	function handleClose() {
		onClose();
	}
</script>

<ModalContainer isOpen={isOpen && !!transaction} title="Edit Transaction" maxWidth="lg" onClose={handleClose}>
	{#if transaction}
			<form onsubmit={handleSubmit}>
				<!-- Body -->
				<div class="p-6 space-y-4">
					{#if !transaction.refundOfTransactionId}
						<details class="text-sm"><summary class="cursor-pointer text-primary-600">Record a partial or full refund</summary><div class="grid grid-cols-2 gap-3 mt-2"><label>Refund date<input type="date" max={formatDateForInput(new Date())} min={formatDateForInput(transaction.date)} bind:value={refundDate} class="block w-full p-2 border border-theme rounded-lg bg-surface-alt" /></label><label>Full refund amount<input type="number" min="0.01" max={transaction.amount} step="0.01" bind:value={refundAmount} class="block w-full p-2 border border-theme rounded-lg bg-surface-alt" /></label></div><p class="text-xs text-charcoal-muted mt-2">Save a {refundAmount > 0 ? formatCurrency(refundAmount) : ''} refund linked to this purchase{transaction.parentTransactionId ? ' allocation' : ''}. The original purchase stays recorded.</p><button type="button" disabled={isSubmitting || refundAmount <= 0} class="text-primary-600 mt-2" onclick={recordRefund}>Confirm refund</button>{#if refundError}<p role="alert" class="text-danger-600">{refundError}</p>{/if}</details>
						<label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={oneOff} /> Expected one-off (kept in spending, excluded from ordinary baseline)</label>
						{#if occurrences.length}<label class="block text-sm">Matched commitment<select bind:value={scheduleLink} class="block w-full p-2 border border-theme rounded-lg bg-surface-alt"><option value="">Automatic matching</option>{#each occurrences as c (`${c.schedule.id}-${c.date}`)}<option value={`${c.schedule.id}|${c.date}`}>{c.schedule.merchant} · {c.date}</option>{/each}</select></label>{/if}
						<details class="text-sm"><summary class="cursor-pointer text-primary-600">Save recorded purchase as template</summary><label class="block mt-2">Template name<input bind:value={templateName} class="block w-full p-2 border border-theme rounded-lg bg-surface-alt" /></label><button type="button" class="text-primary-600 mt-2" onclick={captureTemplate}>Save template</button>{#if templateMessage}<p role="status">{templateMessage}</p>{/if}</details>
					{:else}<p class="text-sm text-charcoal-muted">Refund linked to purchase #{transaction.refundOfTransactionId}. Amount and sharing are fixed financial events.</p>{/if}
					<!-- Date & Merchant Row -->
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<label for="edit-date" class="block text-sm font-medium text-charcoal-soft mb-1.5">Date</label>
							<input
								type="date"
								required
								id="edit-date"
								bind:value={dateStr}
								class="w-full px-3 py-2.5 bg-surface-alt border rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors {isFutureDate && !futureDateConfirmed ? 'border-warning-500' : 'border-theme'}"
							/>
							{#if errors.date}<p role="alert">{errors.date}</p>{/if}
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
								onblur={() => handleBlur('merchant')}
								placeholder="e.g., Shell, Amazon, MOM's"
								class="w-full px-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors placeholder:text-charcoal-muted"
							/>
							{#if touched.has('merchant') && errors.merchant}
								<p class="text-xs text-danger-500 mt-1">{errors.merchant}</p>
							{/if}
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
									readonly={!!transaction.refundOfTransactionId}
									bind:value={amountStr}
									onblur={() => handleBlur('amount')}
									step="0.01"
									min="0"
									placeholder="0.00"
									class="w-full pl-7 pr-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors font-mono placeholder:text-charcoal-muted"
								/>
							</div>
							{#if touched.has('amount') && errors.amount}
								<p class="text-xs text-danger-500 mt-1">{errors.amount}</p>
							{/if}
						</div>
						<div>
							<label for="edit-category" class="block text-sm font-medium text-charcoal-soft mb-1.5">Category</label>
							<CategoryCombobox
								{categories}
								value={categoryId}
								onSelect={(id) => { categoryId = id; handleBlur('category'); }}
							/>
							{#if touched.has('category') && errors.category}
								<p class="text-xs text-danger-500 mt-1">{errors.category}</p>
							{/if}
						</div>
					</div>

					<SharedExpenseFields
						bind:isShared
						bind:splitType
						bind:splitValue
						{amount}
						partnerName={settings.partnerName}
						idPrefix="edit-"
					/>

					<!-- Notes (optional) -->
					<div>
						<label for="edit-notes" class="block text-sm font-medium text-charcoal-soft mb-1.5">
							Notes <span class="text-charcoal-muted font-normal">(optional)</span>
						</label>
						<TagAutocomplete
							id="edit-notes"
							value={notes}
							onInput={(v) => notes = v}
							placeholder="Add notes... use #tags for filtering"
						/>
						<p class="text-xs text-charcoal-muted mt-1">Use #tags to group transactions (letters, numbers, hyphens)</p>
					</div>

					<EssentialToggle bind:isEssential {selectedCategory} />

					<SubscriptionFields
						bind:isSubscription
						bind:subscriptionFrequency
						{merchant}
						{amount}
						{onCancelSubscription}
						onClose={handleClose}
					/>

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
						disabled={isSubmitting || !merchant.trim() || amount <= 0 || !categoryId || (isFutureDate && !futureDateConfirmed)}
						class="flex-1 bg-primary-500 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-primary-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary-500/25 focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none transition-all duration-150 flex items-center justify-center gap-2"
					>
						{#if isSubmitting}
							<div class="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></div>
						{/if}
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
	{/if}
</ModalContainer>
