<script lang="ts">
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { format } from 'date-fns';
	import { Plus, Pencil, Landmark, PiggyBank, TrendingUp, ShieldCheck, Wallet, CreditCard, Banknote } from 'lucide-svelte';
	import type { ComponentType } from 'svelte';
	import type { LinkedAccount, BalanceSnapshot, LinkedAccountType } from '$lib/db';
	import { initializeStorage } from '$lib/storage';
	import {
		getAllLinkedAccounts,
		getAllSnapshots,
		addLinkedAccount,
		updateLinkedAccount,
		deleteLinkedAccount,
		recordBalance
	} from '$lib/stores/linkedAccounts';
	import { calculateNetWorth, buildNetWorthSeries, seriesDelta } from '$lib/utils/net-worth';
	import { formatCurrency, formatCurrencyWhole } from '$lib/utils/format-helpers';
	import { toast } from '$lib/stores/toast';
	import NetWorthChart from '$lib/components/NetWorthChart.svelte';
	import LinkedAccountModal from '$lib/components/LinkedAccountModal.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';

	const TYPE_META: Record<LinkedAccountType, { label: string; icon: ComponentType }> = {
		checking: { label: 'Checking', icon: Landmark as ComponentType },
		savings: { label: 'Savings', icon: PiggyBank as ComponentType },
		investment: { label: 'Investment', icon: TrendingUp as ComponentType },
		retirement: { label: 'Retirement', icon: ShieldCheck as ComponentType },
		credit: { label: 'Credit', icon: CreditCard as ComponentType },
		loan: { label: 'Loan', icon: Banknote as ComponentType },
		other: { label: 'Other', icon: Wallet as ComponentType }
	};

	let isLoading = $state(true);
	let hasLoadedOnce = false;
	let accounts = $state<LinkedAccount[]>([]);
	let snapshots = $state<BalanceSnapshot[]>([]);
	let showAccountModal = $state(false);
	let editingAccount = $state<LinkedAccount | null>(null);
	let confirmingDelete = $state(false);

	let summary = $derived(calculateNetWorth(accounts));
	let series = $derived(buildNetWorthSeries(snapshots, accounts));
	let monthDelta = $derived(seriesDelta(series, 30));
	let activeAccounts = $derived(accounts.filter((a) => a.isActive));
	let hiddenAccounts = $derived(accounts.filter((a) => !a.isActive));
	let lastUpdated = $derived(
		accounts.length > 0
			? accounts.reduce((max, a) => (a.updatedAt > max ? a.updatedAt : max), accounts[0].updatedAt)
			: null
	);

	// Asset subtotals by type for the rail breakdown
	let byType = $derived.by(() => {
		const totals = new Map<LinkedAccountType, number>();
		for (const a of activeAccounts) {
			if (a.accountClass === 'liability') continue;
			totals.set(a.accountType, (totals.get(a.accountType) || 0) + a.currentBalance);
		}
		return [...totals.entries()].sort((x, y) => y[1] - x[1]);
	});

	async function loadData() {
		if (!hasLoadedOnce) isLoading = true;
		try {
			await initializeStorage();
			[accounts, snapshots] = await Promise.all([getAllLinkedAccounts(), getAllSnapshots()]);
		} catch (error) {
			console.error('Failed to load net worth data:', error);
		} finally {
			isLoading = false;
			hasLoadedOnce = true;
		}
	}

	afterNavigate(() => {
		loadData();
	});

	onMount(() => {
		// Refresh after a SimpleFIN sync completes (dispatched from the layout)
		const handler = () => loadData();
		window.addEventListener('ledger:networth-changed', handler);
		return () => window.removeEventListener('ledger:networth-changed', handler);
	});

	function openAdd() {
		editingAccount = null;
		showAccountModal = true;
	}

	function openEdit(account: LinkedAccount) {
		editingAccount = account;
		showAccountModal = true;
	}

	async function handleSave(data: {
		name: string;
		institution: string;
		accountType: LinkedAccountType;
		balance: number;
		isActive: boolean;
	}) {
		try {
			if (editingAccount) {
				await updateLinkedAccount(editingAccount.id!, {
					name: data.name,
					institution: data.institution,
					accountType: data.accountType,
					isActive: data.isActive
				});
				if (data.balance !== editingAccount.currentBalance) {
					// Manual balance updates flow through recordBalance so history accrues
					await recordBalance(editingAccount.id!, data.balance, 'manual');
				}
				toast.success('Account updated');
			} else {
				await addLinkedAccount({
					name: data.name,
					institution: data.institution,
					accountClass: 'asset',
					accountType: data.accountType,
					initialBalance: data.balance
				});
				toast.success('Account added');
			}
			showAccountModal = false;
			editingAccount = null;
			await loadData();
		} catch (error) {
			console.error('Failed to save account:', error);
			toast.error('Failed to save account');
		}
	}

	async function handleDeleteConfirmed() {
		if (!editingAccount) return;
		try {
			await deleteLinkedAccount(editingAccount.id!);
			toast.success('Account deleted');
		} catch (error) {
			console.error('Failed to delete account:', error);
			toast.error('Failed to delete account');
		} finally {
			confirmingDelete = false;
			showAccountModal = false;
			editingAccount = null;
			await loadData();
		}
	}
