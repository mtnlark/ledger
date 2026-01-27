<script lang="ts">
	import { format } from 'date-fns';
	import { ArrowRight } from 'lucide-svelte';
	import type { SavingsAccount, SavingsContribution, MonthlyBudget } from '$lib/db';
	import { parseMonthKey, getMonthKey } from '$lib/db';
	import { formatCurrency, formatCurrencyWhole } from '$lib/utils/format-helpers';
	import { sumCurrency } from '$lib/utils/currency';
	import InsightGroup from './InsightGroup.svelte';
	import SavingsRateTrendChart from './SavingsRateTrendChart.svelte';

	interface Props {
		currentMonth: string;
		contributions: SavingsContribution[];
		accounts: SavingsAccount[];
		budget: MonthlyBudget | null;
		/** All contributions for trend chart */
		allContributions: SavingsContribution[];
		/** All budgets for income data in trend chart */
		allBudgets: MonthlyBudget[];
	}

	let {
		currentMonth,
		contributions,
		accounts,
		budget,
		allContributions,
		allBudgets
	}: Props = $props();

	// Check if viewing current month
	let isCurrentMonth = $derived(currentMonth === getMonthKey(new Date()));

	// Month display
	let monthDisplay = $derived(format(parseMonthKey(currentMonth), 'MMMM yyyy'));

	// Total saved this month
	let totalSaved = $derived(sumCurrency(contributions.map((c) => c.amount)));

	// Contributions that affect available (bank_transfer, other)
	let contributionsAffectingAvailable = $derived(
		contributions.filter((c) => c.source === 'bank_transfer' || c.source === 'other')
	);
	let totalAffectingAvailable = $derived(
		sumCurrency(contributionsAffectingAvailable.map((c) => c.amount))
	);

	// Savings rate (contributions affecting available / income)
	let savingsRate = $derived(
		budget && budget.income > 0 ? totalAffectingAvailable / budget.income : null
	);

	// Group contributions by account
	let byAccount = $derived.by(() => {
		const map = new Map<number, { account: SavingsAccount; total: number; count: number }>();
		for (const c of contributions) {
			const existing = map.get(c.accountId);
			if (existing) {
				existing.total += c.amount;
				existing.count += 1;
			} else {
				const account = accounts.find((a) => a.id === c.accountId);
				if (account) {
					map.set(c.accountId, { account, total: c.amount, count: 1 });
				}
			}
		}
		return Array.from(map.values()).sort((a, b) => b.total - a.total);
	});

	// Group contributions by source
	let bySource = $derived.by(() => {
		const map = new Map<string, number>();
		for (const c of contributions) {
			map.set(c.source, (map.get(c.source) || 0) + c.amount);
		}
		return Array.from(map.entries())
			.map(([source, total]) => ({ source, total }))
			.sort((a, b) => b.total - a.total);
	});

	// Source labels
	const sourceLabels: Record<string, string> = {
		bank_transfer: 'Bank Transfer',
		payroll_deduction: 'Payroll',
		interest: 'Interest',
		employer_match: 'Employer Match',
		other: 'Other'
	};
</script>

<InsightGroup
	title="Savings This Month"
	description={isCurrentMonth ? 'Current month savings' : monthDisplay}
	defaultExpanded={true}
>
	{#snippet preview()}
		<div class="flex items-center justify-between">
			<div>
				<p class="font-mono text-2xl font-medium text-success-600">
					{formatCurrencyWhole(totalSaved)}
				</p>
				<p class="text-sm text-charcoal-muted">
					{contributions.length} contribution{contributions.length !== 1 ? 's' : ''}
				</p>
			</div>
			{#if savingsRate !== null}
				<div class="text-right">
					<p class="font-mono text-lg font-medium text-charcoal">
						{(savingsRate * 100).toFixed(0)}%
					</p>
					<p class="text-sm text-charcoal-muted">savings rate</p>
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet children()}
		<div class="space-y-6">
			{#if contributions.length === 0}
				<!-- Empty state -->
				<div class="text-center py-6">
					<p class="text-charcoal-muted mb-3">No savings contributions this month</p>
					<a
						href="/savings"
						class="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium"
					>
						Add a contribution
						<ArrowRight size={14} />
					</a>
				</div>
			{:else}
				<!-- By Account Breakdown -->
				<div class="bg-cream-dark rounded-lg p-4 border border-dashed border-theme">
					<div class="flex items-center justify-between mb-3">
						<h3 class="text-sm font-medium text-charcoal-soft">By Account</h3>
						<a
							href="/savings"
							class="text-xs text-primary-600 hover:text-primary-700 font-medium"
						>
							View all
						</a>
					</div>
					<div class="space-y-3">
						{#each byAccount as { account, total, count }}
							<div class="flex items-center gap-3">
								<div
									class="w-8 h-8 rounded-lg flex items-center justify-center text-lg shrink-0"
									style="background-color: {account.color}20"
								>
									{account.icon || '💰'}
								</div>
								<div class="flex-1 min-w-0">
									<div class="flex items-baseline justify-between">
										<span class="text-sm font-medium text-charcoal truncate">{account.name}</span>
										<span class="font-mono text-sm text-charcoal ml-2">{formatCurrency(total)}</span>
									</div>
									<p class="text-xs text-charcoal-muted">
										{count} contribution{count !== 1 ? 's' : ''}
									</p>
								</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- By Source Breakdown (if multiple sources) -->
				{#if bySource.length > 1}
					<div>
						<h3 class="text-sm font-medium text-charcoal-soft mb-3">By Source</h3>
						<div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
							{#each bySource as { source, total }}
								<div class="bg-surface-alt rounded-lg p-3 text-center">
									<p class="font-mono text-lg font-medium text-charcoal">
										{formatCurrencyWhole(total)}
									</p>
									<p class="text-xs text-charcoal-muted">{sourceLabels[source] || source}</p>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Affect on Available -->
				{#if totalAffectingAvailable !== totalSaved}
					<div class="bg-surface-alt rounded-lg p-4 border border-theme">
						<div class="flex items-baseline justify-between">
							<span class="text-sm text-charcoal-soft">Reduces available to spend</span>
							<span class="font-mono font-medium text-charcoal">
								{formatCurrency(totalAffectingAvailable)}
							</span>
						</div>
						<p class="text-xs text-charcoal-muted mt-1">
							Payroll deductions and employer matches don't affect your available spending
						</p>
					</div>
				{/if}
			{/if}

			<!-- Savings Rate Trend -->
			{#if allBudgets.length > 0 && allContributions.length > 0}
				<div>
					<h3 class="text-sm font-medium text-charcoal-soft mb-3">Savings Rate Over Time</h3>
					<SavingsRateTrendChart
						contributions={allContributions}
						budgets={allBudgets}
					/>
				</div>
			{/if}
		</div>
	{/snippet}
</InsightGroup>
