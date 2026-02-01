<script lang="ts">
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { Upload, Download, Database, FileSpreadsheet, Sun, Moon, Monitor, Cloud, CloudOff, Command } from 'lucide-svelte';
	import { type Settings, type Category, type Transaction, DEFAULT_SETTINGS } from '$lib/db';
	import { initializeStorage } from '$lib/storage';
	import { getSettings, updateSettings, updateTheme, updateICloudBackup } from '$lib/stores/settings';
	import { isICloudAvailable, getICloudBackupDir } from '$lib/storage/tauri-adapter';
	import { getTransactionsByMonth, getAvailableMonths } from '$lib/stores/transactions';
	import { getAllCategories } from '$lib/stores/categories';
	import HeaderNav from '$lib/components/HeaderNav.svelte';
	import CategoryManager from '$lib/components/CategoryManager.svelte';
	import { readExcelFile, parseExpensesSheet, importTransactions, type ImportResult } from '$lib/utils/import';
	import { exportTransactionsToCSV, exportAllDataToJSON, importFromJSON, downloadFile } from '$lib/utils/export';
	import { toast } from '$lib/stores/toast';

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

	// Import from Excel
	async function handleExcelImport(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		isImporting = true;

		try {
			const workbook = await readExcelFile(file);
			const parsed = parseExpensesSheet(workbook);
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

	// Import from JSON backup
	async function handleJSONImport(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
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
			if (input) input.value = '';
		}
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

	onMount(() => {
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
	<HeaderNav title="Settings" showBack={true} />

	<!-- Main Content -->
	<main class="max-w-4xl mx-auto px-4 py-6 space-y-6">
		{#if isLoading}
			<div class="flex items-center justify-center py-12">
				<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
			</div>
		{:else}
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
							class="px-5 py-2.5 bg-primary-500 text-white font-medium rounded-lg hover:bg-primary-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary-500/25 focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-2 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
						>
							{isSaving ? 'Saving...' : 'Save Settings'}
						</button>
					</div>
				</div>
			</div>

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
										: 'border-[var(--color-border)] hover:border-primary-300 hover:bg-surface-hover'}"
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
									onchange={handleJSONImport}
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
								class="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white font-medium rounded-lg hover:bg-primary-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary-500/25 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
							>
								<Download size={16} />
								Export to CSV
							</button>

							<button
								onclick={handleJSONExport}
								disabled={isExporting}
								class="inline-flex items-center gap-2 px-4 py-2 bg-[#5C5751] text-white font-medium rounded-lg hover:bg-[#4A453F] hover:-translate-y-0.5 hover:shadow-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
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
									{settings.iCloudBackupEnabled ? 'bg-primary-500' : 'bg-[#C5C0B8]'}"
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
	</main>
</div>