</script>

<svelte:head>
	<title>Net Worth - Ledger</title>
</svelte:head>

<div class="min-h-screen">
	<main class="max-w-6xl mx-auto px-6 py-6" aria-live="polite">
		<!-- Title + actions -->
		<div class="flex items-center justify-between mb-5">
			<h1 class="font-display text-2xl font-medium text-charcoal">Net Worth</h1>
			<button
				type="button"
				onclick={openAdd}
				class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors btn-press"
			>
				<Plus size={16} />
				<span>Add account</span>
			</button>
		</div>

		{#if isLoading}
			<div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_330px] gap-6 items-start">
				<div class="space-y-4">
					<div class="bg-surface rounded-xl shadow-md shadow-theme p-6">
						<Skeleton class="h-4 mb-3" width="100px" rounded="sm" />
						<Skeleton class="h-9 mb-5" width="180px" rounded="sm" />
						<Skeleton class="h-48 w-full" rounded="lg" />
					</div>
				</div>
				<div class="bg-surface rounded-xl shadow-md shadow-theme p-5">
					<Skeleton class="h-3 mb-4" width="80px" rounded="sm" />
					<Skeleton class="h-4 mb-2" width="100%" rounded="sm" />
					<Skeleton class="h-4" width="100%" rounded="sm" />
				</div>
			</div>
		{:else if accounts.length === 0}
			<EmptyState
				icon={Landmark as ComponentType}
				title="Track your net worth"
				description="Add your accounts — checking, savings, investments, retirement — and watch the total grow over time"
				actionLabel="Add your first account"
				onAction={openAdd}
			/>
		{:else}
			<div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_330px] gap-6 items-start">
				<!-- Main column -->
				<div class="min-w-0 space-y-4 order-last lg:order-none">
					<!-- Hero + chart -->
					<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
						<div class="px-6 pt-5 pb-2">
							<h2 class="text-xs font-medium uppercase tracking-wider text-charcoal-muted">Total net worth</h2>
							<div class="flex items-baseline gap-3 mt-1">
								<p class="font-mono text-4xl font-medium text-charcoal">{formatCurrency(summary.total)}</p>
								{#if monthDelta !== null}
									<span
										class="font-mono text-sm font-medium {monthDelta >= 0 ? 'text-success-600' : 'text-danger-600'}"
										title="Change over the last 30 days"
									>
										{monthDelta >= 0 ? '+' : '−'}{formatCurrencyWhole(Math.abs(monthDelta))} this month
									</span>
								{/if}
							</div>
						</div>
						<div class="px-4 pb-4">
							<NetWorthChart {series} />
						</div>
					</div>

					<!-- Accounts -->
					<div>
						<h2 class="text-xs font-medium uppercase tracking-wider text-charcoal-muted mb-2 px-1">
							Accounts ({activeAccounts.length})
						</h2>
						<div class="bg-surface rounded-xl shadow-sm shadow-theme overflow-hidden divide-y divide-dashed divide-theme-dashed">
							{#each [...activeAccounts, ...hiddenAccounts] as account (account.id)}
								{@const meta = TYPE_META[account.accountType]}
								{@const Icon = meta.icon}
								<div class="group/row px-4 py-3 flex items-center gap-3 transition-colors hover:bg-surface-hover/50 {account.isActive ? '' : 'opacity-50'}">
									<div class="category-chip w-9 h-9 bg-surface-alt text-charcoal-soft">
										<Icon size={17} />
									</div>
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-2">
											<span class="font-medium text-charcoal truncate">{account.name}</span>
											{#if !account.isActive}
												<span class="badge bg-surface-alt text-charcoal-muted">Hidden</span>
											{/if}
										</div>
										<div class="flex items-center gap-2 text-sm text-charcoal-muted mt-0.5">
											{#if account.institution}
												<span>{account.institution}</span>
												<span>·</span>
											{/if}
											<span>{meta.label}</span>
										</div>
									</div>
									<div class="text-right flex-shrink-0">
										<div class="font-mono font-medium text-charcoal">{formatCurrency(account.currentBalance)}</div>
										<div class="text-xs text-charcoal-muted">
											Updated {format(account.updatedAt, 'MMM d')}
										</div>
									</div>
									<button
										type="button"
										onclick={() => openEdit(account)}
										class="p-2 text-charcoal-muted hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors flex-shrink-0 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100"
										aria-label="Edit {account.name}"
									>
										<Pencil size={16} />
									</button>
								</div>
							{/each}
						</div>
					</div>
				</div>

				<!-- Right rail -->
				<aside class="space-y-4 lg:sticky lg:top-6">
					<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)]">
						<div class="px-5 py-3.5">
							<h2 class="text-xs font-medium uppercase tracking-wider text-charcoal-muted">Breakdown</h2>
						</div>
						<div class="px-5 pb-5 pt-4 border-t border-dashed border-theme-dashed space-y-3">
							{#each byType as [type, total] (type)}
								<div class="flex items-baseline">
									<span class="text-charcoal-soft text-sm">{TYPE_META[type].label}</span>
									<span class="ledger-line"></span>
									<span class="font-mono text-charcoal">{formatCurrencyWhole(total)}</span>
								</div>
							{/each}
							<div class="border-t border-theme my-2"></div>
							<div class="flex items-baseline">
								<span class="text-charcoal-soft text-sm">Total</span>
								<span class="ledger-line"></span>
								<span class="font-mono font-medium text-charcoal">{formatCurrency(summary.total)}</span>
							</div>
							{#if lastUpdated}
								<p class="text-xs text-charcoal-muted pt-1">
									Last updated {format(lastUpdated, 'MMM d, yyyy')}
								</p>
							{/if}
						</div>
					</div>
				</aside>
			</div>
		{/if}
	</main>
</div>

<LinkedAccountModal
	isOpen={showAccountModal}
	account={editingAccount}
	onSave={handleSave}
	onDelete={editingAccount ? () => (confirmingDelete = true) : undefined}
	onClose={() => {
		showAccountModal = false;
		editingAccount = null;
	}}
/>

<ConfirmDialog
	isOpen={confirmingDelete}
	title="Delete Account"
	message="Delete {editingAccount?.name}? Its entire balance history will be removed."
	confirmText="Delete"
	variant="danger"
	onConfirm={handleDeleteConfirmed}
	onCancel={() => (confirmingDelete = false)}
/>
