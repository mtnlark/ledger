<script lang="ts">
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { Upload, Download, Database, FileSpreadsheet, Sun, Moon, Monitor, Cloud, CloudOff, Command, Bell, BellOff } from 'lucide-svelte';
	import { type Settings, type Category, type Transaction, DEFAULT_SETTINGS } from '$lib/db';
	import { initializeStorage } from '$lib/storage';
	import { getSettings, updateSettings, updateTheme, updateICloudBackup, updateNotifications } from '$lib/stores/settings';
	import { requestNotificationPermission, isNotificationPermissionGranted } from '$lib/notifications';
	import { isICloudAvailable, getICloudBackupDir } from '$lib/storage/tauri-adapter';
	import { getTransactionsByMonth, getAvailableMonths } from '$lib/stores/transactions';
	import { getAllCategories } from '$lib/stores/categories';
	import CategoryManager from '$lib/components/CategoryManager.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { readExcelFile, parseExpensesSheet, importTransactions, type ImportResult } from '$lib/utils/import';
	import { exportTransactionsToCSV, exportAllDataToJSON, importFromJSON, downloadFile } from '$lib/utils/export';
	import { toast } from '$lib/stores/toast';
	import type { LinkedAccount } from '$lib/db';
	import {
		getAllLinkedAccounts,
		addLinkedAccount,
		updateLinkedAccount,
		deleteLinkedAccount,
		recordBalance,
		setSyncStatus
	} from '$lib/stores/linkedAccounts';
	import {
		isLinked as sfIsLinked,
		link as sfLink,
		unlink as sfUnlink,
		fetchAccounts as sfFetchAccounts,
		mapSimplefinAccount,
		type MappedSimplefinAccount
	} from '$lib/services/simplefin';

	// State
	let isLoading = $state(true);
	let hasLoadedOnce = false;
	let settings = $state<Settings>(DEFAULT_SETTINGS);
	let categories = $state<Category[]>([]);
	let isSaving = $state(false);

	// Import/Export state
	let isImporting = $state(false);
	let isExporting = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);
	let jsonFileInput = $state<HTMLInputElement | null>(null);

	// JSON import confirmation
	let showJsonImportConfirm = $state(false);
	let pendingJsonFile = $state<File | null>(null);

	// iCloud state
	let iCloudAvailable = $state(false);
	let iCloudPath = $state('');

	// Form state
	let partnerName = $state('');
	let defaultSplitType = $state<'percentage' | 'fixed'>('percentage');
	let defaultSplitValue = $state(0.5);

	// Load data
	async function loadData() {
		if (!hasLoadedOnce) isLoading = true;
		try {
			await initializeStorage();
			settings = await getSettings();
			categories = await getAllCategories();
			// Initialize form state from settings
			partnerName = settings.partnerName;
			defaultSplitType = settings.defaultSplitType;
			defaultSplitValue = settings.defaultSplitValue;
			// Check iCloud availability
			try {
				iCloudAvailable = await isICloudAvailable();
				if (iCloudAvailable) {
					iCloudPath = getICloudBackupDir();
				}
			} catch {
				iCloudAvailable = false;
			}
		} catch (error) {
			console.error('Failed to load settings:', error);
		} finally {
			isLoading = false;
			hasLoadedOnce = true;
		}
	}

	// Reload categories (called after category changes)
	async function reloadCategories() {
		categories = await getAllCategories();
	}

	async function handleSave() {
		isSaving = true;
		try {
			await updateSettings({
				partnerName,
				defaultSplitType,
				defaultSplitValue
			});
			settings = await getSettings();
			toast.success('Settings saved');
		} catch (error) {
			console.error('Failed to save settings:', error);
			toast.error('Failed to save settings');
		} finally {
			isSaving = false;
		}
	}

	// Theme options for the toggle
	const themeOptions = [
		{ value: 'light' as const, label: 'Light', icon: Sun },
		{ value: 'dark' as const, label: 'Dark', icon: Moon },
		{ value: 'system' as const, label: 'System', icon: Monitor }
	];

	// Keyboard shortcuts list for display
	const shortcutList = [
		{ keys: ['⌘', 'K'], description: 'Focus search' },
		{ keys: ['⌘', 'N'], description: 'Quick add transaction' },
		{ keys: ['⌘', '/'], description: 'Show keyboard shortcuts' },
		{ keys: ['⌘', '1'], description: 'Go to Dashboard' },
		{ keys: ['⌘', '2'], description: 'Go to Budget' },
		{ keys: ['⌘', '3'], description: 'Go to Savings' },
		{ keys: ['⌘', '4'], description: 'Go to Insights' },
		{ keys: ['⌘', '5'], description: 'Go to Shared' },
		{ keys: ['Esc'], description: 'Close modals / Clear selection' }
	];

	async function handleThemeChange(theme: 'light' | 'dark' | 'system') {
		await updateTheme(theme);
		settings = await getSettings();
	}

	// Toggle iCloud backup
	async function handleICloudToggle() {
		const newValue = !settings.iCloudBackupEnabled;
		try {
			await updateICloudBackup(newValue);
			settings = await getSettings();
			toast.success(newValue ? 'iCloud backup enabled' : 'iCloud backup disabled');
		} catch (error) {
			console.error('Failed to update iCloud setting:', error);
			toast.error('Failed to update iCloud setting');
		}
	}

	// Toggle notification master switch
	async function handleNotificationToggle() {
		const enabling = !settings.notificationsEnabled;

		if (enabling) {
			// Request OS permission on first enable
			const permission = await requestNotificationPermission();
			if (permission !== 'granted') {
				toast.error('Notification permission denied. Enable in System Settings > Notifications > Ledger.');
				return;
			}
		}

		try {
			await updateNotifications(enabling);
			settings = await getSettings();
			toast.success(enabling ? 'Notifications enabled' : 'Notifications disabled');
		} catch (error) {
			console.error('Failed to update notification setting:', error);
			toast.error('Failed to update notification setting');
		}
	}

	// Update individual notification sub-settings
	async function handleNotificationSubToggle(
		field: 'dailyReminderEnabled' | 'weeklyReviewEnabled' | 'monthlyBudgetSetupEnabled',
	) {
		try {
			await updateSettings({ [field]: !settings[field] });
			settings = await getSettings();
		} catch (error) {
			console.error('Failed to update notification setting:', error);
			toast.error('Failed to update notification setting');
		}
	}

	// Update daily reminder time
	async function handleDailyTimeChange(event: Event) {
		const input = event.target as HTMLInputElement;
		if (!input.value) return;
		try {
			await updateSettings({ dailyReminderTime: input.value });
			settings = await getSettings();
		} catch (error) {
			console.error('Failed to update reminder time:', error);
			toast.error('Failed to update reminder time');
		}
	}

	// Import from Excel
	async function handleExcelImport(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		isImporting = true;

		try {
			const rows = await readExcelFile(file);
			const parsed = await parseExpensesSheet(rows);
			const result = await importTransactions(parsed, { skipDuplicates: true });

			if (result.success) {
				toast.success(`Imported ${result.imported} transactions (${result.skipped} skipped)`);
			} else {
				toast.warning(`Imported ${result.imported}, skipped ${result.skipped}. ${result.errors.length} errors.`);
			}
		} catch (error) {
			toast.error(`Import failed: ${error}`);
		} finally {
			isImporting = false;
			if (input) input.value = '';
		}
	}

	// Import from JSON backup — show confirmation first
	function handleJSONImportSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		pendingJsonFile = file;
		showJsonImportConfirm = true;
		if (input) input.value = '';
	}

	async function handleJSONImportConfirm() {
		showJsonImportConfirm = false;
		const file = pendingJsonFile;
		pendingJsonFile = null;
		if (!file) return;

		isImporting = true;

		try {
			const text = await file.text();
			const result = await importFromJSON(text);

			if (result.success) {
				toast.success(result.message);
				// Reload data to reflect imported changes
				await loadData();
			} else {
				toast.error(result.message);
			}
		} catch (error) {
			toast.error(`Import failed: ${error}`);
		} finally {
			isImporting = false;
		}
	}

	function handleJSONImportCancel() {
		showJsonImportConfirm = false;
		pendingJsonFile = null;
	}

	// Export to CSV
	async function handleCSVExport() {
		isExporting = true;
		try {
			const categories = await getAllCategories();
			const months = await getAvailableMonths();

			// Get all transactions
			let allTransactions: Transaction[] = [];
			for (const month of months) {
				const monthTransactions = await getTransactionsByMonth(month);
				allTransactions = [...allTransactions, ...monthTransactions];
			}

			const csv = await exportTransactionsToCSV(allTransactions, categories);
			const filename = `ledger-export-${new Date().toISOString().slice(0, 10)}.csv`;
			downloadFile(csv, filename, 'text/csv');
			toast.success(`Exported ${allTransactions.length} transactions to CSV`);
		} catch (error) {
			console.error('Export failed:', error);
			toast.error('Export failed');
		} finally {
			isExporting = false;
		}
	}

	// Export full backup to JSON
	async function handleJSONExport() {
		isExporting = true;
		try {
			const json = await exportAllDataToJSON();
			const filename = `ledger-backup-${new Date().toISOString().slice(0, 10)}.json`;
			downloadFile(json, filename, 'application/json');
			toast.success('Backup downloaded');
		} catch (error) {
			console.error('Backup failed:', error);
			toast.error('Backup failed');
		} finally {
			isExporting = false;
		}
	}

	// Reload data when navigating to this page
	afterNavigate(() => {
		loadData();
	});

	// --- SimpleFIN (Connected Accounts) ---
	let sfLinked = $state(false);
	let sfToken = $state('');
	let sfBusy = $state(false);
	let sfUpstream = $state<MappedSimplefinAccount[] | null>(null);
	let sfAccounts = $state<LinkedAccount[]>([]);
	let sfMapping = $state<Record<string, string>>({});
	let sfConfirmingUnlink = $state(false);
	let sfUnlinkMode = $state<'keep' | 'remove'>('keep');

	let sfManualAccounts = $derived(sfAccounts.filter((a) => a.source === 'manual'));

	async function sfRefreshLocal() {
		sfAccounts = await getAllLinkedAccounts();
	}

	async function sfInit() {
		try {
			sfLinked = await sfIsLinked();
			await sfRefreshLocal();
		} catch {
			// Non-Tauri environment (tests/web) — section stays in unlinked state
		}
	}

	async function sfConnect() {
		if (!sfToken.trim() || sfBusy) return;
		sfBusy = true;
		try {
			const resp = await sfLink(sfToken.trim());
			sfUpstream = resp.accounts.map(mapSimplefinAccount);
			sfLinked = true;
			sfToken = '';
			toast.success('SimpleFIN connected');
		} catch (error) {
			toast.error(String(error));
		} finally {
			sfBusy = false;
		}
	}

	async function sfLoadUpstream() {
		if (sfBusy) return;
		sfBusy = true;
		try {
			const resp = await sfFetchAccounts();
			sfUpstream = resp.accounts.map(mapSimplefinAccount);
		} catch (error) {
			toast.error(String(error));
		} finally {
			sfBusy = false;
		}
	}

	function sfConnectedTo(simplefinId: string): LinkedAccount | undefined {
		return sfAccounts.find((a) => a.simplefinId === simplefinId);
	}

	async function sfAddUpstream(mapped: MappedSimplefinAccount) {
		try {
			const choice = sfMapping[mapped.simplefinId] ?? 'new';
			if (choice === 'new') {
				// Negative upstream balance ⇒ almost certainly a credit card / debt
				const isLiability = mapped.balance < 0;
				await addLinkedAccount({
					name: mapped.name,
					institution: mapped.institution,
					accountClass: isLiability ? 'liability' : 'asset',
					accountType: isLiability ? 'credit' : 'other',
					initialBalance: Math.abs(mapped.balance),
					source: 'simplefin',
					simplefinId: mapped.simplefinId
				});
				const created = (await getAllLinkedAccounts()).find((a) => a.simplefinId === mapped.simplefinId);
				if (created) await setSyncStatus(created.id!, 'ok', new Date());
			} else {
				const id = Number(choice);
				const target = sfAccounts.find((a) => a.id === id);
				await updateLinkedAccount(id, { source: 'simplefin', simplefinId: mapped.simplefinId });
				const balance =
					target?.accountClass === 'liability' ? Math.abs(mapped.balance) : mapped.balance;
				await recordBalance(id, balance, 'simplefin');
				await setSyncStatus(id, 'ok', new Date());
			}
			await sfRefreshLocal();
			toast.success(`${mapped.name} connected`);
		} catch (error) {
			console.error('Failed to connect account:', error);
			toast.error('Failed to connect account');
		}
	}

	async function sfDisconnect(mode: 'keep' | 'remove') {
		if (sfBusy) return;
		sfBusy = true;
		try {
			await sfUnlink();
			const synced = sfAccounts.filter((a) => a.source === 'simplefin');
			if (mode === 'remove') {
				// Demo/test cleanup: drop the accounts and their snapshot history
				for (const account of synced) {
					await deleteLinkedAccount(account.id!);
				}
				toast.success('SimpleFIN disconnected — synced accounts removed');
			} else {
				// Safe default for real accounts: keep balances + history as manual
				for (const account of synced) {
					await updateLinkedAccount(account.id!, { source: 'manual' });
				}
				toast.success('SimpleFIN disconnected — accounts kept as manual');
			}
			sfLinked = false;
			sfUpstream = null;
			sfConfirmingUnlink = false;
			await sfRefreshLocal();
		} catch (error) {
			toast.error(String(error));
		} finally {
			sfBusy = false;
		}
	}

	// Section navigation (one section shown at a time, like macOS System Settings)
	const SETTINGS_SECTION_KEY = 'ledger-settings-section';
	const sections = [
		{ id: 'sharing', label: 'Expense Sharing' },
		{ id: 'appearance', label: 'Appearance' },
		{ id: 'notifications', label: 'Notifications' },
		{ id: 'shortcuts', label: 'Keyboard Shortcuts' },
		{ id: 'categories', label: 'Categories' },
		{ id: 'data', label: 'Data & Backup' },
		{ id: 'connections', label: 'Connected Accounts' },
		{ id: 'about', label: 'About' }
	];
	let activeSection = $state('sharing');

	function selectSection(id: string) {
		activeSection = id;
		localStorage.setItem(SETTINGS_SECTION_KEY, id);
	}

	onMount(() => {
		const storedSection = localStorage.getItem(SETTINGS_SECTION_KEY);
		if (storedSection && sections.some((s) => s.id === storedSection)) activeSection = storedSection;
		sfInit();
		// Reload data when page becomes visible (e.g., switching browser tabs)
		function handleVisibilityChange() {
			if (document.visibilityState === 'visible' && !isLoading) {
				loadData();
			}
		}

		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	});
