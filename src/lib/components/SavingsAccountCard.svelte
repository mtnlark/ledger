<script lang="ts">
	import { format } from 'date-fns';
	import { Plus, ChevronDown, ChevronUp, MoreVertical, Pencil, Trash2, Target, TrendingUp, AlertTriangle, Lightbulb, PartyPopper, CheckCircle2, ArrowUp, ArrowDown } from 'lucide-svelte';
	import type { SavingsAccount, SavingsContribution } from '$lib/db';
	import { formatCurrency, formatCurrencyWhole } from '$lib/utils/format-helpers';
	import { sumCurrency, calculatePercent } from '$lib/utils/currency';
	import { deleteSavingsAccount, completeGoal } from '$lib/stores/savingsAccounts';
	import { getGoalStatus, type GoalStatus } from '$lib/stores/savingsContributions';
	import { toast } from '$lib/stores/toast';

	interface Props {
		account: SavingsAccount;
		contributions: SavingsContribution[];
		onAddContribution: () => void;
		onEditContribution: (contribution: SavingsContribution) => void;
		onEditAccount: () => void;
		onAccountUpdated: () => void;
		onMoveUp?: () => void;
		onMoveDown?: () => void;
		isFirst?: boolean;
		isLast?: boolean;
		/** Optional monthly surplus (income - spending - savings). If provided, goals where surplus >= shortfall are marked achievable. */
		availableSurplus?: number;
	}

	let { account, contributions, onAddContribution, onEditContribution, onEditAccount, onAccountUpdated, onMoveUp, onMoveDown, isFirst = false, isLast = false, availableSurplus }: Props =
		$props();

	// Expand/collapse state for contributions list
	let isExpanded = $state(false);
	let showMenu = $state(false);

	// Total contributed this month
	let monthTotal = $derived(sumCurrency(contributions.map((c) => c.amount)));

	// Goal status (async, fetched on mount and when account changes)
	let goalStatus = $state<GoalStatus | null>(null);
	let hasGoal = $derived(account.targetAmount !== undefined && account.targetAmount > 0);
	let goalProgress = $derived(
		hasGoal && account.currentBalance !== undefined
			? Math.min(100, calculatePercent(account.currentBalance, account.targetAmount!))
			: 0
	);

	// Fetch goal status when account has a goal
	$effect(() => {
		if (hasGoal && account.id) {
			getGoalStatus(account.id, availableSurplus).then((status) => {
				goalStatus = status;
			});
		} else {
			goalStatus = null;
		}
	});

	// Format contribution source for display
	function formatSource(source: string): string {
		const labels: Record<string, string> = {
			bank_transfer: 'Bank Transfer',
			payroll_deduction: 'Payroll',
			interest: 'Interest',
			employer_match: 'Employer Match',
			other: 'Other'
		};
		return labels[source] || source;
	}

	// Get source badge color
	function getSourceColor(source: string): string {
		const colors: Record<string, string> = {
			bank_transfer: 'bg-primary-50 text-primary-700',
			payroll_deduction: 'bg-success-50 text-success-700',
			interest: 'bg-warning-50 text-warning-700',
			employer_match: 'bg-success-50 text-success-700',
			other: 'bg-surface-alt text-charcoal-soft'
		};
		return colors[source] || 'bg-surface-alt text-charcoal-soft';
	}

	async function handleDeleteAccount() {
		if (!account.id) return;
		if (!confirm(`Delete "${account.name}"? This cannot be undone.`)) return;

		try {
			await deleteSavingsAccount(account.id);
			onAccountUpdated();
			toast.success('Account deleted');
		} catch (error) {
			console.error('Failed to delete account:', error);
			toast.error('Failed to delete account');
		}
	}

	async function handleMarkComplete() {
		if (!account.id) return;

		try {
			await completeGoal(account.id);
			onAccountUpdated();
			toast.success('Goal completed! 🎉');
		} catch (error) {
			console.error('Failed to complete goal:', error);
			toast.error('Failed to complete goal');
		}
	}

	function toggleMenu(e: MouseEvent) {
		e.stopPropagation();
		showMenu = !showMenu;
	}

	function closeMenu() {
		showMenu = false;
	}
</script>

<svelte:window onclick={closeMenu} />

