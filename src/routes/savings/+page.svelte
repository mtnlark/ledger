<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { format } from 'date-fns';
	import { getMonthKey, type SavingsAccount, type SavingsContribution } from '$lib/db';
	import { initializeStorage } from '$lib/storage';
	import { getAllSavingsAccounts, moveSavingsAccountUp, moveSavingsAccountDown } from '$lib/stores/savingsAccounts';
	import {
		getAllContributionsForMonth,
		getTotalSavedForMonth,
		getContributionsAffectingAvailable
	} from '$lib/stores/savingsContributions';
	import { getBudgetForMonth } from '$lib/stores/budget';
	import { getSelectedMonth, setSelectedMonth } from '$lib/stores/selectedMonth';
	import { getAvailableMonths } from '$lib/stores/transactions';
	import { toast } from '$lib/stores/toast';
	import { formatCurrency, formatCurrencyWhole } from '$lib/utils/format-helpers';
	import { sumCurrency } from '$lib/utils/currency';
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
	let showAddContribution = $state(false);
	let showEditContribution = $state(false);
	let showAddAccount = $state(false);
	let showEditAccount = $state(false);
	let selectedContribution = $state<SavingsContribution | null>(null);
	let selectedAccount = $state<SavingsAccount | null>(null);
	let preselectedAccountId = $state<number | undefined>(undefined);

	// Summary calculations
	let totalSavedThisMonth = $derived(sumCurrency(contributions.map((c) => c.amount)));

	// Get contributions that affect available (bank_transfer, other)
	let contributionsAffectingAvailable = $derived(
		contributions.filter((c) => c.source === 'bank_transfer' || c.source === 'other')
	);
	let totalAffectingAvailable = $derived(
		sumCurrency(contributionsAffectingAvailable.map((c) => c.amount))
	);

	// Savings rate (contributions affecting available / income)
	let savingsRate = $derived(monthlyIncome > 0 ? totalAffectingAvailable / monthlyIncome : 0);

	// Group contributions by account
	let contributionsByAccount = $derived.by(() => {
		const map = new Map<number, SavingsContribution[]>();
		for (const c of contributions) {
			const existing = map.get(c.accountId) || [];
			map.set(c.accountId, [...existing, c]);
		}
		return map;
	});

	// Load data
	async function loadData() {
		if (!hasLoadedOnce) isLoading = true;
		try {
			await initializeStorage();
			currentMonth = getSelectedMonth();
			availableMonths = await getAvailableMonths();

			// Ensure current month is in the list
			if (!availableMonths.includes(currentMonth)) {
				availableMonths = [currentMonth, ...availableMonths].sort().reverse();
			}

			await loadMonthData(currentMonth);
		} catch (error) {
			console.error('Failed to load savings data:', error);
			toast.error('Failed to load savings data');
		} finally {
			isLoading = false;
			hasLoadedOnce = true;
		}
	}

	async function loadMonthData(month: string) {
		const [accountList, contribList, budget] = await Promise.all([
			getAllSavingsAccounts(),
			getAllContributionsForMonth(month),
			getBudgetForMonth(month)
		]);

		accounts = accountList;
		contributions = contribList;
		currentMonth = month;
		monthlyIncome = budget?.income ?? 0;
	}

	async function handleMonthChange(month: string) {
		setSelectedMonth(month);
		await loadMonthData(month);
	}

	function handleAddContribution(accountId?: number) {
		preselectedAccountId = accountId;
		showAddContribution = true;
	}

	function handleEditContribution(contribution: SavingsContribution) {
		selectedContribution = contribution;
		showEditContribution = true;
	}

	async function handleContributionSaved() {
		showAddContribution = false;
		showEditContribution = false;
		selectedContribution = null;
		preselectedAccountId = undefined;
		await loadMonthData(currentMonth);
		toast.success('Contribution saved');
	}

	async function handleContributionDeleted() {
		showEditContribution = false;
		selectedContribution = null;
		await loadMonthData(currentMonth);
		toast.success('Contribution deleted');
	}

	async function handleAccountAdded() {
		showAddAccount = false;
		await loadMonthData(currentMonth);
		toast.success('Account added');
	}

	async function handleMoveUp(id: number) {
		try {
			await moveSavingsAccountUp(id);
			await loadMonthData(currentMonth);
		} catch (error) {
			toast.error('Failed to move account');
		}
	}

	async function handleMoveDown(id: number) {
		try {
			await moveSavingsAccountDown(id);
			await loadMonthData(currentMonth);
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
		await loadMonthData(currentMonth);
		toast.success('Account updated');
	}

	async function handleAccountDeleted() {
		showEditAccount = false;
		selectedAccount = null;
		await loadMonthData(currentMonth);
		toast.success('Account deleted');
	}

	// Reload data on navigation
	afterNavigate(() => {
		loadData();
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
					{#each { length: 3 } as _}
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
						<div>
							<span class="text-sm text-charcoal-muted">Saved This Month</span>
							<p class="font-mono text-xl font-medium text-success-600">
								{formatCurrencyWhole(totalSavedThisMonth)}
							</p>
						</div>
						{#if monthlyIncome > 0}
							<div>
								<span class="text-sm text-charcoal-muted">Savings Rate</span>
								<p class="font-mono text-xl font-medium text-charcoal">
									{Math.round(savingsRate * 100)}%
								</p>
								<p class="text-xs text-charcoal-muted mt-0.5">
									of {formatCurrencyWhole(monthlyIncome)} income
								</p>
							</div>
						{/if}
						{#if totalAffectingAvailable !== totalSavedThisMonth}
							<div>
								<span class="text-sm text-charcoal-muted">From Take-Home</span>
								<p class="font-mono text-xl font-medium text-charcoal">
									{formatCurrencyWhole(totalAffectingAvailable)}
								</p>
								<p class="text-xs text-charcoal-muted mt-0.5">
									reduces available to spend
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