</script>

<svelte:head>
	<title>Settings - Ledger</title>
</svelte:head>

<div class="min-h-screen">
	<!-- Header -->
	<!-- Main Content -->
	<main class="max-w-5xl mx-auto px-6 py-6 space-y-6">
		<h1 class="font-display text-2xl font-medium text-charcoal">Settings</h1>
		{#if isLoading}
			<div class="flex items-center justify-center py-12">
				<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
			</div>
		{:else}
			<div class="grid grid-cols-1 sm:grid-cols-[200px_minmax(0,1fr)] gap-6 items-start">
				<!-- Section nav -->
				<nav class="sm:sticky sm:top-6 flex sm:flex-col gap-1 overflow-x-auto" aria-label="Settings sections">
					{#each sections as section (section.id)}
						<button
							type="button"
							onclick={() => selectSection(section.id)}
							aria-current={activeSection === section.id ? 'true' : undefined}
							class="relative text-left px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors {activeSection === section.id
								? 'bg-primary-50 text-primary-700'
								: 'text-charcoal-soft hover:bg-surface-hover'}"
						>
							{#if activeSection === section.id}
								<span class="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-primary-500" aria-hidden="true"></span>
							{/if}
							{section.label}
						</button>
					{/each}
				</nav>

				<!-- Active section -->
				<div class="min-w-0 space-y-6">
				{#if activeSection === 'sharing'}
			<!-- Partner Settings -->
			<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
				<div class="px-6 py-4 border-b border-dashed border-theme-dashed">
					<h2 class="font-display text-xl font-medium text-charcoal">Expense Sharing</h2>
					<p class="text-sm text-charcoal-muted mt-1">Configure default settings for shared expenses</p>
				</div>

				<div class="p-6 space-y-5">
					<!-- Partner Name -->
					<div>
						<label for="partnerName" class="block text-sm font-medium text-charcoal-soft mb-1.5">
							Partner Name
						</label>
						<input
							type="text"
							id="partnerName"
							bind:value={partnerName}
							placeholder="e.g., Alex"
							class="w-full px-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors placeholder:text-charcoal-muted"
						/>
						<p class="mt-1.5 text-xs text-charcoal-muted">
							Used when displaying shared expenses (e.g., "Outstanding balance with {partnerName || 'Partner'}")
						</p>
					</div>

					<!-- Default Split Type -->
					<div role="group" aria-labelledby="split-type-label">
						<span id="split-type-label" class="block text-sm font-medium text-charcoal-soft mb-2">
							Default Split Type
						</span>
						<div class="flex gap-4">
							<label class="flex items-center gap-2 cursor-pointer">
								<input
									type="radio"
									name="splitType"
									value="percentage"
									bind:group={defaultSplitType}
									class="text-primary-600 focus:ring-primary-500/20"
								/>
								<span class="text-sm text-charcoal-soft">Percentage (%)</span>
							</label>
							<label class="flex items-center gap-2 cursor-pointer">
								<input
									type="radio"
									name="splitType"
									value="fixed"
									bind:group={defaultSplitType}
									class="text-primary-600 focus:ring-primary-500/20"
								/>
								<span class="text-sm text-charcoal-soft">Fixed Amount ($)</span>
							</label>
						</div>
					</div>

					<!-- Default Split Value -->
					<div>
						<label for="splitValue" class="block text-sm font-medium text-charcoal-soft mb-1.5">
							Default Split Value
						</label>
						<div class="relative max-w-xs">
							{#if defaultSplitType === 'percentage'}
								<input
									type="number"
									id="splitValue"
									bind:value={defaultSplitValue}
									step="0.01"
									min="0"
									max="1"
									class="w-full px-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors font-mono"
								/>
								<p class="mt-1.5 text-xs text-charcoal-muted">
									Enter as decimal (0.5 = 50%). Partner pays <span class="font-mono">{Math.round(defaultSplitValue * 100)}%</span> of shared expenses.
								</p>
							{:else}
								<span class="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-muted font-mono">$</span>
								<input
									type="number"
									id="splitValue"
									bind:value={defaultSplitValue}
									step="0.01"
									min="0"
									class="w-full pl-7 pr-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors font-mono"
								/>
								<p class="mt-1.5 text-xs text-charcoal-muted">
									Default amount partner pays for shared expenses.
								</p>
							{/if}
						</div>
					</div>

					<!-- Save Button -->
					<div class="flex items-center gap-4 pt-2">
						<button
							onclick={handleSave}
							disabled={isSaving}
							class="px-5 py-2.5 bg-primary-500 text-white font-medium rounded-lg hover:bg-primary-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary-500/25 active:scale-[0.97] focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-2 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
						>
							{isSaving ? 'Saving...' : 'Save Settings'}
						</button>
					</div>
				</div>
			</div>
				{/if}

				{#if activeSection === 'appearance'}
			<!-- Appearance -->
			<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
				<div class="px-6 py-4 border-b border-dashed border-theme-dashed">
					<h2 class="font-display text-xl font-medium text-charcoal">Appearance</h2>
					<p class="text-sm text-charcoal-muted mt-1">Choose how Ledger looks</p>
				</div>

				<div class="p-6">
					<div class="flex gap-3">
						{#each themeOptions as option}
							<button
								type="button"
								onclick={() => handleThemeChange(option.value)}
								class="flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-150
									{settings.theme === option.value
										? 'border-primary-500 bg-primary-50'
										: 'border-theme hover:border-primary-300 hover:bg-surface-hover'}"
							>
								<option.icon size={24}
									class={settings.theme === option.value ? 'text-primary-600' : 'text-charcoal-soft'} />
								<span class="text-sm font-medium
									{settings.theme === option.value ? 'text-primary-600' : 'text-charcoal-soft'}">
									{option.label}
								</span>
							</button>
						{/each}
					</div>
				</div>
			</div>
				{/if}

				{#if activeSection === 'notifications'}
			<!-- Notifications -->
			<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
				<div class="px-6 py-4 border-b border-dashed border-theme-dashed">
					<h2 class="font-display text-xl font-medium text-charcoal flex items-center gap-2">
						<Bell size={20} class="text-primary-500" />
						Notifications
					</h2>
					<p class="text-sm text-charcoal-muted mt-1">Get reminders to log expenses and review your budget</p>
				</div>

				<div class="p-6 space-y-5">
					<p class="text-sm text-charcoal-soft">
						Ledger can send native macOS notifications for daily reminders, weekly reviews, and monthly budget setup.
					</p>

					<!-- Master Toggle -->
					<div class="flex items-center justify-between p-4 bg-surface-alt rounded-lg border border-theme">
						<div class="flex items-center gap-3">
							{#if settings.notificationsEnabled}
								<Bell size={20} class="text-primary-500" />
							{:else}
								<BellOff size={20} class="text-charcoal-muted" />
							{/if}
							<div>
								<p class="text-sm font-medium text-charcoal">Enable notifications</p>
								<p class="text-xs text-charcoal-muted">
									Receive reminders to log expenses and review spending
								</p>
							</div>
						</div>
						<button
							type="button"
							role="switch"
							aria-checked={settings.notificationsEnabled}
							aria-label="Toggle notifications"
							onclick={handleNotificationToggle}
							class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-2
								{settings.notificationsEnabled ? 'bg-primary-500' : 'toggle-off'}"
						>
							<span
								class="inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform
									{settings.notificationsEnabled ? 'translate-x-6' : 'translate-x-1'}"
							></span>
						</button>
					</div>

					<!-- Sub-options (visible when master toggle is on) -->
					{#if settings.notificationsEnabled}
						<div class="space-y-4 pl-2">
							<!-- Daily Reminder -->
							<div class="flex items-center justify-between">
								<div class="flex items-start gap-3">
									<input
										type="checkbox"
										id="daily-reminder"
										checked={settings.dailyReminderEnabled}
										onchange={() => handleNotificationSubToggle('dailyReminderEnabled')}
										class="mt-0.5 text-primary-600 focus:ring-primary-500/20 rounded"
									/>
									<label for="daily-reminder" class="cursor-pointer">
										<p class="text-sm font-medium text-charcoal">Daily expense reminder</p>
										<p class="text-xs text-charcoal-muted">Reminds you to log expenses if none were added today</p>
									</label>
								</div>
								<input
									type="time"
									value={settings.dailyReminderTime}
									onchange={handleDailyTimeChange}
									disabled={!settings.dailyReminderEnabled}
									class="px-2 py-1 bg-surface-alt border border-theme rounded-lg text-sm font-mono text-charcoal-soft focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
								/>
							</div>

							<!-- Weekly Review -->
							<div class="flex items-start gap-3">
								<input
									type="checkbox"
									id="weekly-review"
									checked={settings.weeklyReviewEnabled}
									onchange={() => handleNotificationSubToggle('weeklyReviewEnabled')}
									class="mt-0.5 text-primary-600 focus:ring-primary-500/20 rounded"
								/>
								<label for="weekly-review" class="cursor-pointer">
									<p class="text-sm font-medium text-charcoal">Weekly review</p>
									<p class="text-xs text-charcoal-muted">Every Monday morning</p>
								</label>
							</div>

							<!-- Monthly Budget Setup -->
							<div class="flex items-start gap-3">
								<input
									type="checkbox"
									id="monthly-budget"
									checked={settings.monthlyBudgetSetupEnabled}
									onchange={() => handleNotificationSubToggle('monthlyBudgetSetupEnabled')}
									class="mt-0.5 text-primary-600 focus:ring-primary-500/20 rounded"
								/>
								<label for="monthly-budget" class="cursor-pointer">
									<p class="text-sm font-medium text-charcoal">Monthly budget setup</p>
									<p class="text-xs text-charcoal-muted">1st of each month</p>
								</label>
							</div>
						</div>
					{/if}
				</div>
			</div>
				{/if}

				{#if activeSection === 'shortcuts'}
			<!-- Keyboard Shortcuts -->
			<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
				<div class="px-6 py-4 border-b border-dashed border-theme-dashed">
					<h2 class="font-display text-xl font-medium text-charcoal flex items-center gap-2">
						<Command size={20} class="text-primary-500" />
						Keyboard Shortcuts
					</h2>
					<p class="text-sm text-charcoal-muted mt-1">Navigate faster with keyboard shortcuts</p>
				</div>

				<div class="p-6">
					<div class="space-y-3">
						{#each shortcutList as shortcut}
							<div class="flex items-center justify-between">
								<span class="text-sm text-charcoal-soft">{shortcut.description}</span>
								<div class="flex items-center gap-1">
									{#each shortcut.keys as key}
										<kbd class="inline-flex items-center justify-center min-w-[28px] h-7 px-2 bg-cream border border-theme-muted rounded-md text-xs font-mono font-medium text-charcoal-muted shadow-sm">
											{key}
										</kbd>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
				{/if}

				{#if activeSection === 'categories'}
			<!-- Category Management -->
			<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
				<div class="px-6 py-4 border-b border-dashed border-theme-dashed">
					<h2 class="font-display text-xl font-medium text-charcoal">Categories</h2>
					<p class="text-sm text-charcoal-muted mt-1">Manage expense categories, reorder, and customize</p>
				</div>

				<div class="p-6">
					<CategoryManager {categories} onUpdate={reloadCategories} />
				</div>
			</div>
				{/if}

				{#if activeSection === 'data'}
			<!-- Data Management -->
			<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
				<div class="px-6 py-4 border-b border-dashed border-theme-dashed">
					<h2 class="font-display text-xl font-medium text-charcoal">Data Management</h2>
					<p class="text-sm text-charcoal-muted mt-1">Import and export your budget data</p>
				</div>

				<div class="p-6 space-y-6">
					<!-- Import Section -->
					<div>
						<h3 class="text-sm font-medium text-charcoal mb-3">Import Data</h3>
						<div class="space-y-3">
							<!-- Excel Import -->
							<div class="flex items-center gap-3">
								<input
									type="file"
									accept=".xlsx,.xls"
									onchange={handleExcelImport}
									bind:this={fileInput}
									class="hidden"
									id="excel-import"
								/>
								<label
									for="excel-import"
									class="inline-flex items-center gap-2 px-4 py-2 bg-surface-alt text-charcoal-soft font-medium rounded-lg hover:bg-surface-hover cursor-pointer transition-colors border border-theme"
								>
									<FileSpreadsheet size={16} />
									Import from Excel
								</label>
								<span class="text-xs text-charcoal-muted">(.xlsx with "Expenses" sheet)</span>
							</div>

							<!-- JSON Import -->
							<div class="flex items-center gap-3">
								<input
									type="file"
									accept=".json"
									onchange={handleJSONImportSelect}
									bind:this={jsonFileInput}
									class="hidden"
									id="json-import"
								/>
								<label
									for="json-import"
									class="inline-flex items-center gap-2 px-4 py-2 bg-surface-alt text-charcoal-soft font-medium rounded-lg hover:bg-surface-hover cursor-pointer transition-colors border border-theme"
								>
									<Upload size={16} />
									Restore from Backup
								</label>
								<span class="text-xs text-charcoal-muted">(.json backup file)</span>
							</div>
						</div>

						{#if isImporting}
							<div class="mt-3 flex items-center gap-2 text-sm text-charcoal-soft">
								<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
								<span>Importing...</span>
							</div>
						{/if}
					</div>

					<!-- Divider -->
					<div class="border-t border-dashed border-theme-dashed"></div>

					<!-- Export Section -->
					<div>
						<h3 class="text-sm font-medium text-charcoal mb-3">Export Data</h3>
						<div class="flex flex-wrap gap-3">
							<button
								onclick={handleCSVExport}
								disabled={isExporting}
								class="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white font-medium rounded-lg hover:bg-primary-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary-500/25 active:scale-[0.97] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
							>
								<Download size={16} />
								Export to CSV
							</button>

							<button
								onclick={handleJSONExport}
								disabled={isExporting}
								class="inline-flex items-center gap-2 px-4 py-2 bg-charcoal-soft text-white font-medium rounded-lg hover:bg-charcoal hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.97] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
							>
								<Database size={16} />
								Full Backup (JSON)
							</button>
						</div>

						{#if isExporting}
							<div class="mt-3 flex items-center gap-2 text-sm text-charcoal-soft">
								<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
								<span>Exporting...</span>
							</div>
						{/if}
					</div>

					<!-- Divider -->
					<div class="border-t border-dashed border-theme-dashed"></div>

					<!-- iCloud Backup Section -->
					<div>
						<h3 class="text-sm font-medium text-charcoal mb-3">Cloud Backup</h3>
						<div class="flex items-center justify-between p-4 bg-surface-alt rounded-lg border border-theme">
							<div class="flex items-center gap-3">
								{#if iCloudAvailable}
									<Cloud size={20} class="text-primary-500" />
								{:else}
									<CloudOff size={20} class="text-charcoal-muted" />
								{/if}
								<div>
									<p class="text-sm font-medium text-charcoal">Back up to iCloud</p>
									<p class="text-xs text-charcoal-muted">
										{#if iCloudAvailable}
											Automatically copy backups to iCloud Drive
										{:else}
											iCloud Drive not available on this device
										{/if}
									</p>
								</div>
							</div>
							<button
								type="button"
								role="switch"
								aria-checked={settings.iCloudBackupEnabled}
								aria-label="Toggle iCloud backup"
								disabled={!iCloudAvailable}
								onclick={handleICloudToggle}
								class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed
									{settings.iCloudBackupEnabled ? 'bg-primary-500' : 'toggle-off'}"
							>
								<span
									class="inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform
										{settings.iCloudBackupEnabled ? 'translate-x-6' : 'translate-x-1'}"
								></span>
							</button>
						</div>
						{#if iCloudAvailable && settings.iCloudBackupEnabled}
							<p class="mt-2 text-xs text-charcoal-muted">
								Backups sync to: <span class="font-mono text-[10px]">{iCloudPath}</span>
							</p>
						{/if}
					</div>

					<!-- Info -->
					<div class="bg-primary-50 rounded-lg p-4 border border-primary-200">
						<p class="text-sm text-primary-800">
							<strong>Note:</strong> Your data is stored locally on your device. Automatic backups are created
							before each save. Use Full Backup to export a portable copy.
						</p>
					</div>
				</div>
			</div>
				{/if}

				{#if activeSection === 'connections'}
				<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
					<div class="px-6 py-4 border-b border-dashed border-theme-dashed">
						<h2 class="font-display text-xl font-medium text-charcoal">Connected Accounts</h2>
						<p class="text-sm text-charcoal-muted mt-1">Sync balances read-only from SimpleFIN Bridge for the Net Worth page</p>
					</div>
					<div class="p-6 space-y-5">
						{#if !sfLinked}
							<div>
								<label for="sf-token" class="block text-sm font-medium text-charcoal-soft mb-1.5">Setup token</label>
								<div class="flex gap-2">
									<input
										id="sf-token"
										type="password"
										bind:value={sfToken}
										placeholder="Paste your SimpleFIN setup token"
										class="flex-1 px-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors font-mono text-sm"
									/>
									<button
										type="button"
										onclick={sfConnect}
										disabled={sfBusy || !sfToken.trim()}
										class="px-4 py-2.5 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
									>
										{sfBusy ? 'Connecting…' : 'Connect'}
									</button>
								</div>
								<p class="text-xs text-charcoal-muted mt-2">
									Get a setup token from SimpleFIN Bridge (bank login happens on their site, read-only).
									The access credential is stored in the macOS Keychain — it never touches your data file or backups.
								</p>
							</div>
						{:else}
							<div class="flex items-center justify-between">
								<p class="text-sm text-success-600 font-medium inline-flex items-center gap-1.5">
									<span class="w-2 h-2 rounded-full bg-success-500" aria-hidden="true"></span>
									SimpleFIN connected
								</p>
								<div class="flex gap-2">
									<button
										type="button"
										onclick={sfLoadUpstream}
										disabled={sfBusy}
										class="px-3 py-1.5 text-sm font-medium border border-theme text-charcoal-soft rounded-lg hover:bg-surface-alt transition-colors disabled:opacity-50"
									>
										{sfBusy ? 'Loading…' : 'Load accounts'}
									</button>
									<button
										type="button"
										onclick={() => { sfUnlinkMode = 'keep'; sfConfirmingUnlink = true; }}
										disabled={sfBusy}
										class="px-3 py-1.5 text-sm font-medium text-danger-600 hover:bg-danger-50 rounded-lg transition-colors disabled:opacity-50"
									>
										Unlink
									</button>
								</div>
							</div>
						{/if}

						{#if sfConfirmingUnlink}
							<div class="bg-warning-50 border border-warning-200 rounded-lg p-4 space-y-3">
								<p class="text-sm font-medium text-charcoal">Unlink SimpleFIN?</p>
								<label class="flex items-start gap-2 cursor-pointer">
									<input type="radio" bind:group={sfUnlinkMode} value="keep" class="mt-0.5" />
									<span class="text-sm text-charcoal-soft">Keep the synced accounts as manual<span class="block text-xs text-charcoal-muted">Balances and history stay on the Net Worth page; you update them yourself</span></span>
								</label>
								<label class="flex items-start gap-2 cursor-pointer">
									<input type="radio" bind:group={sfUnlinkMode} value="remove" class="mt-0.5" />
									<span class="text-sm text-charcoal-soft">Remove the synced accounts<span class="block text-xs text-charcoal-muted">Deletes them and their balance history — right choice for demo accounts</span></span>
								</label>
								<div class="flex justify-end gap-2 pt-1">
									<button
										type="button"
										onclick={() => (sfConfirmingUnlink = false)}
										class="px-3 py-1.5 text-sm font-medium border border-theme text-charcoal-soft rounded-lg hover:bg-surface-alt transition-colors"
									>
										Cancel
									</button>
									<button
										type="button"
										onclick={() => sfDisconnect(sfUnlinkMode)}
										disabled={sfBusy}
										class="px-3 py-1.5 text-sm font-medium bg-danger-500 text-white rounded-lg hover:bg-danger-600 transition-colors disabled:opacity-50"
									>
										{sfBusy ? 'Unlinking…' : 'Unlink'}
									</button>
								</div>
							</div>
						{/if}

						{#if sfUpstream}
							<div class="space-y-2">
								<h3 class="text-xs font-medium uppercase tracking-wider text-charcoal-muted">Available accounts</h3>
								{#each sfUpstream as up (up.simplefinId)}
									{@const existing = sfConnectedTo(up.simplefinId)}
									<div class="flex items-center gap-3 px-3 py-2.5 bg-surface-alt rounded-lg">
										<div class="flex-1 min-w-0">
											<p class="text-sm font-medium text-charcoal truncate">{up.name}</p>
											<p class="text-xs text-charcoal-muted">{up.institution} · <span class="font-mono">${up.balance.toLocaleString()}</span></p>
										</div>
										{#if existing}
											<span class="badge bg-success-100 text-success-600">Connected</span>
										{:else}
											<select
												bind:value={sfMapping[up.simplefinId]}
												class="px-2 py-1.5 text-sm bg-surface border border-theme rounded-lg"
												aria-label="Where to connect {up.name}"
											>
												<option value="new">Create new</option>
												{#each sfManualAccounts as manual (manual.id)}
													<option value={String(manual.id)}>Link to: {manual.name}</option>
												{/each}
											</select>
											<button
												type="button"
												onclick={() => sfAddUpstream(up)}
												class="px-3 py-1.5 text-sm font-medium bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
											>
												Add
											</button>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>
				{/if}

				{#if activeSection === 'about'}
			<!-- About -->
			<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
				<div class="px-6 py-4 border-b border-dashed border-theme-dashed">
					<h2 class="font-display text-xl font-medium text-charcoal">About</h2>
				</div>
				<div class="p-6">
					<p class="text-sm text-charcoal-soft">
						Ledger is a local-first app for personal budget tracking with expense splitting.
						All data is stored locally on your device.
					</p>
				</div>
			</div>
				{/if}
				</div>
			</div>
		{/if}
	</main>
</div>

<ConfirmDialog
	isOpen={showJsonImportConfirm}
	title="Replace All Data?"
	message="This will replace all your data with the contents of the backup file. This cannot be undone."
	confirmText="Replace Data"
	variant="danger"
	onConfirm={handleJSONImportConfirm}
	onCancel={handleJSONImportCancel}
/>