<div class="bg-surface rounded-lg shadow-sm shadow-theme">
	<!-- Account Header -->
	<div class="p-4 flex items-center gap-4">

		<!-- Account Info -->
		<div class="flex-1 min-w-0">
			<div class="flex items-center gap-2">
				<span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: {account.color};" aria-hidden="true"></span>
				<span class="font-medium text-charcoal truncate">{account.name}</span>
				<span
					class="text-xs px-2 py-0.5 rounded-full bg-surface-alt text-charcoal-muted capitalize"
				>
					{account.accountType}
				</span>
				{#if hasGoal}
					<span class="text-xs px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 flex items-center gap-1">
						<Target size={12} />
						Goal
					</span>
				{/if}
			</div>
			{#if account.accountType === 'savings' && account.currentBalance !== undefined}
				{#if hasGoal}
					<p class="text-sm text-charcoal-muted">
						<span class="font-mono">{formatCurrency(account.currentBalance)}</span>
						<span class="text-charcoal-muted"> / </span>
						<span class="font-mono">{formatCurrency(account.targetAmount!)}</span>
					</p>
				{:else}
					<p class="text-sm text-charcoal-muted">
						Balance: <span class="font-mono">{formatCurrency(account.currentBalance)}</span>
					</p>
				{/if}
			{:else}
				<p class="text-sm text-charcoal-muted">
					This month: <span class="font-mono">{formatCurrencyWhole(monthTotal)}</span>
				</p>
			{/if}
		</div>

		<!-- Month Total (for savings accounts) -->
		{#if account.accountType === 'savings'}
			<div class="text-right shrink-0">
				<p class="text-xs text-charcoal-muted">This month</p>
				<p class="font-mono font-medium text-charcoal">{formatCurrencyWhole(monthTotal)}</p>
			</div>
		{/if}

		<!-- Actions -->
		<div class="flex items-center gap-1 shrink-0">
			<button
				onclick={onAddContribution}
				class="p-2 text-charcoal-muted hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
				title="Add contribution"
			>
				<Plus size={18} />
			</button>

			{#if contributions.length > 0}
				<button
					onclick={() => (isExpanded = !isExpanded)}
					class="p-2 text-charcoal-muted hover:text-charcoal hover:bg-surface-hover rounded-lg transition-colors"
					title={isExpanded ? 'Collapse' : 'Expand'}
				>
					{#if isExpanded}
						<ChevronUp size={18} />
					{:else}
						<ChevronDown size={18} />
					{/if}
				</button>
			{/if}

			<!-- Menu -->
			<div class="relative">
				<button
					onclick={toggleMenu}
					class="p-2 text-charcoal-muted hover:text-charcoal hover:bg-surface-hover rounded-lg transition-colors"
					title="More options"
				>
					<MoreVertical size={18} />
				</button>
				{#if showMenu}
					<div
						class="absolute right-0 top-full mt-1 bg-surface rounded-lg shadow-lg shadow-theme border border-theme py-1 min-w-32 z-10"
					>
						<button
							onclick={() => { closeMenu(); onEditAccount(); }}
							class="w-full px-4 py-2 text-left text-sm text-charcoal hover:bg-surface-hover flex items-center gap-2"
						>
							<Pencil size={14} />
							Edit Account
						</button>
						{#if onMoveUp}
							<button
								onclick={() => { closeMenu(); onMoveUp?.(); }}
								disabled={isFirst}
								class="w-full px-4 py-2 text-left text-sm text-charcoal hover:bg-surface-hover flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
							>
								<ArrowUp size={14} />
								Move Up
							</button>
						{/if}
						{#if onMoveDown}
							<button
								onclick={() => { closeMenu(); onMoveDown?.(); }}
								disabled={isLast}
								class="w-full px-4 py-2 text-left text-sm text-charcoal hover:bg-surface-hover flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
							>
								<ArrowDown size={14} />
								Move Down
							</button>
						{/if}
						<button
							onclick={handleDeleteAccount}
							class="w-full px-4 py-2 text-left text-sm text-danger-600 hover:bg-danger-50 flex items-center gap-2"
						>
							<Trash2 size={14} />
							Delete Account
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Goal Progress Section -->
	{#if hasGoal && account.accountType === 'savings'}
		<div class="px-4 pb-4 -mt-1">
			<!-- Progress Bar -->
			<div class="relative h-2 bg-surface-alt rounded-full overflow-hidden">
				<div
					class="absolute inset-y-0 left-0 rounded-full transition-all duration-300 {goalStatus?.severity === 'completed' || goalStatus?.severity === 'on_track' || goalStatus?.severity === 'achievable' ? 'bg-success-500' : goalStatus?.severity === 'behind' ? 'bg-primary-400' : 'bg-warning-500'}"
					style="width: {goalProgress}%"
				></div>
			</div>

			<!-- Goal Status -->
			<div class="mt-2 flex items-center justify-between text-xs">
				<div class="text-charcoal-muted">
					<span class="font-mono">{Math.round(goalProgress)}%</span> complete
					{#if account.targetDate && goalStatus?.severity !== 'deadline_passed' && goalStatus?.severity !== 'completed'}
						· Goal: {format(account.targetDate, 'MMM d, yyyy')}
					{/if}
				</div>

				{#if goalStatus}
					{#if goalStatus.severity === 'completed'}
						<span class="text-success-600 flex items-center gap-1">
							<PartyPopper size={12} />
							Goal reached!
						</span>
					{:else if goalStatus.severity === 'on_track'}
						<span class="text-success-600 flex items-center gap-1">
							<CheckCircle2 size={12} />
							On track
							{#if goalStatus.recommendedMonthly > 0}
								· {formatCurrencyWhole(goalStatus.recommendedMonthly)}/mo needed
							{/if}
						</span>
					{:else if goalStatus.severity === 'achievable'}
						<span class="text-success-600 flex items-center gap-1">
							<TrendingUp size={12} />
							Achievable
							{#if goalStatus.recommendedMonthly > 0}
								· {formatCurrencyWhole(goalStatus.recommendedMonthly)}/mo needed
							{/if}
						</span>
					{:else if goalStatus.severity === 'behind' || goalStatus.severity === 'significantly_behind'}
						<span class="{goalStatus.severity === 'significantly_behind' ? 'text-warning-600' : 'text-charcoal-soft'} flex items-center gap-1">
							{#if goalStatus.severity === 'significantly_behind'}
								<AlertTriangle size={12} />
							{:else}
								<Lightbulb size={12} />
							{/if}
							{#if goalStatus.recommendedMonthly > 0}
								{formatCurrencyWhole(goalStatus.recommendedMonthly)}/mo needed
							{:else}
								Start saving to track progress
							{/if}
						</span>
					{:else if goalStatus.severity === 'deadline_passed'}
						<span class="text-warning-600 flex items-center gap-1">
							<AlertTriangle size={12} />
							Deadline passed
						</span>
					{/if}
				{/if}
			</div>

			<!-- Mark Complete Button (for completed goals) -->
			{#if goalStatus?.severity === 'completed'}
				<button
					onclick={handleMarkComplete}
					class="mt-2 w-full py-1.5 px-3 bg-success-50 text-success-700 text-xs font-medium rounded-lg hover:bg-success-100 transition-colors flex items-center justify-center gap-1.5"
				>
					<CheckCircle2 size={14} />
					Mark Complete
				</button>
			{/if}
		</div>
	{/if}

	<!-- Set Goal Link (for savings accounts without goals) -->
	{#if !hasGoal && account.accountType === 'savings'}
		<div class="px-4 pb-4 -mt-2">
			<button
				onclick={onEditAccount}
				class="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
			>
				<Target size={12} />
				Set a goal →
			</button>
		</div>
	{/if}

	<!-- Contributions List (expanded) -->
	{#if isExpanded && contributions.length > 0}
		<div class="border-t border-dashed border-theme-dashed">
			<ul class="divide-y divide-dashed divide-theme-dashed">
				{#each contributions as contribution (contribution.id)}
					<li>
						<button
							onclick={() => onEditContribution(contribution)}
							class="w-full px-4 py-3 flex items-center gap-4 hover:bg-surface-hover transition-colors text-left"
						>
							<span class="text-sm text-charcoal-muted w-20 shrink-0">
								{format(new Date(contribution.date), 'MMM d')}
							</span>
							<span class="text-xs px-2 py-0.5 rounded-full {getSourceColor(contribution.source)}">
								{formatSource(contribution.source)}
							</span>
							<span class="flex-1 text-sm text-charcoal-muted truncate">
								{contribution.notes || ''}
							</span>
							<span class="font-mono text-sm text-charcoal font-medium">
								{formatCurrency(contribution.amount)}
							</span>
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
