<script lang="ts">
	import { onMount } from 'svelte';
	import { CalendarDays, X, TrendingUp, TrendingDown, Minus } from 'lucide-svelte';
	import type { Transaction, Category } from '$lib/db';
	import {
		calculateWeekInReview,
		isDismissedThisWeek,
		dismissWeekReview,
		type WeekInReview
	} from '$lib/utils/week-in-review';
	import { formatCurrency } from '$lib/utils/format-helpers';

	interface Props {
		allTransactions: Transaction[];
		categories: Category[];
	}

	let { allTransactions, categories }: Props = $props();

	let dismissed = $state(false);
	let review = $state<WeekInReview | null>(null);

	onMount(() => {
		dismissed = isDismissedThisWeek();
	});

	$effect(() => {
		if (!dismissed && allTransactions.length > 0 && categories.length > 0) {
			review = calculateWeekInReview(allTransactions, categories);
		}
	});

	function handleDismiss() {
		dismissWeekReview();
		dismissed = true;
	}

	let shouldShow = $derived(!dismissed && review !== null);
</script>

{#if shouldShow && review}
	<div
		class="bg-primary-50 border border-primary-200 rounded-xl px-4 py-4"
		role="region"
		aria-label="Week in Review"
	>
		<!-- Header -->
		<div class="flex items-center justify-between mb-3">
			<div class="flex items-center gap-2">
				<div class="p-1.5 bg-primary-100 rounded-lg text-primary-600">
					<CalendarDays size={16} />
				</div>
				<h3 class="text-sm font-semibold text-charcoal">Week in Review</h3>
			</div>
			<button
				type="button"
				onclick={handleDismiss}
				class="p-1.5 text-charcoal-muted hover:text-charcoal hover:bg-primary-100 rounded-lg transition-colors"
				aria-label="Dismiss week in review"
				title="Dismiss until next week"
			>
				<X size={16} />
			</button>
		</div>

		<!-- Stats Grid -->
		<div class="grid grid-cols-2 gap-3">
			<!-- Total Spent -->
			<div class="bg-white/60 rounded-lg px-3 py-2">
				<p class="text-xs text-charcoal-muted mb-0.5">Total Spent</p>
				<div class="flex items-center gap-1.5">
					<span class="font-mono text-base font-semibold text-charcoal">{formatCurrency(review.totalSpent)}</span>
					{#if review.change > 0}
						<span class="inline-flex items-center gap-0.5 text-xs text-danger-600 font-medium" title="Up from {formatCurrency(review.priorWeekTotal)} prior week">
							<TrendingUp size={12} />
							+{formatCurrency(review.change)}
						</span>
					{:else if review.change < 0}
						<span class="inline-flex items-center gap-0.5 text-xs text-success-600 font-medium" title="Down from {formatCurrency(review.priorWeekTotal)} prior week">
							<TrendingDown size={12} />
							{formatCurrency(review.change)}
						</span>
					{:else}
						<span class="inline-flex items-center gap-0.5 text-xs text-charcoal-muted" title="Same as prior week">
							<Minus size={12} />
							flat
						</span>
					{/if}
				</div>
			</div>

			<!-- Transaction Count -->
			<div class="bg-white/60 rounded-lg px-3 py-2">
				<p class="text-xs text-charcoal-muted mb-0.5">Transactions</p>
				<span class="font-mono text-base font-semibold text-charcoal">{review.txCount}</span>
			</div>

			<!-- Top Category -->
			<div class="bg-white/60 rounded-lg px-3 py-2">
				<p class="text-xs text-charcoal-muted mb-0.5">Top Category</p>
				{#if review.topCategory}
					<div class="flex items-center gap-1 min-w-0">
						{#if review.topCategory.icon}
							<span class="text-sm shrink-0">{review.topCategory.icon}</span>
						{/if}
						<span class="text-sm font-medium text-charcoal truncate">{review.topCategory.name}</span>
					</div>
					<span class="font-mono text-xs text-charcoal-muted">{formatCurrency(review.topCategory.amount)}</span>
				{:else}
					<span class="text-sm text-charcoal-muted">—</span>
				{/if}
			</div>

			<!-- Top Merchant -->
			<div class="bg-white/60 rounded-lg px-3 py-2">
				<p class="text-xs text-charcoal-muted mb-0.5">Top Merchant</p>
				{#if review.topMerchant}
					<span class="text-sm font-medium text-charcoal truncate block">{review.topMerchant.name}</span>
					<span class="text-xs text-charcoal-muted">{review.topMerchant.count} {review.topMerchant.count === 1 ? 'visit' : 'visits'}</span>
				{:else}
					<span class="text-sm text-charcoal-muted">—</span>
				{/if}
			</div>
		</div>
	</div>
{/if}
