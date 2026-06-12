<script lang="ts">
	import { RefreshCw, Calendar, Zap, AlertCircle, Pencil } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import type { Category, Transaction, CancelledSubscription } from '$lib/db';
	import { createCategoryHelpers } from '$lib/utils/category-helpers';
	import { formatCurrencyWhole, formatCurrency } from '$lib/utils/format-helpers';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import EditDetectedBillModal from '$lib/components/EditDetectedBillModal.svelte';
	import type { DetectedRecurring } from '$lib/stores/recurring';
	import {
		dismissRecurring,
		cancelSubscription,
		confirmSubscriptionActive,
		setFixedRecurringAmount,
		removeFixedRecurringAmount
	} from '$lib/stores/settings';
	import { normalizeMerchant, subscriptionKey, findSupersededSubscriptionKeys } from '$lib/utils/string-helpers';
	import { currencyEquals } from '$lib/utils/currency';
	import { config } from '$lib/config';

	interface Props {
		recurring: DetectedRecurring[];
		categories: Category[];
		allTransactions: Transaction[];
		cancelledSubscriptions: CancelledSubscription[];
		confirmedActiveSubscriptions: string[];
		fixedRecurringAmounts?: Map<string, number>;
		onDismiss?: () => void;
		onSubscriptionChange?: () => void;
	}

	let {
		recurring,
		categories,
		allTransactions,
		cancelledSubscriptions,
		confirmedActiveSubscriptions,
		fixedRecurringAmounts = new Map(),
		onDismiss,
		onSubscriptionChange
	}: Props = $props();

	// Helper to get display amount (fixed override or auto-detected)
	function getDisplayAmount(merchant: string, detectedAmount: number): number {
		const normalized = normalizeMerchant(merchant);
		return fixedRecurringAmounts.get(normalized) ?? detectedAmount;
	}

	// Check if amount has a user override
	function hasFixedAmount(merchant: string): boolean {
		const normalized = normalizeMerchant(merchant);
		return fixedRecurringAmounts.has(normalized);
	}


	// Create category helpers bound to current categories
	let categoryHelpers = $derived(createCategoryHelpers(categories));
	let getCategoryIcon = $derived(categoryHelpers.getIcon);
	let getCategoryName = $derived(categoryHelpers.getName);

	// Confirm dialog state for dismissing recurring bills
	let confirmDialog = $state({
		isOpen: false,
		merchantName: '',
		onConfirm: () => {}
	});

	function showDismissConfirmDialog(merchant: string) {
		confirmDialog = {
			isOpen: true,
			merchantName: merchant,
			onConfirm: async () => {
				await dismissRecurring(merchant);
				onDismiss?.();
			}
		};
	}

	function closeConfirmDialog() {
		confirmDialog = { ...confirmDialog, isOpen: false };
	}

	function handleConfirm() {
		confirmDialog.onConfirm();
		closeConfirmDialog();
	}

	// Edit modal state for detected bills
	let editModal = $state({
		isOpen: false,
		merchant: '',
		amount: 0,
		isVariable: false
	});

	function openEditModal(item: DetectedRecurring) {
		editModal = {
			isOpen: true,
			merchant: item.merchant,
			amount: item.averageUserAmount,
			isVariable: item.amountType === 'variable'
		};
	}

	function closeEditModal() {
		editModal = { ...editModal, isOpen: false };
	}

	async function handleEditSave(action: 'keep' | 'fixed' | 'remove', fixedAmount?: number) {
		if (action === 'remove') {
			await dismissRecurring(editModal.merchant);
			onDismiss?.();
		} else if (action === 'fixed' && fixedAmount !== undefined) {
			await setFixedRecurringAmount(editModal.merchant, fixedAmount);
			onDismiss?.(); // Trigger refresh to show updated amount
		} else if (action === 'keep') {
			// Remove any fixed override, revert to auto-detected
			await removeFixedRecurringAmount(editModal.merchant);
			onDismiss?.();
		}
	}

	// Check if a subscription is stale based on last transaction date
	function isStale(lastDate: Date, frequency: 'monthly' | 'semi-annual' | 'annual' | undefined): boolean {
		const now = new Date();
		const daysSince = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

		if (frequency === 'annual') {
			const monthsSince = daysSince / 30;
			return monthsSince > config.subscription.annualStaleMonths;
		} else if (frequency === 'semi-annual') {
			const monthsSince = daysSince / 30;
			return monthsSince > config.subscription.semiAnnualStaleMonths;
		} else {
			return daysSince > config.subscription.monthlyStaleDays;
		}
	}

	// Get unique subscriptions from transactions (most recent for each merchant+amount)
	let allSubscriptions = $derived.by(() => {
		const subTransactions = allTransactions.filter(
			(t: Transaction) => t.isSubscription && !t.isDeleted
		);

		// Group by composite key (merchant|amount) so multiple subscriptions
		// from the same merchant with different amounts appear separately
		const bySubscription = new Map<string, Transaction>();
		for (const tx of subTransactions) {
			const key = subscriptionKey(tx.merchant, tx.amount);
			const existing = bySubscription.get(key);
			if (!existing || new Date(tx.date) > new Date(existing.date)) {
				bySubscription.set(key, tx);
			}
		}

		// Filter out superseded entries (price changes, plan upgrades)
		// Keeps concurrent subscriptions (e.g., Apple iCloud + Apple Music)
		const entries = Array.from(bySubscription.entries()).map(([key, tx]) => ({
			key,
			merchant: tx.merchant,
			amount: tx.amount,
			latestDate: new Date(tx.date)
		}));
		const superseded = findSupersededSubscriptionKeys(entries, subTransactions);
		for (const key of superseded) {
			bySubscription.delete(key);
		}

		return Array.from(bySubscription.values());
	});

	// Check if a subscription is cancelled (with resubscription detection via charge date)
	// Supports both legacy (merchant-wide) and targeted (merchant+amount) cancellations.
	// Only a charge date AFTER the cancellation is treated as a resubscription —
	// createdAt is not used since users may record old charges after cancelling
	function isCancelled(merchant: string, lastChargeDate?: Date, amount?: number): boolean {
		const normalized = normalizeMerchant(merchant);
		// Find matching cancellation record (targeted or legacy)
		const matchingRecord = cancelledSubscriptions.find((c: CancelledSubscription) => {
			if (c.merchant !== normalized) return false;
			// Legacy record (no amount) matches all subscriptions from this merchant
			if (c.amount == null) return true;
			// Targeted record: match if amounts are equal (within tolerance)
			if (amount != null) return currencyEquals(c.amount, amount);
			// Targeted record but no amount to check against: match
			return true;
		});
		if (!matchingRecord) return false;
		const cancelledDate = new Date(matchingRecord.cancelledDate);
		if (lastChargeDate && !isNaN(lastChargeDate.getTime()) && lastChargeDate > cancelledDate) {
			return false;
		}
		return true;
	}

	// Normalize confirmed active merchant names for lookup
	let confirmedActiveSet = $derived(
		new Set(confirmedActiveSubscriptions)
	);

	// Classify subscriptions
	let activeSubscriptions = $derived.by(() => {
		return allSubscriptions
			.filter((sub) => {
				const normalized = normalizeMerchant(sub.merchant);
				const subDate = new Date(sub.date);
				if (isCancelled(sub.merchant, subDate, sub.amount)) return false;
				const stale = isStale(subDate, sub.subscriptionFrequency);
				return confirmedActiveSet.has(normalized) || !stale;
			})
			.sort((a, b) => {
				const freqOrder = { monthly: 0, 'semi-annual': 1, annual: 2 } as const;
				const aOrder = freqOrder[a.subscriptionFrequency ?? 'monthly'] ?? 0;
				const bOrder = freqOrder[b.subscriptionFrequency ?? 'monthly'] ?? 0;
				if (aOrder !== bOrder) return aOrder - bOrder;
				return b.amount - a.amount;
			});
	});

	let possiblyInactiveSubscriptions = $derived.by(() => {
		return allSubscriptions
			.filter((sub) => {
				const normalized = normalizeMerchant(sub.merchant);
				const subDate = new Date(sub.date);
				if (isCancelled(sub.merchant, subDate, sub.amount)) return false;
				if (confirmedActiveSet.has(normalized)) return false;
				return isStale(subDate, sub.subscriptionFrequency);
			})
			.sort((a, b) => b.amount - a.amount);
	});

	// Separate monthly, semi-annual, and annual for active subscriptions
	let monthlySubscriptions = $derived(
		activeSubscriptions.filter((s) => !s.subscriptionFrequency || s.subscriptionFrequency === 'monthly')
	);
	let semiAnnualSubscriptions = $derived(
		activeSubscriptions.filter((s) => s.subscriptionFrequency === 'semi-annual')
	);
	let annualSubscriptions = $derived(
		activeSubscriptions.filter((s) => s.subscriptionFrequency === 'annual')
	);

	// Upcoming annual renewals (last charged 10-13 months ago)
	let upcomingRenewals = $derived.by(() => {
		const now = new Date();
		return annualSubscriptions
			.filter((sub) => {
				const lastCharge = new Date(sub.date);
				const monthsSince = (now.getFullYear() - lastCharge.getFullYear()) * 12
					+ (now.getMonth() - lastCharge.getMonth());
				return monthsSince >= 10 && monthsSince <= 13;
			})
			.map((sub) => {
				const lastCharge = new Date(sub.date);
				const expectedRenewal = new Date(lastCharge);
				expectedRenewal.setFullYear(expectedRenewal.getFullYear() + 1);
				const userAmount = sub.isShared ? sub.amount - sub.partnerShare : sub.amount;
				return {
					merchant: sub.merchant,
					lastCharge,
					expectedRenewal,
					amount: userAmount,
					categoryId: sub.categoryId
				};
			})
			.sort((a, b) => a.expectedRenewal.getTime() - b.expectedRenewal.getTime());
	});

	// Calculate subscription totals (user's portion only, all non-cancelled subscriptions)
	let allNonCancelledSubs = $derived(
		allSubscriptions.filter((sub) => !isCancelled(sub.merchant, new Date(sub.date), sub.amount))
	);

	let monthlySubCost = $derived(
		allNonCancelledSubs
			.filter((s) => !s.subscriptionFrequency || s.subscriptionFrequency === 'monthly')
			.reduce((sum, t) => {
				const userAmount = t.isShared ? t.amount - t.partnerShare : t.amount;
				return sum + userAmount;
			}, 0)
	);

	let semiAnnualSubCost = $derived(
		allNonCancelledSubs
			.filter((s) => s.subscriptionFrequency === 'semi-annual')
			.reduce((sum, t) => {
				const userAmount = t.isShared ? t.amount - t.partnerShare : t.amount;
				return sum + userAmount;
			}, 0)
	);

	let annualSubCost = $derived(
		allNonCancelledSubs
			.filter((s) => s.subscriptionFrequency === 'annual')
			.reduce((sum, t) => {
				const userAmount = t.isShared ? t.amount - t.partnerShare : t.amount;
				return sum + userAmount;
			}, 0)
	);

	// Monthly equivalent of all non-cancelled subscriptions
	let totalSubMonthly = $derived(monthlySubCost + semiAnnualSubCost / 6 + annualSubCost / 12);

	// Merchants already shown in the Subscriptions section (avoid dual-listing)
	let subscriptionMerchants = $derived(
		new Set(allSubscriptions.map((s) => normalizeMerchant(s.merchant)))
	);

	// Filter detected recurring to exclude cancelled and already-listed subscription merchants
	let activeRecurring = $derived(
		recurring.filter((r: DetectedRecurring) => {
			const normalized = normalizeMerchant(r.merchant);
			// Merchant-wide cancellation check (no amount) for detected recurring
			if (isCancelled(r.merchant)) return false;
			return !subscriptionMerchants.has(normalized);
		})
	);

	// Calculate detected recurring totals (user's portion only, converted to monthly)
	let totalDetectedMonthly = $derived(
		activeRecurring.reduce((sum: number, r: DetectedRecurring) => {
			// Convert to monthly equivalent based on frequency
			if (r.frequency === 'semi-annual') {
				return sum + r.averageUserAmount / 6;
			} else if (r.frequency === 'annual') {
				return sum + r.averageUserAmount / 12;
			}
			return sum + r.averageUserAmount;
		}, 0)
	);

	// Grand total monthly (all non-cancelled subscriptions + detected bills)
	let totalMonthlyRecurring = $derived(totalSubMonthly + totalDetectedMonthly);

	// Has any data?
	let hasData = $derived(
		allSubscriptions.length > 0 || activeRecurring.length > 0
	);

	// Action handlers - handleDismiss now shows confirmation dialog
	function handleDismiss(merchant: string) {
		showDismissConfirmDialog(merchant);
	}

	async function handleCancelSubscription(merchant: string, amount?: number) {
		await cancelSubscription(merchant, amount);
		onSubscriptionChange?.();
	}

	async function handleConfirmActive(merchant: string) {
		await confirmSubscriptionActive(merchant);
		onSubscriptionChange?.();
	}

	function formatDayOfMonth(day: number): string {
		const suffix =
			day === 1 || day === 21 || day === 31
				? 'st'
				: day === 2 || day === 22
					? 'nd'
					: day === 3 || day === 23
						? 'rd'
						: 'th';
		return `${day}${suffix}`;
	}

	function formatRelativeDate(date: Date): string {
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays < 30) {
			return `${diffDays} days ago`;
		} else if (diffDays < 365) {
			const months = Math.floor(diffDays / 30);
			return `${months} month${months === 1 ? '' : 's'} ago`;
		} else {
			const years = Math.floor(diffDays / 365);
			return `${years} year${years === 1 ? '' : 's'} ago`;
		}
	}

