<script lang="ts">
	import { RefreshCw, X, Calendar, Zap } from 'lucide-svelte';
	import type { Category, Transaction } from '$lib/db';
	import { createCategoryHelpers } from '$lib/utils/category-helpers';
	import InsightGroup from './InsightGroup.svelte';
	import type { DetectedRecurring } from '$lib/stores/recurring';
	import { dismissRecurring } from '$lib/stores/settings';

	interface Props {
		recurring: DetectedRecurring[];
		categories: Category[];
		allTransactions: Transaction[];
		onDismiss?: (merchant: string) => void;
	}

	let { recurring, categories, allTransactions, onDismiss }: Props = $props();

	// Create category helpers bound to current categories
	let categoryHelpers = $derived(createCategoryHelpers(categories));
	let getCategoryIcon = $derived(categoryHelpers.getIcon);
	let getCategoryName = $derived(categoryHelpers.getName);

	async function handleDismiss(merchant: string) {
		await dismissRecurring(merchant);
		onDismiss?.(merchant);
	}

	// Get unique subscriptions from transactions (most recent for each merchant)
	let subscriptions = $derived.by(() => {
		const subTransactions = allTransactions.filter((t) => t.isSubscription);

		// Group by merchant to get unique subscriptions
		const byMerchant = new Map<string, Transaction>();
		for (const tx of subTransactions) {
			const existing = byMerchant.get(tx.merchant);
			if (!existing || new Date(tx.date) > new Date(existing.date)) {
				byMerchant.set(tx.merchant, tx);
			}
		}

		return Array.from(byMerchant.values()).sort((a, b) => {
			// Monthly first, then by amount descending
			if (a.subscriptionFrequency !== b.subscriptionFrequency) {
				return a.subscriptionFrequency === 'monthly' ? -1 : 1;
			}
			return b.amount - a.amount;
		});
	});

	// Separate monthly and annual subscriptions
	let monthlySubscriptions = $derived(subscriptions.filter((s) => s.subscriptionFrequency !== 'annual'));
	let annualSubscriptions = $derived(subscriptions.filter((s) => s.subscriptionFrequency === 'annual'));

	// Calculate subscription totals (user's portion only)
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

	// Monthly equivalent of subscriptions
	let totalSubMonthly = $derived(monthlySubCost + annualSubCost / 12);

	// Calculate detected recurring totals (user's portion only)
	let totalDetectedMonthly = $derived(
		recurring.reduce((sum, r) => sum + r.averageUserAmount, 0)
	);

	// Grand total monthly
	let totalMonthlyRecurring = $derived(totalSubMonthly + totalDetectedMonthly);

	// Has any data?
	let hasData = $derived(subscriptions.length > 0 || recurring.length > 0);

	function formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 0,
			maximumFractionDigits: 0
		}).format(amount);
	}

	function formatCurrencyDecimal(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(amount);
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
</script>

<InsightGroup title="Recurring Expenses" description="Subscriptions and recurring bills">
	{#snippet preview()}
		{#if !hasData}
			<p class="text-charcoal-muted text-sm">No recurring expenses yet</p>
		{:else}
			<div class="flex items-center gap-4">
				<div>
					<span class="font-mono text-lg font-medium text-charcoal">
						{formatCurrency(totalMonthlyRecurring)}
					</span>
					<span class="text-sm text-charcoal-muted ml-1">/mo</span>
				</div>
				<div class="text-charcoal-muted">|</div>
				<div class="text-sm text-charcoal-muted">
					{subscriptions.length} sub{subscriptions.length !== 1 ? 's' : ''}, {recurring.length} bill{recurring.length !== 1 ? 's' : ''}
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
						{formatCurrency(totalMonthlyRecurring)}
					</p>
					<p class="text-sm text-primary-600 font-medium">
						{formatCurrency(totalMonthlyRecurring * 12)}/year
					</p>
				</div>
				<div class="bg-cream rounded-lg p-4">
					<p class="text-sm text-charcoal-muted mb-1">Breakdown</p>
					<div class="space-y-1">
						<div class="flex items-center justify-between text-sm">
							<span class="text-charcoal-soft">Subscriptions</span>
							<span class="font-mono text-charcoal">{formatCurrency(totalSubMonthly)}</span>
						</div>
						<div class="flex items-center justify-between text-sm">
							<span class="text-charcoal-soft">Bills</span>
							<span class="font-mono text-charcoal">{formatCurrency(totalDetectedMonthly)}</span>
						</div>
					</div>
				</div>
			</div>

			<div class="space-y-6">
				<!-- Subscriptions Section -->
				{#if subscriptions.length > 0}
					<div>
						<h4 class="text-sm font-medium text-charcoal-muted mb-3 flex items-center gap-2">
							<RefreshCw size={14} />
							Subscriptions
							<span class="text-xs font-normal">({subscriptions.length})</span>
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
											{formatCurrencyDecimal(userAmount)}/mo
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
											{formatCurrencyDecimal(userAmount)}/yr
										</p>
										<p class="text-xs text-charcoal-muted">
											~{formatCurrencyDecimal(monthlyEquiv)}/mo
										</p>
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
								<div class="flex items-center gap-3 py-2 px-3 bg-cream/50 rounded-lg group">
									<span class="text-lg">{getCategoryIcon(item.categoryId)}</span>
									<div class="flex-1 min-w-0">
										<p class="text-sm font-medium text-charcoal truncate">{item.merchant}</p>
										<p class="text-xs text-charcoal-muted">
											{getCategoryName(item.categoryId)}
											<span class="mx-1">·</span>
											~{formatDayOfMonth(item.dayOfMonth)} of month
											{#if item.amountType === 'variable'}
												<span class="mx-1">·</span>
												<span class="text-warning-600">varies</span>
											{/if}
										</p>
									</div>
									<div class="text-right flex-shrink-0">
										<p class="font-mono text-sm font-medium text-charcoal">
											~{formatCurrencyDecimal(item.averageUserAmount)}/mo
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
