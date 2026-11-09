<script lang="ts">
	import { groupContributionsByAccount } from '$lib/utils/contribution-grouping';
	import { onMount, onDestroy } from 'svelte';
	import { summarizeSavings } from '$lib/utils/savings-summary';
	import UseSavingsModal from '$lib/components/UseSavingsModal.svelte';
	import { afterNavigate } from '$app/navigation';
	import { getMonthKey, type SavingsAccount, type SavingsContribution } from '$lib/db';
	import { initializeStorage } from '$lib/storage';
	import { getAllSavingsAccounts, moveSavingsAccountUp, moveSavingsAccountDown } from '$lib/stores/savingsAccounts';
	import {
		getAllContributionsForMonth
	} from '$lib/stores/savingsContributions';
	import { getBudgetForMonth } from '$lib/stores/budget';
	import { getSelectedMonth, setSelectedMonth } from '$lib/stores/selectedMonth';
	import { getAvailableMonths } from '$lib/stores/transactions';
	import { toast } from '$lib/stores/toast';
	import { formatCurrencyWhole, formatPercentage } from '$lib/utils/format-helpers';
	import { Plus } from 'lucide-svelte';
	import MonthPicker from '$lib/components/MonthPicker.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import SavingsAccountCard from '$lib/components/SavingsAccountCard.svelte';
	import AddContributionModal from '$lib/components/AddContributionModal.svelte';
	import EditContributionModal from '$lib/components/EditContributionModal.svelte';
	import AddAccountModal from '$lib/components/AddAccountModal.svelte';
	import EditAccountModal from '$lib/components/EditAccountModal.svelte';

	// State
	let isLoading = $state(true);
	let hasLoadedOnce = false;
	let accounts = $state<SavingsAccount[]>([]);
	let contributions = $state<SavingsContribution[]>([]);
	let currentMonth = $state(getMonthKey(new Date()));
	let availableMonths = $state<string[]>([getMonthKey(new Date())]);
	let monthlyIncome = $state(0);

	// Modal state
	let showUseSavings = $state(false);
	let showAddContribution = $state(false);
	let showEditContribution = $state(false);
	let showAddAccount = $state(false);
	let showEditAccount = $state(false);
	let selectedContribution = $state<SavingsContribution | null>(null);
	let selectedAccount = $state<SavingsAccount | null>(null);
	let preselectedAccountId = $state<number | undefined>(undefined);

	let summary = $derived(summarizeSavings(contributions));
	let totalSavedThisMonth = $derived(summary.netSaved);
	let totalAffectingAvailable = $derived(summary.netCashSaved);
	let savingsRate = $derived(monthlyIncome > 0 ? totalAffectingAvailable / monthlyIncome : 0);

	// Group contributions by account
	let contributionsByAccount = $derived(groupContributionsByAccount(contributions));

	let refreshGeneration = 0;
	let destroyed = false;
	onDestroy(() => { destroyed = true; refreshGeneration++; });
	async function loadData(month = getSelectedMonth()) {
		const generation = ++refreshGeneration;
		const isCurrent = () => !destroyed && generation === refreshGeneration && month === getSelectedMonth();
		if (!hasLoadedOnce) isLoading = true;
		try {
			await initializeStorage();
			const [accountList, contribList, budget, months] = await Promise.all([
				getAllSavingsAccounts(), getAllContributionsForMonth(month), getBudgetForMonth(month), getAvailableMonths()
			]);
			if (!isCurrent()) return;
			accounts = accountList; contributions = contribList; monthlyIncome = budget?.income ?? 0;
			currentMonth = month;
			availableMonths = months.includes(month) ? months : [month, ...months].sort().reverse();
		} catch (error) {
			if (isCurrent()) toast.error('Could not refresh savings');
		} finally {
			if (isCurrent()) { isLoading = false; hasLoadedOnce = true; }
		}
	}
	const loadMonthData = loadData;
	onMount(() => {
		void loadData();
		const handler = () => void loadData();
		window.addEventListener('ledger:transactions-changed', handler);
		return () => window.removeEventListener('ledger:transactions-changed', handler);
	});
	async function handleMonthChange(month: string) {
		setSelectedMonth(month);
		await loadData(month);
	}

	function handleAddContribution(accountId?: number) {
		preselectedAccountId = accountId;
		showAddContribution = true;
	}

	function handleEditContribution(contribution: SavingsContribution) {
		selectedContribution = contribution;
		if (contribution.kind === 'withdrawal') showUseSavings = true;
		else showEditContribution = true;
	}

	async function handleContributionSaved() {
		showUseSavings = false;
		showAddContribution = false;
		showEditContribution = false;
		selectedContribution = null;
		preselectedAccountId = undefined;
		await loadMonthData(getSelectedMonth());
		toast.success('Savings activity saved');
	}

	async function handleContributionDeleted() {
		showUseSavings = false;
		showEditContribution = false;
		selectedContribution = null;
		await loadMonthData(getSelectedMonth());
		toast.success('Savings activity deleted');
	}

	async function handleAccountAdded() {
		showAddAccount = false;
		await loadMonthData(getSelectedMonth());
		toast.success('Account added');
	}

	async function handleMoveUp(id: number) {
		try {
			await moveSavingsAccountUp(id);
			await loadMonthData(getSelectedMonth());
		} catch (error) {
			toast.error('Failed to move account');
		}
	}

	async function handleMoveDown(id: number) {
		try {
			await moveSavingsAccountDown(id);
			await loadMonthData(getSelectedMonth());
		} catch (error) {
			toast.error('Failed to move account');
		}
	}

	function handleEditAccount(account: SavingsAccount) {
		selectedAccount = account;
		showEditAccount = true;
	}

	async function handleAccountUpdated() {
		showEditAccount = false;
		selectedAccount = null;
		await loadMonthData(getSelectedMonth());
		toast.success('Account updated');
	}

	async function handleAccountDeleted() {
		showEditAccount = false;
		selectedAccount = null;
		await loadMonthData(getSelectedMonth());
		toast.success('Account deleted');
	}

	// Reload data on navigation
	afterNavigate(({ from }) => {
		if (from !== null) void loadData();
	});
