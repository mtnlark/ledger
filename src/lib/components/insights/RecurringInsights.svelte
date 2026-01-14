<script lang="ts">
	import { RefreshCw, X, Calendar, Zap, AlertCircle } from 'lucide-svelte';
	import type { Category, Transaction, CancelledSubscription } from '$lib/db';
	import { createCategoryHelpers } from '$lib/utils/category-helpers';
	import { formatCurrencyWhole, formatCurrency } from '$lib/utils/modal-helpers';
	import InsightGroup from './InsightGroup.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import type { DetectedRecurring } from '$lib/stores/recurring';
	import {
		dismissRecurring,
		cancelSubscription,
		confirmSubscriptionActive
	} from '$lib/stores/settings';
	import { normalizeMerchant } from '$lib/utils/string-helpers';
	import { config } from '$lib/config';

	interface Props {
		recurring: DetectedRecurring[];
		categories: Category[];
		allTransactions: Transaction[];
		cancelledSubscriptions: CancelledSubscription[];
		confirmedActiveSubscriptions: string[];
		onDismiss?: () => void;
		onSubscriptionChange?: () => void;
	}

	let {
		recurring,
		categories,
		allTransactions,
		cancelledSubscriptions,
		confirmedActiveSubscriptions,
		onDismiss,
		onSubscriptionChange
	}: Props = $props();


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

	// Check if a subscription is stale based on last transaction date
	function isStale(lastDate: Date, frequency: 'monthly' | 'annual' | undefined): boolean {
		const now = new Date();
		const daysSince = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

		if (frequency === 'annual') {
			const monthsSince = daysSince / 30;
			return monthsSince > config.subscription.annualStaleMonths;
		} else {
			return daysSince > config.subscription.monthlyStaleDays;
		}
	}

	// Get unique subscriptions from transactions (most recent for each merchant)
	let allSubscriptions = $derived.by(() => {
		const subTransactions = allTransactions.filter((t: Transaction) => t.isSubscription);

		// Group by merchant to get unique subscriptions (keep most recent)
		const byMerchant = new Map<string, Transaction>();
		for (const tx of subTransactions) {
			const existing = byMerchant.get(tx.merchant);
			if (!existing || new Date(tx.date) > new Date(existing.date)) {
				byMerchant.set(tx.merchant, tx);
			}
		}

		return Array.from(byMerchant.values());
	});

	// Create a map of cancelled merchants to their cancellation dates
	let cancelledMerchantMap = $derived(
		new Map(cancelledSubscriptions.map((c: CancelledSubscription) => [c.merchant, new Date(c.cancelledDate)]))
	);

	// Helper to check if a subscription is cancelled (and not resubscribed after cancellation)
	function isCancelled(merchant: string, createdAt: Date): boolean {
		const normalized = normalizeMerchant(merchant);
		const cancelledDate = cancelledMerchantMap.get(normalized);
		if (!cancelledDate) return false;
		// If the transaction was added after the cancellation, it's a resubscription
		return createdAt <= cancelledDate;
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
				// Use createdAt (when user added the transaction) to compare against cancellation
				// This handles the case where user adds a new subscription with a past charge date
				const createdAt = new Date(sub.createdAt);
				// Check if cancelled (but allow resubscriptions added after cancellation)
				if (isCancelled(sub.merchant, createdAt)) return false;
				// Either confirmed active OR not stale
				const stale = isStale(subDate, sub.subscriptionFrequency);
				return confirmedActiveSet.has(normalized) || !stale;
			})
			.sort((a, b) => {
				if (a.subscriptionFrequency !== b.subscriptionFrequency) {
					return a.subscriptionFrequency === 'monthly' ? -1 : 1;
				}
				return b.amount - a.amount;
			});
	});

	let possiblyInactiveSubscriptions = $derived.by(() => {
		return allSubscriptions
			.filter((sub) => {
				const normalized = normalizeMerchant(sub.merchant);
				const subDate = new Date(sub.date);
				const createdAt = new Date(sub.createdAt);
				// Not cancelled (or resubscribed after cancellation)
				if (isCancelled(sub.merchant, createdAt)) return false;
				// Not confirmed active AND is stale
				if (confirmedActiveSet.has(normalized)) return false;
				return isStale(subDate, sub.subscriptionFrequency);
			})
			.sort((a, b) => b.amount - a.amount);
	});

	// Separate monthly and annual for active subscriptions
	let monthlySubscriptions = $derived(
		activeSubscriptions.filter((s) => s.subscriptionFrequency !== 'annual')
	);
	let annualSubscriptions = $derived(
		activeSubscriptions.filter((s) => s.subscriptionFrequency === 'annual')
	);

	// Calculate subscription totals (user's portion only, active only)
	let monthlySubCost = $derived(
		monthlySubscriptions.reduce((sum, t) => {
			const userAmount = t.isShared ? t.amount - t.partnerShare : t.amount;
			return sum + userAmount;
		}, 0)
	);

	let annualSubCost = $derived(
		annualSubscriptions.reduce((sum, t) => {
			const userAmount = t.isShared ? t.amount - t.partnerShare : t.amount;
			return sum + userAmount;
		}, 0)
	);

	// Monthly equivalent of active subscriptions
	let totalSubMonthly = $derived(monthlySubCost + annualSubCost / 12);

	// Calculate detected recurring totals (user's portion only, converted to monthly)
	let totalDetectedMonthly = $derived(
		recurring.reduce((sum: number, r: DetectedRecurring) => {
			// Convert to monthly equivalent based on frequency
			if (r.frequency === 'semi-annual') {
				return sum + r.averageUserAmount / 6;
			} else if (r.frequency === 'annual') {
				return sum + r.averageUserAmount / 12;
			}
			return sum + r.averageUserAmount;
		}, 0)
	);

	// Grand total monthly (active only)
	let totalMonthlyRecurring = $derived(totalSubMonthly + totalDetectedMonthly);

	// Has any data?
	let hasData = $derived(
		allSubscriptions.length > 0 || recurring.length > 0
	);

	// Action handlers - handleDismiss now shows confirmation dialog
	function handleDismiss(merchant: string) {
		showDismissConfirmDialog(merchant);
	}

	async function handleCancelSubscription(merchant: string) {
		await cancelSubscription(merchant);
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

<InsightGroup title="Recurring Expenses" description="Subscriptions and recurring bills">
	{#snippet preview()}
		{#if !hasData}
			<p class="text-charcoal-muted text-sm">No recurring expenses yet</p>
		{:else}
			<div class="flex items-center gap-4">
				<div>
					<span class="font-mono text-lg font-medium text-charcoal">
						{formatCurrencyWhole(totalMonthlyRecurring)}
					</span>
					<span class="text-sm text-charcoal-muted ml-1">/mo</span>
				</div>
				<div class="text-charcoal-muted">|</div>
				<div class="text-sm text-charcoal-muted">
					{activeSubscriptions.length} sub{activeSubscriptions.length !== 1 ? 's' : ''}, {recurring.length} bill{recurring.length !== 1 ? 's' : ''}
					{#if possiblyInactiveSubscriptions.length > 0}
						<span class="text-warning-600 ml-1">({possiblyInactiveSubscriptions.length} inactive?)</span>
					{/if}
				</div>
			</div>
		{/if}
	{/snippet}

	{#snippet children()}
		{#if !hasData}
			<div class="text-center py-6">
				<RefreshCw size={32} class="mx-auto text-charcoal-muted/50 mb-3" />
				<p class="text-charcoal-soft font-medium">No recurring expenses detected</p>
				<p class="text-sm text-charcoal-muted mt-1">
					Tag transactions as subscriptions or add more to detect patterns
				</p>
			</div>
		{:else}
			<!-- Summary Cards -->
			<div class="grid grid-cols-2 gap-4 mb-6">
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

			<div class="space-y-6">
				<!-- Active Subscriptions Section -->
				{#if activeSubscriptions.length > 0}
					<div>
						<h4 class="text-sm font-medium text-charcoal-muted mb-3 flex items-center gap-2">
							<RefreshCw size={14} />
							Subscriptions
							<span class="text-xs font-normal">({activeSubscriptions.length})</span>
						</h4>

						<div class="space-y-2">
							<!-- Monthly Subscriptions -->
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

							<!-- Annual Subscriptions -->
							{#each annualSubscriptions as sub}
								{@const userAmount = sub.isShared ? sub.amount - sub.partnerShare : sub.amount}
								{@const monthlyEquiv = userAmount / 12}
								<div class="flex items-center gap-3 py-2 px-3 bg-cream rounded-lg">
									<span class="text-lg">{getCategoryIcon(sub.categoryId)}</span>
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-1.5">
											<p class="text-sm font-medium text-charcoal truncate">{sub.merchant}</p>
											<Calendar size={12} class="text-charcoal-muted flex-shrink-0" />
										</div>
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

				<!-- Possibly Inactive Subscriptions -->
				{#if possiblyInactiveSubscriptions.length > 0}
					<div>
						<h4 class="text-sm font-medium text-warning-600 mb-3 flex items-center gap-2">
							<AlertCircle size={14} />
							Possibly Inactive
							<span class="text-xs font-normal">({possiblyInactiveSubscriptions.length})</span>
						</h4>

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
											{formatCurrency(userAmount)}{sub.subscriptionFrequency === 'annual' ? '/yr' : '/mo'}
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
											onclick={() => handleCancelSubscription(sub.merchant)}
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
				{#if recurring.length > 0}
					<div>
						<h4 class="text-sm font-medium text-charcoal-muted mb-3 flex items-center gap-2">
							<Zap size={14} />
							Detected Bills
							<span class="text-xs font-normal">({recurring.length})</span>
						</h4>

						<div class="space-y-2">
							{#each recurring as item (item.merchant)}
								{@const freqLabel = item.frequency === 'monthly' ? '/mo' : item.frequency === 'semi-annual' ? '/6mo' : '/yr'}
								{@const freqDesc = item.frequency === 'monthly' ? 'monthly' : item.frequency === 'semi-annual' ? 'every 6 months' : 'annually'}
								<div class="flex items-center gap-3 py-2 px-3 bg-cream/50 rounded-lg group">
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
											~{formatCurrency(item.averageUserAmount)}{freqLabel}
										</p>
										{#if item.isShared}
											<p class="text-xs text-success-600">Shared</p>
										{:else}
											<p class="text-xs text-charcoal-muted">
												{item.occurrenceCount}x
											</p>
										{/if}
									</div>
									<button
										onclick={() => handleDismiss(item.merchant)}
										class="p-1.5 text-charcoal-muted/0 group-hover:text-charcoal-muted hover:!text-danger-500 hover:bg-danger-50 rounded-lg transition-colors flex-shrink-0"
										aria-label="Dismiss recurring expense"
										title="Remove from recurring"
									>
										<X size={14} />
									</button>
								</div>
							{/each}
						</div>
					</div>
				{/if}

			</div>
		{/if}
	{/snippet}
</InsightGroup>

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
