<script lang="ts">
	import { format } from 'date-fns';
	import { ArrowRight, Target, TrendingUp, AlertTriangle, PartyPopper } from 'lucide-svelte';
	import type { SavingsAccount, SavingsContribution, MonthlyBudget } from '$lib/db';
	import { parseMonthKey, getMonthKey } from '$lib/db';
	import { formatCurrency, formatCurrencyWhole } from '$lib/utils/format-helpers';
	import { sumCurrency, calculatePercent } from '$lib/utils/currency';
	import { getGoalStatus, type GoalStatus } from '$lib/stores/savingsContributions';
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

	// Goal tracking state
	interface AccountGoalInfo {
		account: SavingsAccount;
		status: GoalStatus;
		progress: number;
	}
	let goalInfos = $state<AccountGoalInfo[]>([]);

	// Accounts with goals
	let accountsWithGoals = $derived(
		accounts.filter((a) => a.targetAmount !== undefined && a.targetAmount > 0)
	);

	// Fetch goal statuses when accounts change
	$effect(() => {
		if (accountsWithGoals.length > 0) {
			Promise.all(
				accountsWithGoals.map(async (account) => {
					const status = await getGoalStatus(account.id!);
					if (status) {
						const progress = account.currentBalance !== undefined
							? Math.min(100, calculatePercent(account.currentBalance, account.targetAmount!))
							: 0;
						return { account, status, progress };
					}
					return null;
				})
			).then((results) => {
				goalInfos = results.filter((r): r is AccountGoalInfo => r !== null);
			});
		} else {
			goalInfos = [];
		}
	});

	// Goal summary stats
	let completedGoals = $derived(goalInfos.filter((g) => g.progress >= 100));
	let onTrackGoals = $derived(goalInfos.filter((g) => g.progress < 100 && g.status.isOnTrack));
	let offTrackGoals = $derived(goalInfos.filter((g) => g.progress < 100 && !g.status.isOnTrack));

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
			{/if}

			<!-- Goal Progress Section -->
			{#if goalInfos.length > 0}
				<div>
					<div class="flex items-center justify-between mb-3">
						<h3 class="text-sm font-medium text-charcoal-soft flex items-center gap-2">
							<Target size={14} class="text-primary-500" />
							Goal Progress
						</h3>
						<a
							href="/savings"
							class="text-xs text-primary-600 hover:text-primary-700 font-medium"
						>
							Manage goals
						</a>
					</div>

					<!-- Summary Stats -->
					<div class="grid grid-cols-3 gap-3 mb-4">
						{#if completedGoals.length > 0}
							<div class="bg-success-50 border border-success-200 rounded-lg p-3 text-center">
								<div class="flex items-center justify-center gap-1 text-success-600">
									<PartyPopper size={16} />
									<span class="font-mono text-lg font-medium">{completedGoals.length}</span>
								</div>
								<p class="text-xs text-success-700">Completed</p>
							</div>
						{/if}
						{#if onTrackGoals.length > 0}
							<div class="bg-success-50 border border-success-200 rounded-lg p-3 text-center">
								<div class="flex items-center justify-center gap-1 text-success-600">
									<TrendingUp size={16} />
									<span class="font-mono text-lg font-medium">{onTrackGoals.length}</span>
								</div>
								<p class="text-xs text-success-700">On track</p>
							</div>
						{/if}
						{#if offTrackGoals.length > 0}
							<div class="bg-warning-50 border border-warning-200 rounded-lg p-3 text-center">
								<div class="flex items-center justify-center gap-1 text-warning-600">
									<AlertTriangle size={16} />
									<span class="font-mono text-lg font-medium">{offTrackGoals.length}</span>
								</div>
								<p class="text-xs text-warning-700">Behind pace</p>
							</div>
						{/if}
					</div>

					<!-- Individual Goal Cards -->
					<div class="space-y-3">
						{#each goalInfos as { account, status, progress }}
							<div class="bg-surface-alt rounded-lg p-3 border border-theme">
								<div class="flex items-center gap-3 mb-2">
									<div
										class="w-8 h-8 rounded-lg flex items-center justify-center text-lg shrink-0"
										style="background-color: {account.color}20"
									>
										{account.icon || '💰'}
									</div>
									<div class="flex-1 min-w-0">
										<span class="text-sm font-medium text-charcoal truncate block">{account.name}</span>
										<span class="text-xs text-charcoal-muted">
											{formatCurrency(account.currentBalance ?? 0)} / {formatCurrency(account.targetAmount!)}
										</span>
									</div>
									<div class="text-right shrink-0">
										<span class="font-mono text-sm font-medium text-charcoal">
											{Math.round(progress)}%
										</span>
									</div>
								</div>

								<!-- Progress Bar -->
								<div class="relative h-2 bg-surface rounded-full overflow-hidden mb-2">
									<div
										class="absolute inset-y-0 left-0 rounded-full transition-all duration-300 {progress >= 100 ? 'bg-success-500' : status.isOnTrack ? 'bg-success-500' : 'bg-warning-500'}"
										style="width: {progress}%"
									></div>
								</div>

								<!-- Status Text -->
								<div class="text-xs">
									{#if progress >= 100}
										<span class="text-success-600">🎉 Goal reached!</span>
									{:else if status.isOnTrack}
										<span class="text-success-600">
											{#if status.projectedCompletion}
												On track to complete by {format(status.projectedCompletion, 'MMM yyyy')}
											{:else}
												On track
											{/if}
										</span>
									{:else}
										<span class="text-warning-600">
											{#if status.recommendedMonthly > 0}
												Save {formatCurrencyWhole(status.recommendedMonthly)}/mo to reach goal
												{#if account.targetDate}
													by {format(account.targetDate, 'MMM yyyy')}
												{/if}
											{:else}
												Behind pace
											{/if}
										</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			{#if contributions.length > 0}
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
