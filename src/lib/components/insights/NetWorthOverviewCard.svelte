<script lang="ts">
	import { goto } from '$app/navigation';
	import type { LinkedAccount, BalanceSnapshot } from '$lib/db';
	import {
		calculateNetWorth,
		buildNetWorthSeries,
		monthlyNetWorthDelta,
		liquidBalance
	} from '$lib/utils/net-worth';
	import { formatCurrency, formatCurrencyWhole } from '$lib/utils/format-helpers';

	interface Props {
		accounts: LinkedAccount[];
		snapshots: BalanceSnapshot[];
		selectedMonth: string;
		/** Mean user-share spending over recent completed months (0 = unknown). */
		avgMonthlySpend: number;
	}

	let { accounts, snapshots, selectedMonth, avgMonthlySpend }: Props = $props();

	let summary = $derived(calculateNetWorth(accounts));
	let series = $derived(buildNetWorthSeries(snapshots, accounts));
	let monthDelta = $derived(monthlyNetWorthDelta(series, selectedMonth));
	let liquid = $derived(liquidBalance(accounts));
	let runway = $derived(avgMonthlySpend > 0 && liquid > 0 ? liquid / avgMonthlySpend : null);
</script>

{#if accounts.length > 0}
	<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
		<div class="px-6 py-4 flex items-center justify-between">
			<div>
				<h2 class="font-display text-xl font-medium text-charcoal">Wealth</h2>
				<p class="text-sm text-charcoal-muted mt-0.5">Actual balances across your accounts</p>
			</div>
			<button
				type="button"
				onclick={() => goto('/networth')}
				class="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
			>
				Net Worth →
			</button>
		</div>
		<div class="px-6 pb-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
			<div class="bg-surface-alt rounded-lg px-3 py-2.5">
				<p class="text-xs text-charcoal-muted mb-0.5">Net worth</p>
				<p class="font-mono text-lg font-medium text-charcoal">{formatCurrency(summary.total)}</p>
			</div>
			<div class="bg-surface-alt rounded-lg px-3 py-2.5">
				<p class="text-xs text-charcoal-muted mb-0.5">This month</p>
				{#if monthDelta !== null}
					<p class="font-mono text-lg font-medium {monthDelta >= 0 ? 'text-success-600' : 'text-charcoal'}">
						{monthDelta >= 0 ? '+' : '−'}{formatCurrencyWhole(Math.abs(monthDelta))}
					</p>
				{:else}
					<p class="font-mono text-lg font-medium text-charcoal-muted">—</p>
					<p class="text-xs text-charcoal-muted">builds as balances update</p>
				{/if}
			</div>
			<div class="bg-surface-alt rounded-lg px-3 py-2.5" title="Liquid balances (checking, savings, and brokerage) ÷ your average monthly spending over recent months">
				<p class="text-xs text-charcoal-muted mb-0.5">Runway</p>
				{#if runway !== null}
					<p class="font-mono text-lg font-medium text-charcoal">
						{runway >= 10 ? Math.round(runway) : runway.toFixed(1)} months
					</p>
					<p class="text-xs text-charcoal-muted">{formatCurrencyWhole(liquid)} liquid</p>
				{:else}
					<p class="font-mono text-lg font-medium text-charcoal-muted">—</p>
				{/if}
			</div>
		</div>
	</div>
{/if}