</script>

<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
	<div class="px-6 py-4">
		<h2 class="font-display text-xl font-medium text-charcoal">Recurring Expenses</h2>
		<p class="text-sm text-charcoal-muted mt-0.5">
			{#if hasData}
				{activeSubscriptions.length} subscription{activeSubscriptions.length !== 1 ? 's' : ''} · {activeRecurring.length} bill{activeRecurring.length !== 1 ? 's' : ''}
			{:else}
				Subscriptions and recurring bills
			{/if}
		</p>
	</div>
	<div class="px-6 pb-6 space-y-6">
		{#if !hasData}
			<div class="text-center py-6">
				<RefreshCw size={32} class="mx-auto text-charcoal-muted/50 mb-3" />
				<p class="text-charcoal-soft font-medium">No recurring expenses detected</p>
				<p class="text-sm text-charcoal-muted mt-1">
					Tag transactions as subscriptions or add more to detect patterns
				</p>
				<button
					onclick={() => goto('/')}
					class="mt-3 px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 transition-colors"
				>
					Add Transaction
				</button>
			</div>
		{:else}
			<!-- Summary Cards -->
			<div class="grid grid-cols-2 gap-4">
				<div class="bg-primary-50 rounded-lg p-4">
					<p class="text-sm text-charcoal-muted mb-1">Total Monthly</p>
					<p class="text-2xl font-mono font-medium text-charcoal">
						{formatCurrencyWhole(totalMonthlyRecurring)}
					</p>
					<p class="text-sm text-primary-600 font-medium">
						{formatCurrencyWhole(totalMonthlyRecurring * 12)}/year
					</p>
				</div>
				<div class="bg-cream rounded-lg p-4">
					<p class="text-sm text-charcoal-muted mb-1">Breakdown</p>
					<div class="space-y-1">
						<div class="flex items-center justify-between text-sm">
							<span class="text-charcoal-soft">Subscriptions</span>
							<span class="font-mono text-charcoal">{formatCurrencyWhole(totalSubMonthly)}</span>
						</div>
						<div class="flex items-center justify-between text-sm">
							<span class="text-charcoal-soft">Bills</span>
							<span class="font-mono text-charcoal">{formatCurrencyWhole(totalDetectedMonthly)}</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Active Subscriptions Section -->
			{#if activeSubscriptions.length > 0}
				<div class="space-y-4">
					<!-- Monthly Subscriptions -->
					{#if monthlySubscriptions.length > 0}
						<div>
							<h4 class="text-sm font-semibold text-charcoal-soft mb-2 pb-2 border-b border-theme flex items-center justify-between">
								<span class="flex items-center gap-2">
									<RefreshCw size={14} />
									Monthly
								</span>
								<span class="font-mono text-charcoal">{formatCurrencyWhole(monthlySubCost)}/mo</span>
							</h4>
							<div class="space-y-2">
								{#each monthlySubscriptions as sub}
									{@const userAmount = sub.isShared ? sub.amount - sub.partnerShare : sub.amount}
									<div class="flex items-center gap-3 py-2 px-3 bg-cream rounded-lg">
										<span class="text-lg">{getCategoryIcon(sub.categoryId)}</span>
										<div class="flex-1 min-w-0">
											<p class="text-sm font-medium text-charcoal truncate">{sub.merchant}</p>
											<p class="text-xs text-charcoal-muted">{getCategoryName(sub.categoryId)}</p>
										</div>
										<div class="text-right">
											<p class="font-mono text-sm font-medium text-charcoal">
												{formatCurrency(userAmount)}/mo
											</p>
											{#if sub.isShared}
												<p class="text-xs text-success-600">Shared</p>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Semi-Annual Subscriptions -->
					{#if semiAnnualSubscriptions.length > 0}
						<div>
							<h4 class="text-sm font-semibold text-charcoal-soft mb-2 pb-2 border-b border-theme flex items-center justify-between">
								<span>Semi-Annual</span>
								<span class="font-mono text-charcoal">
									{formatCurrencyWhole(semiAnnualSubCost)}/6mo
									<span class="text-xs text-charcoal-muted">(~{formatCurrencyWhole(semiAnnualSubCost / 6)}/mo)</span>
								</span>
							</h4>
							<div class="space-y-2">
								{#each semiAnnualSubscriptions as sub}
									{@const userAmount = sub.isShared ? sub.amount - sub.partnerShare : sub.amount}
									{@const monthlyEquiv = userAmount / 6}
									<div class="flex items-center gap-3 py-2 px-3 bg-cream rounded-lg">
										<span class="text-lg">{getCategoryIcon(sub.categoryId)}</span>
										<div class="flex-1 min-w-0">
											<p class="text-sm font-medium text-charcoal truncate">{sub.merchant}</p>
											<p class="text-xs text-charcoal-muted">{getCategoryName(sub.categoryId)}</p>
										</div>
										<div class="text-right">
											<p class="font-mono text-sm font-medium text-charcoal">
												{formatCurrency(userAmount)}/6mo
											</p>
											<p class="text-xs text-charcoal-muted">
												~{formatCurrency(monthlyEquiv)}/mo
											</p>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Annual Subscriptions -->
					{#if annualSubscriptions.length > 0}
						<div>
							<h4 class="text-sm font-semibold text-charcoal-soft mb-2 pb-2 border-b border-theme flex items-center justify-between">
								<span class="flex items-center gap-2">
									<Calendar size={14} />
									Annual
								</span>
								<span class="font-mono text-charcoal">
									{formatCurrencyWhole(annualSubCost)}/yr
									<span class="text-xs text-charcoal-muted">(~{formatCurrencyWhole(annualSubCost / 12)}/mo)</span>
								</span>
							</h4>
							<div class="space-y-2">
								{#each annualSubscriptions as sub}
									{@const userAmount = sub.isShared ? sub.amount - sub.partnerShare : sub.amount}
									{@const monthlyEquiv = userAmount / 12}
									<div class="flex items-center gap-3 py-2 px-3 bg-cream rounded-lg">
										<span class="text-lg">{getCategoryIcon(sub.categoryId)}</span>
										<div class="flex-1 min-w-0">
											<p class="text-sm font-medium text-charcoal truncate">{sub.merchant}</p>
											<p class="text-xs text-charcoal-muted">{getCategoryName(sub.categoryId)}</p>
										</div>
										<div class="text-right">
											<p class="font-mono text-sm font-medium text-charcoal">
												{formatCurrency(userAmount)}/yr
											</p>
											<p class="text-xs text-charcoal-muted">
												~{formatCurrency(monthlyEquiv)}/mo
											</p>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Upcoming Annual Renewals -->
			{#if upcomingRenewals.length > 0}
				<div>
					<h4 class="text-sm font-medium text-charcoal-muted mb-3 flex items-center gap-2">
						<Calendar size={14} />
						Coming Up
						<span class="text-xs font-normal">({upcomingRenewals.length})</span>
					</h4>

					<div class="space-y-2">
						{#each upcomingRenewals as renewal}
							<div class="flex items-center gap-3 py-2 px-3 bg-primary-500/5 rounded-lg border border-primary-500/20">
								<span class="text-lg">{getCategoryIcon(renewal.categoryId)}</span>
								<div class="flex-1 min-w-0">
									<p class="text-sm font-medium text-charcoal truncate">{renewal.merchant}</p>
									<p class="text-xs text-charcoal-muted">
										Renews ~{renewal.expectedRenewal.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
									</p>
								</div>
								<div class="text-right flex-shrink-0">
									<p class="font-mono text-sm font-medium text-charcoal">
										{formatCurrency(renewal.amount)}/yr
									</p>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Possibly Inactive Subscriptions -->
			{#if possiblyInactiveSubscriptions.length > 0}
				<div>
					<div class="bg-warning-50 rounded-lg px-4 py-2 mb-3">
						<h4 class="text-sm font-semibold text-warning-700 flex items-center gap-2">
							<AlertCircle size={14} />
							Possibly Inactive
							<span class="text-xs font-normal">({possiblyInactiveSubscriptions.length})</span>
						</h4>
					</div>

					<div class="space-y-2">
						{#each possiblyInactiveSubscriptions as sub}
							{@const userAmount = sub.isShared ? sub.amount - sub.partnerShare : sub.amount}
							<div class="flex items-center gap-3 py-2 px-3 bg-warning-50 rounded-lg border border-warning-200">
								<span class="text-lg">{getCategoryIcon(sub.categoryId)}</span>
								<div class="flex-1 min-w-0">
									<p class="text-sm font-medium text-charcoal truncate">{sub.merchant}</p>
									<p class="text-xs text-warning-600">
										No charge since {formatRelativeDate(new Date(sub.date))}
									</p>
								</div>
								<div class="text-right flex-shrink-0">
									<p class="font-mono text-sm font-medium text-charcoal">
										{formatCurrency(userAmount)}{sub.subscriptionFrequency === 'annual' ? '/yr' : sub.subscriptionFrequency === 'semi-annual' ? '/6mo' : '/mo'}
									</p>
								</div>
								<div class="flex gap-1 flex-shrink-0">
									<button
										onclick={() => handleConfirmActive(sub.merchant)}
										class="px-2 py-1 text-xs font-medium text-charcoal-soft bg-surface border border-theme rounded hover:bg-surface-hover transition-colors"
									>
										Still Active
									</button>
									<button
										onclick={() => handleCancelSubscription(sub.merchant, sub.amount)}
										class="px-2 py-1 text-xs font-medium text-danger-600 bg-surface border border-danger-200 rounded hover:bg-danger-50 transition-colors"
									>
										Cancelled
									</button>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Detected Recurring Bills Section -->
			{#if activeRecurring.length > 0}
				<div>
					<h4 class="text-sm font-medium text-charcoal-muted mb-3 flex items-center gap-2">
						<Zap size={14} />
						Detected Bills
						<span class="text-xs font-normal">({activeRecurring.length})</span>
					</h4>

					<div class="space-y-2">
						{#each activeRecurring as item (item.merchant)}
							{@const freqLabel = item.frequency === 'monthly' ? '/mo' : item.frequency === 'semi-annual' ? '/6mo' : '/yr'}
							{@const freqDesc = item.frequency === 'monthly' ? 'monthly' : item.frequency === 'semi-annual' ? 'every 6 months' : 'annually'}
							{@const displayAmount = getDisplayAmount(item.merchant, item.averageUserAmount)}
							{@const isFixed = hasFixedAmount(item.merchant)}
							<button
								type="button"
								onclick={() => openEditModal(item)}
								class="group flex items-center gap-3 py-2 px-3 bg-cream/50 rounded-lg w-full text-left hover:bg-cream cursor-pointer transition-colors"
							>
								<span class="text-lg">{getCategoryIcon(item.categoryId)}</span>
								<div class="flex-1 min-w-0">
									<p class="text-sm font-medium text-charcoal truncate">{item.merchant}</p>
									<p class="text-xs text-charcoal-muted">
										{getCategoryName(item.categoryId)}
										<span class="mx-1">·</span>
										{freqDesc}
										{#if item.amountType === 'variable'}
											<span class="mx-1">·</span>
											<span class="text-warning-600">varies</span>
										{/if}
									</p>
								</div>
								<div class="text-right flex-shrink-0">
									<p class="font-mono text-sm font-medium text-charcoal">
										{isFixed ? '' : '~'}{formatCurrency(displayAmount)}{freqLabel}
									</p>
									{#if isFixed}
										<p class="text-xs text-primary-600">Custom</p>
									{:else if item.isShared}
										<p class="text-xs text-success-600">Shared</p>
									{:else}
										<p class="text-xs text-charcoal-muted">
											{item.occurrenceCount}x
										</p>
									{/if}
								</div>
								<Pencil size={14} class="text-charcoal-muted/0 group-hover:text-charcoal-muted transition-colors flex-shrink-0" />
							</button>
						{/each}
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>

<!-- Confirm Dialog for dismissing recurring bills -->
<ConfirmDialog
	isOpen={confirmDialog.isOpen}
	title="Remove Recurring Bill"
	message={`Are you sure you want to remove "${confirmDialog.merchantName}" from recurring expenses? This bill will no longer appear in your recurring list.`}
	confirmText="Remove"
	variant="warning"
	onConfirm={handleConfirm}
	onCancel={closeConfirmDialog}
/>

<!-- Edit modal for detected bills -->
<EditDetectedBillModal
	isOpen={editModal.isOpen}
	merchant={editModal.merchant}
	detectedAmount={editModal.amount}
	isVariable={editModal.isVariable}
	onSave={handleEditSave}
	onClose={closeEditModal}
/>
