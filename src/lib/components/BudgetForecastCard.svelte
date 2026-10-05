<script lang="ts">
	import type { BudgetForecast } from '$lib/planning/forecast';
	import { formatCurrency } from '$lib/utils/format-helpers';
	import { sumCurrency } from '$lib/utils/currency';
	let { forecast, income = null, rolloverAdjustment = 0 }: {
		forecast: BudgetForecast; income?: number | null; rolloverAdjustment?: number;
	} = $props();
	let spending = $derived(sumCurrency([forecast.recorded, forecast.upcoming, forecast.variable]));
	let spendingRange = $derived(forecast.range && forecast.remainder !== null ? {
		low: sumCurrency([spending, forecast.remainder, -forecast.range.high]),
		high: sumCurrency([spending, forecast.remainder, -forecast.range.low])
	} : null);
</script>

<section class="bg-surface rounded-xl shadow-sm shadow-theme p-5 space-y-3" aria-label="Spending forecast">
	<h2 class="text-xs font-medium uppercase tracking-wider text-charcoal-muted">Expected month-end spending</h2>
	<p class="font-mono text-2xl font-medium text-charcoal" aria-label="Projected spending">{formatCurrency(spending)}</p>
	<p class="text-xs text-charcoal-muted">Your share of bills and everyday spending.</p>
	<details class="text-sm border-t border-dashed border-theme-dashed pt-3">
		<summary class="cursor-pointer text-charcoal-muted">How this is estimated</summary>
		<dl class="space-y-2 mt-4">
			<div class="flex justify-between gap-3"><dt>Recorded spending</dt><dd class="font-mono">{formatCurrency(forecast.recorded)}</dd></div>
			<div class="flex justify-between gap-3"><dt>Upcoming entries and bills</dt><dd class="font-mono">{formatCurrency(forecast.upcoming)}</dd></div>
			<div class="flex justify-between gap-3"><dt>Remaining everyday spending</dt><dd class="font-mono">{formatCurrency(forecast.variable)}</dd></div>
		</dl>
		{#if spendingRange}
			<p class="text-xs text-charcoal-muted mt-4">Historical spending range: {formatCurrency(spendingRange.low)}–{formatCurrency(spendingRange.high)}. Everyday spending uses the remaining days in {forecast.historyMonths} completed {forecast.historyMonths === 1 ? 'month' : 'months'}; recurring bills are counted separately.</p>
		{:else}
			<p class="text-xs text-charcoal-muted mt-4">{forecast.variableMethod === 'pace' ? 'Everyday spending uses the days recorded so far, with recurring bills excluded.' : forecast.variableMethod === 'history' ? 'Everyday spending uses the remaining days in recent completed months.' : 'With limited history, this estimate covers only recorded and upcoming expenses.'}</p>
		{/if}
		<p class="text-xs text-charcoal-muted mt-2">Upcoming bills use recurring history and subscription settings. A matching entry replaces the bill estimate, even if its amount changes for a variable bill.</p>
		{#if forecast.commitments.some(c => c.matchedIds.length === 0)}
			<ul class="text-xs text-charcoal-muted space-y-1 mt-3" aria-label="Estimated upcoming bills">
				{#each forecast.commitments.filter(c => c.matchedIds.length === 0) as bill (`${bill.schedule.id}-${bill.date}`)}
					<li class="flex justify-between gap-3"><span>{bill.schedule.merchant}</span><span class="font-mono">{formatCurrency(bill.amount)}</span></li>
				{/each}
			</ul>
		{/if}
		{#if income !== null}
			<dl class="space-y-2 mt-4 pt-3 border-t border-dashed border-theme-dashed">
				<div class="flex justify-between gap-3"><dt>Income</dt><dd class="font-mono">{formatCurrency(income)}</dd></div>
				{#if rolloverAdjustment}<div class="flex justify-between gap-3"><dt>Budget rollover</dt><dd class="font-mono">{formatCurrency(rolloverAdjustment)}</dd></div>{/if}
				<div class="flex justify-between gap-3"><dt>Reserved savings</dt><dd class="font-mono">{formatCurrency(forecast.savings)}</dd></div>
				<div class="flex justify-between gap-3 font-medium"><dt>Expected remainder</dt><dd class="font-mono {forecast.remainder !== null && forecast.remainder < 0 ? 'text-danger-600' : 'text-success-600'}">{formatCurrency(forecast.remainder ?? 0)}</dd></div>
			</dl>
			<p class="text-xs text-charcoal-muted mt-2">A monthly budget estimate; bank balances and payment timing are separate.</p>
		{/if}
	</details>
</section>