</script>

<svelte:head>
	<title>Savings | Ledger</title>
</svelte:head>

<div class="min-h-screen">
	<main class="max-w-6xl mx-auto px-6 py-6" aria-live="polite">
		<!-- Title + month picker -->
		<div class="flex items-center justify-between mb-5">
			<h1 class="font-display text-2xl font-medium text-charcoal">Savings</h1>
			<MonthPicker {currentMonth} {availableMonths} onMonthChange={handleMonthChange} />
		</div>
		{#if isLoading}
			<!-- Loading Skeleton -->
			<div class="space-y-6">
				<!-- Summary skeleton -->
				<div class="bg-surface rounded-xl shadow-md shadow-theme p-6">
					<Skeleton width="40%" height="1.5rem" class="mb-4" />
					<div class="flex gap-8">
						<Skeleton width="120px" height="2rem" />
						<Skeleton width="120px" height="2rem" />
					</div>
				</div>

				<!-- List skeleton -->
				<div class="space-y-3">
					{#each { length: 3 } as _, index (index)}
						<div class="bg-surface rounded-lg shadow-sm shadow-theme p-4">
							<div class="flex items-center gap-4">
								<Skeleton width="48px" height="48px" class="rounded-lg" />
								<div class="flex-1">
									<Skeleton width="60%" height="1rem" class="mb-2" />
									<Skeleton width="40%" height="0.875rem" />
								</div>
								<Skeleton width="80px" height="1.5rem" />
							</div>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_330px] gap-6 items-start">
				<!-- Main column: accounts -->
				<div class="min-w-0 space-y-4 order-last lg:order-none">
				<!-- Quick Actions -->
				<div class="flex flex-wrap gap-3">
				<button class="px-4 py-2 rounded-lg bg-surface-alt text-charcoal-soft hover:bg-surface-hover" onclick={() => { selectedContribution = null; preselectedAccountId = undefined; showUseSavings = true; }}>Use savings</button>
					<button
						onclick={() => handleAddContribution()}
						class="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm
							bg-primary-500 text-white hover:bg-primary-600 transition-colors"
					>
						<Plus size={16} />
						Add Contribution
					</button>
					<button
						onclick={() => (showAddAccount = true)}
						class="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm
							bg-surface-alt text-charcoal-soft hover:bg-surface-hover transition-colors"
					>
						<Plus size={16} />
						Add Account
					</button>
				</div>

				<!-- Accounts List -->
				{#if accounts.length === 0}
					<div class="bg-surface rounded-xl shadow-md shadow-theme p-8 text-center">
						<p class="text-charcoal-muted mb-4">No savings accounts yet.</p>
						<button
							onclick={() => (showAddAccount = true)}
							class="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm
								bg-primary-500 text-white hover:bg-primary-600 transition-colors"
						>
							<Plus size={16} />
							Add Your First Account
						</button>
					</div>
				{:else}
					<div class="space-y-3">
						{#each accounts as account, index (account.id)}
							<SavingsAccountCard
								{account}
								contributions={contributionsByAccount.get(account.id!) || []}
								onAddContribution={() => handleAddContribution(account.id)}
								onUseSavings={() => { selectedContribution = null; preselectedAccountId = account.id; showUseSavings = true; }}
								onEditContribution={handleEditContribution}
								onEditAccount={() => handleEditAccount(account)}
								onAccountUpdated={() => loadMonthData(currentMonth)}
							onMoveUp={() => handleMoveUp(account.id!)}
							onMoveDown={() => handleMoveDown(account.id!)}
							isFirst={index === 0}
							isLast={index === accounts.length - 1}
						/>
						{/each}
					</div>
				{/if}
				</div>

				<!-- Right rail: summary -->
				<aside class="space-y-4 lg:sticky lg:top-6">
				<!-- Summary Card -->
				<div class="bg-surface rounded-xl shadow-md shadow-theme p-5">
					<h2 class="text-xs font-medium uppercase tracking-wider text-charcoal-muted mb-4">Savings Summary</h2>
					<div class="space-y-4">
						<div><span class="text-sm text-charcoal-muted">Added to savings</span><p class="font-mono text-xl">{formatCurrencyWhole(summary.added)}</p></div>
						<div><span class="text-sm text-charcoal-muted">Used from savings</span><p class="font-mono text-xl">{formatCurrencyWhole(summary.withdrawals)}</p></div>
						<div>
							<span class="text-sm text-charcoal-muted">Net saved</span>
							<p class="font-mono text-xl font-medium {totalSavedThisMonth > 0 ? 'text-success-600' : 'text-charcoal'}">
								{formatCurrencyWhole(totalSavedThisMonth)}
							</p>
						</div>
						{#if monthlyIncome > 0}
							<div>
								<span class="text-sm text-charcoal-muted">Net savings rate</span>
								<p class="font-mono text-xl font-medium text-charcoal">
									{formatPercentage(savingsRate)}
								</p>
								<p class="text-xs text-charcoal-muted mt-0.5">
									of {formatCurrencyWhole(monthlyIncome)} income
								</p>
							</div>
						{/if}
						{#if totalAffectingAvailable !== totalSavedThisMonth}
							<div>
								<span class="text-sm text-charcoal-muted">Net saved from take-home</span>
								<p class="font-mono text-xl font-medium text-charcoal">
									{formatCurrencyWhole(totalAffectingAvailable)}
								</p>
								<p class="text-xs text-charcoal-muted mt-0.5">
									negative means more used than added
								</p>
							</div>
						{/if}
					</div>
				</div>
				</aside>
			</div>
		{/if}
	</main>
</div>

<!-- Modals -->
<AddContributionModal
	isOpen={showAddContribution}
	{accounts}
	{currentMonth}
	preselectedAccountId={preselectedAccountId}
	onSave={handleContributionSaved}
	onClose={() => {
		showAddContribution = false;
		preselectedAccountId = undefined;
	}}
/>

<EditContributionModal
	isOpen={showEditContribution}
	contribution={selectedContribution}
	{accounts}
	onSave={handleContributionSaved}
	onDelete={handleContributionDeleted}
	onClose={() => {
		showEditContribution = false;
		selectedContribution = null;
	}}
/>

<AddAccountModal
	isOpen={showAddAccount}
	onSave={handleAccountAdded}
	onClose={() => (showAddAccount = false)}
/>

<EditAccountModal
	isOpen={showEditAccount}
	account={selectedAccount}
	onSave={handleAccountUpdated}
	onDelete={handleAccountDeleted}
	onClose={() => {
		showEditAccount = false;
		selectedAccount = null;
	}}
/>

<UseSavingsModal isOpen={showUseSavings} {accounts} {preselectedAccountId} contribution={selectedContribution} onSave={handleContributionSaved} onDelete={handleContributionDeleted} onClose={() => { showUseSavings = false; selectedContribution = null; }} />
