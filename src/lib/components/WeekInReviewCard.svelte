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
	import type { Settings } from '$lib/db';
	import type { BudgetForecast } from '$lib/planning/forecast';
	import { confirmCompleteThrough, getPurchaseRows } from '$lib/stores/planning';
	import { updateTransaction } from '$lib/stores/transactions';
	import { formatDateForInput } from '$lib/utils/date-helpers';
	import { getWeekRange, filterTransactionsInRange } from '$lib/utils/week-in-review';

	interface Props {
		allTransactions: Transaction[];
		categories: Category[];
		settings?: Settings;
		forecast?: BudgetForecast;
		onSaved?: () => Promise<void>;
	}

	let { allTransactions, categories, settings, forecast, onSaved }: Props = $props();
	let completeDate = $state(formatDateForInput(getWeekRange(1).end));
	let error = $state('');
	let busy = $state(false);
	let reviewCandidate = $derived(filterTransactionsInRange(allTransactions, getWeekRange(1).start, getWeekRange(1).end).filter(t => t.amount > 0 && !t.isExpectedOneOff && !t.isSubscription).sort((a, b) => b.amount - a.amount)[0]);
	async function confirm() {
		if (busy) return; busy = true;
		try { await confirmCompleteThrough(completeDate); await onSaved?.(); } catch (e) { error = String(e); } finally { busy = false; }
	}
	async function markOneOff() {
		if (!reviewCandidate || busy) return; busy = true;
		try {
			const { runMutation } = await import('$lib/storage/mutation');
			await runMutation(['transactions', 'settings', 'categories'], async () => {
				for (const row of await getPurchaseRows(reviewCandidate)) await updateTransaction(row.id!, { isExpectedOneOff: true });
				if (reviewCandidate.parentTransactionId) await updateTransaction(reviewCandidate.parentTransactionId, { isExpectedOneOff: true });
			});
			await onSaved?.();
		} catch (e) { error = String(e); } finally { busy = false; }
	}

	let dismissed = $state(false);
	let review = $state<WeekInReview | null>(null);

	onMount(() => {
		dismissed = isDismissedThisWeek();
	});

	$effect(() => {
		if (!dismissed && categories.length > 0) {
			review = calculateWeekInReview(allTransactions, categories) ?? { totalSpent: 0, txCount: 0, topCategory: null, topMerchant: null, priorWeekTotal: 0, change: 0 };
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
			<div class="bg-surface/60 rounded-lg px-3 py-2">
				<p class="text-xs text-charcoal-muted mb-0.5">Total Spent</p>
				<div class="flex flex-wrap items-center gap-x-1.5 gap-y-1">
					<span class="shrink-0 font-mono text-base font-semibold text-charcoal">{formatCurrency(review.totalSpent)}</span>
					{#if review.change > 0}
						<span class="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-xs leading-none text-danger-600 font-medium" title="Up from {formatCurrency(review.priorWeekTotal)} prior week">
							<TrendingUp class="shrink-0" size={12} />
							+{formatCurrency(review.change)}
						</span>
					{:else if review.change < 0}
						<span class="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-xs leading-none text-success-600 font-medium" title="Down from {formatCurrency(review.priorWeekTotal)} prior week">
							<TrendingDown class="shrink-0" size={12} />
							{formatCurrency(review.change)}
						</span>
					{:else}
						<span class="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-xs leading-none text-charcoal-muted" title="Same as prior week">
							<Minus class="shrink-0" size={12} />
							flat
						</span>
					{/if}
				</div>
			</div>

			<!-- Transaction Count -->
			<div class="bg-surface/60 rounded-lg px-3 py-2">
				<p class="text-xs text-charcoal-muted mb-0.5">Transactions</p>
				<span class="font-mono text-base font-semibold text-charcoal">{review.txCount}</span>
			</div>

			<!-- Top Category -->
			<div class="bg-surface/60 rounded-lg px-3 py-2">
				<p class="text-xs text-charcoal-muted mb-0.5">Top Category</p>
				{#if review.topCategory}
					<div class="flex items-center gap-1 min-w-0">
						<span class="text-sm font-medium text-charcoal truncate">{review.topCategory.name}</span>
					</div>
					<span class="font-mono text-xs text-charcoal-muted">{formatCurrency(review.topCategory.amount)}</span>
				{:else}
					<span class="text-sm text-charcoal-muted">—</span>
				{/if}
			</div>

			<!-- Top Merchant -->
			<div class="bg-surface/60 rounded-lg px-3 py-2">
				<p class="text-xs text-charcoal-muted mb-0.5">Top Merchant</p>
				{#if review.topMerchant}
					<span class="text-sm font-medium text-charcoal truncate block">{review.topMerchant.name}</span>
					{#if review.topMerchant.basis === 'spend'}
						<span class="font-mono text-xs text-charcoal-muted">{formatCurrency(review.topMerchant.amount)} spent</span>
					{:else}
						<span class="text-xs text-charcoal-muted">{review.topMerchant.count} {review.topMerchant.count === 1 ? 'visit' : 'visits'}</span>
					{/if}
				{:else}
					<span class="text-sm text-charcoal-muted">—</span>
				{/if}
			</div>
		</div>
		<ol class="mt-4 space-y-4 text-sm list-decimal list-inside">
			<li><span class="font-medium">Confirm records are complete</span><p class="text-xs text-charcoal-muted mt-1">{settings?.planning?.completeThrough ? `Confirmed through ${settings.planning.completeThrough}.` : 'Entry activity does not confirm completeness.'} Zero-spending weeks can be confirmed.</p><label class="block mt-2 text-xs">Complete through<input type="date" max={formatDateForInput(new Date())} bind:value={completeDate} class="block w-full p-2 border border-theme rounded-lg bg-surface mt-1" /></label><button class="text-primary-600 mt-2" disabled={busy} onclick={confirm}>Confirm completeness</button></li>
			<li><span class="font-medium">Review an expense</span>{#if reviewCandidate}<p class="text-xs text-charcoal-muted mt-1">{reviewCandidate.merchant} · {formatCurrency(reviewCandidate.amount)}. Was this expected outside your ordinary spending?</p><button class="text-primary-600 mt-2" disabled={busy} onclick={markOneOff}>Mark expected one-off</button>{:else}<p class="text-xs text-charcoal-muted mt-1">No ordinary expenses to review this week.</p>{/if}<a class="block text-primary-600 mt-2" href="/planning">Review recurring bills</a></li>
			<li><span class="font-medium">Adjust the month ahead</span>{#if forecast?.remainder !== null && forecast?.remainder !== undefined}<p class="text-xs text-charcoal-muted mt-1">Expected remainder: {formatCurrency(forecast.remainder)}.</p>{/if}<a href="/planning" class="block text-primary-600 mt-2">Review budget and contributions</a></li>
		</ol>
		{#if error}<p role="alert" class="text-danger-600 text-xs mt-2">{error}</p>{/if}
	</div>
{/if}
