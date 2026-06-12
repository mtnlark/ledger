<script lang="ts">
	import { format } from 'date-fns';
	import type { LinkedAccount, BalanceSnapshot } from '$lib/db';
	import { buildNetWorthSeries, netWorthMilestones, type NetWorthPoint } from '$lib/utils/net-worth';
	import { formatCurrency, formatCurrencyWhole } from '$lib/utils/format-helpers';
	import { roundCurrency, calculatePercent } from '$lib/utils/currency';

	interface Props {
		accounts: LinkedAccount[];
		snapshots: BalanceSnapshot[];
		/** Year to summarize (defaults to the current calendar year). */
		year?: number;
	}

	let { accounts, snapshots, year = new Date().getFullYear() }: Props = $props();

	let series = $derived(buildNetWorthSeries(snapshots, accounts));

	let yearStats = $derived.by(() => {
		// Clamp to points up to the end of the selected year so past years
		// show that year's closing position, not today's
		const inWindow = series.filter((p) => p.date <= `${year}-12-31`);
		if (inWindow.length < 2) return null;
		const latest = inWindow[inWindow.length - 1];
		// Baseline: last point of the prior year, or the first point on record
		// (then the delta is labeled "since <month>")
		let baseline: NetWorthPoint = inWindow[0];
		for (const point of inWindow) {
			if (point.date <= `${year - 1}-12-31`) baseline = point;
			else break;
		}
		const sinceStartOfYear = baseline.date <= `${year - 1}-12-31`;
		if (latest.date === baseline.date) return null;
		const delta = roundCurrency(latest.total - baseline.total);
		const percent = baseline.total > 0 ? calculatePercent(delta, baseline.total, true) : null;
		const milestones = netWorthMilestones(inWindow).filter((m) => m.date >= `${year}-01-01`);
		return { latest, baseline, delta, percent, sinceStartOfYear, milestones };
	});
</script>

{#if yearStats}
	<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
		<div class="px-6 py-4">
			<h2 class="font-display text-xl font-medium text-charcoal">Net Worth</h2>
			<p class="text-sm text-charcoal-muted mt-0.5">
				{yearStats.sinceStartOfYear
					? `Since the start of ${year}`
					: `Since ${format(new Date(`${yearStats.baseline.date}T12:00:00`), 'MMMM yyyy')}`}
			</p>
		</div>
		<div class="px-6 pb-5 space-y-3">
			<div class="flex items-baseline gap-3">
				<p class="font-mono text-3xl font-medium {yearStats.delta >= 0 ? 'text-success-600' : 'text-charcoal'}">
					{yearStats.delta >= 0 ? '+' : '−'}{formatCurrencyWhole(Math.abs(yearStats.delta))}
				</p>
				{#if yearStats.percent !== null}
					<span class="font-mono text-sm text-charcoal-muted">
						{yearStats.delta >= 0 ? '+' : '−'}{Math.abs(yearStats.percent)}%
					</span>
				{/if}
			</div>
			<div class="flex items-baseline">
				<span class="text-charcoal-soft text-sm">Now</span>
				<span class="ledger-line"></span>
				<span class="font-mono text-charcoal">{formatCurrency(yearStats.latest.total)}</span>
			</div>
			<div class="flex items-baseline">
				<span class="text-charcoal-soft text-sm">Then</span>
				<span class="ledger-line"></span>
				<span class="font-mono text-charcoal-soft">{formatCurrency(yearStats.baseline.total)}</span>
			</div>
			{#if yearStats.milestones.length > 0}
				{@const latestMilestone = yearStats.milestones[yearStats.milestones.length - 1]}
				<p class="text-sm text-success-600 pt-1">
					🎉 Crossed {formatCurrencyWhole(latestMilestone.amount)} in
					{format(new Date(`${latestMilestone.date}T12:00:00`), 'MMMM')}
				</p>
			{/if}
		</div>
	</div>
{/if}
