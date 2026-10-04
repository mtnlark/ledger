<script lang="ts">
	import type { BudgetForecast } from '$lib/planning/forecast';
	import { formatCurrency } from '$lib/utils/format-helpers';
	let { forecast }: { forecast: BudgetForecast } = $props();
</script>

<section class="bg-surface rounded-xl shadow-sm shadow-theme p-5 space-y-3" aria-label="Budget forecast">
	<h2 class="text-sm font-medium text-charcoal">Expected month-end remainder</h2>
	<p class="font-mono text-2xl {forecast.remainder !== null && forecast.remainder < 0 ? 'text-danger-600' : 'text-success-600'}">{forecast.remainder === null ? 'Set monthly income' : formatCurrency(forecast.remainder)}</p>
	<p class="text-xs text-charcoal-muted">Budget estimate based on your records and plans.</p>
	<details class="text-sm">
		<summary class="cursor-pointer text-primary-600">How this is estimated</summary>
		<dl class="space-y-2 mt-3">
			<div class="flex justify-between gap-3"><dt>Remaining after commitments</dt><dd class="font-mono">{forecast.remaining === null ? '—' : formatCurrency(forecast.remaining)}</dd></div>
			<div class="flex justify-between gap-3"><dt>Expected variable spending</dt><dd class="font-mono">−{formatCurrency(forecast.variable)}</dd></div>
		</dl>
		{#if forecast.range}
			<p class="text-xs text-charcoal-muted mt-3">Historical remainder range: {formatCurrency(forecast.range.low)} to {formatCurrency(forecast.range.high)}, using the same remaining days in {forecast.historyMonths} completed {forecast.historyMonths === 1 ? 'month' : 'months'}. One-offs and scheduled bills are excluded from the variable baseline.</p>
		{:else}
			<p class="text-xs text-charcoal-muted mt-3">{forecast.variableMethod === 'pace' ? 'No historical baseline yet. Only ordinary recorded spending is projected by day.' : 'No historical baseline yet. This estimate includes only recorded activity and confirmed plans.'}</p>
		{/if}
		<p class="text-xs text-charcoal-muted mt-2">Unmatched overdue bills remain reserved. Future savings count as committed. This estimate does not predict your bank balance or payment timing.</p>
	</details>
	<a href="/planning" class="text-sm text-primary-600 font-medium inline-block">Plan a purchase or adjust commitments →</a>
</section>
