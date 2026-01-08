<script lang="ts">
	import { RefreshCw, X } from 'lucide-svelte';
	import type { Category } from '$lib/db';
	import InsightGroup from './InsightGroup.svelte';
	import type { DetectedRecurring } from '$lib/stores/recurring';
	import { dismissRecurring } from '$lib/stores/settings';

	interface Props {
		recurring: DetectedRecurring[];
		categories: Category[];
		onDismiss?: (merchant: string) => void;
	}

	let { recurring, categories, onDismiss }: Props = $props();

	async function handleDismiss(merchant: string) {
		await dismissRecurring(merchant);
		onDismiss?.(merchant);
	}

	// Calculate totals
	let totalMonthlyRecurring = $derived(
		recurring.reduce((sum, r) => sum + r.averageAmount, 0)
	);

	let subscriptionsMonthly = $derived(
		recurring.filter((r) => r.isSubscription).reduce((sum, r) => sum + r.averageAmount, 0)
	);

	function formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2
		}).format(amount);
	}

	function getCategoryIcon(categoryId: number): string {
		const cat = categories.find((c) => c.id === categoryId);
		return cat?.icon ?? '📝';
	}

	function getCategoryColor(categoryId: number): string {
		const cat = categories.find((c) => c.id === categoryId);
		return cat?.color ?? '#8A847C';
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

<InsightGroup title="Recurring Expenses" description="Detected monthly recurring charges">
	{#snippet preview()}
		{#if recurring.length === 0}
			<p class="text-charcoal-muted text-sm">No recurring expenses detected yet</p>
		{:else}
			<p class="text-charcoal font-medium">
				<span class="font-mono">{formatCurrency(totalMonthlyRecurring)}</span>/mo recurring
				<span class="text-charcoal-muted font-normal">({recurring.length} detected)</span>
			</p>
		{/if}
	{/snippet}

	{#snippet children()}
		{#if recurring.length === 0}
			<div class="text-center py-6">
				<RefreshCw size={32} class="mx-auto text-charcoal-muted/50 mb-3" />
				<p class="text-charcoal-soft font-medium">No recurring expenses detected</p>
				<p class="text-sm text-charcoal-muted mt-1">
					Add more transactions to detect monthly patterns
				</p>
			</div>
		{:else}
			<!-- Summary Stats -->
			<div class="grid grid-cols-2 gap-4 mb-6">
				<div class="bg-cream rounded-lg p-4">
					<p class="text-sm text-charcoal-muted">Total Monthly Recurring</p>
					<p class="text-2xl font-mono font-medium text-charcoal">
						{formatCurrency(totalMonthlyRecurring)}
					</p>
				</div>
				<div class="bg-cream rounded-lg p-4">
					<p class="text-sm text-charcoal-muted">Subscriptions</p>
					<p class="text-2xl font-mono font-medium text-charcoal">
						{formatCurrency(subscriptionsMonthly)}
					</p>
				</div>
			</div>

			<!-- Recurring Items List -->
			<div class="space-y-2">
				<h4 class="text-sm font-medium text-charcoal-muted mb-3">Detected Recurring</h4>
				{#each recurring as item (item.merchant)}
					<div
						class="flex items-center gap-3 p-3 bg-cream/50 rounded-lg border-l-4"
						style="border-left-color: {getCategoryColor(item.categoryId)}"
					>
						<span class="text-xl">{getCategoryIcon(item.categoryId)}</span>
						<div class="flex-1 min-w-0">
							<p class="font-medium text-charcoal truncate">{item.merchant}</p>
							<p class="text-sm text-charcoal-muted">
								on the {formatDayOfMonth(item.dayOfMonth)}
								{#if item.isSubscription}
									<span class="inline-flex items-center px-1.5 py-0.5 ml-1 rounded text-xs font-medium bg-primary-100 text-primary-700">
										Subscription
									</span>
								{/if}
							</p>
						</div>
						<div class="text-right flex-shrink-0">
							<p class="font-mono font-medium text-charcoal">
								~{formatCurrency(item.averageAmount)}
							</p>
							<p class="text-xs text-charcoal-muted">
								{item.occurrenceCount} occurrence{item.occurrenceCount === 1 ? '' : 's'}
							</p>
						</div>
						<button
							onclick={() => handleDismiss(item.merchant)}
							class="p-1.5 text-charcoal-muted hover:text-danger-500 hover:bg-danger-50 rounded-lg transition-colors flex-shrink-0"
							aria-label="Dismiss recurring expense"
							title="Remove from recurring"
						>
							<X size={16} />
						</button>
					</div>
				{/each}
			</div>
		{/if}
	{/snippet}
</InsightGroup>
