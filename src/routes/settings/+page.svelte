<script lang="ts">
	import { onMount } from 'svelte';
	import { initializeDatabase, type Settings, type Category, type Transaction, DEFAULT_SETTINGS } from '$lib/db';
	import { getSettings, updateSettings } from '$lib/stores/settings';
	import { getTransactionsByMonth, getAvailableMonths } from '$lib/stores/transactions';
	import { getAllCategories } from '$lib/stores/categories';
	import HeaderNav from '$lib/components/HeaderNav.svelte';
	import { readExcelFile, parseExpensesSheet, importTransactions, type ImportResult } from '$lib/utils/import';
	import { exportTransactionsToCSV, exportAllDataToJSON, importFromJSON, downloadFile } from '$lib/utils/export';

	// State
	let isLoading = $state(true);
	let settings = $state<Settings>(DEFAULT_SETTINGS);
	let isSaving = $state(false);
	let saveMessage = $state('');

	// Import/Export state
	let isImporting = $state(false);
	let isExporting = $state(false);
	let importMessage = $state('');
	let importError = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);
	let jsonFileInput = $state<HTMLInputElement | null>(null);

	// Form state
	let partnerName = $state('');
	let defaultSplitType = $state<'percentage' | 'fixed'>('percentage');
	let defaultSplitValue = $state(0.5);

	// Load data
	async function loadData() {
		isLoading = true;
		try {
			await initializeDatabase();
			settings = await getSettings();
			// Initialize form state from settings
			partnerName = settings.partnerName;
			defaultSplitType = settings.defaultSplitType;
			defaultSplitValue = settings.defaultSplitValue;
		} catch (error) {
			console.error('Failed to load settings:', error);
		} finally {
			isLoading = false;
		}
	}

	async function handleSave() {
		isSaving = true;
		saveMessage = '';
		try {
			await updateSettings({
				partnerName,
				defaultSplitType,
				defaultSplitValue
			});
			settings = await getSettings();
			saveMessage = 'Settings saved!';
			setTimeout(() => {
				saveMessage = '';
			}, 2000);
		} catch (error) {
			console.error('Failed to save settings:', error);
			saveMessage = 'Failed to save settings';
		} finally {
			isSaving = false;
		}
	}

	// Import from Excel
	async function handleExcelImport(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		isImporting = true;
		importMessage = '';
		importError = false;

		try {
			const workbook = await readExcelFile(file);
			const parsed = parseExpensesSheet(workbook);
			const result = await importTransactions(parsed, { skipDuplicates: true });

			if (result.success) {
				importMessage = `Successfully imported ${result.imported} transactions. ${result.skipped} skipped (duplicates or missing categories).`;
			} else {
				importError = true;
				importMessage = `Import completed with errors: ${result.imported} imported, ${result.skipped} skipped. Errors: ${result.errors.slice(0, 3).join(', ')}`;
			}
		} catch (error) {
			importError = true;
			importMessage = `Import failed: ${error}`;
		} finally {
			isImporting = false;
			// Reset file input
			if (input) input.value = '';
		}
	}

	// Import from JSON backup
	async function handleJSONImport(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		isImporting = true;
		importMessage = '';
		importError = false;

		try {
			const text = await file.text();
			const result = await importFromJSON(text);

			if (result.success) {
				importMessage = result.message;
			} else {
				importError = true;
				importMessage = result.message;
			}
		} catch (error) {
			importError = true;
			importMessage = `Import failed: ${error}`;
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
			const filename = `budget-tracker-export-${new Date().toISOString().slice(0, 10)}.csv`;
			downloadFile(csv, filename, 'text/csv');
		} catch (error) {
			console.error('Export failed:', error);
		} finally {
			isExporting = false;
		}
	}

	// Export full backup to JSON
	async function handleJSONExport() {
		isExporting = true;
		try {
			const json = await exportAllDataToJSON();
			const filename = `budget-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
			downloadFile(json, filename, 'application/json');
		} catch (error) {
			console.error('Backup failed:', error);
		} finally {
			isExporting = false;
		}
	}

	onMount(() => {
		loadData();
	});
</script>

<svelte:head>
	<title>Settings - Budget Tracker</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<!-- Header -->
	<HeaderNav title="Settings" showBack={true} />

	<!-- Main Content -->
	<main class="max-w-4xl mx-auto px-4 py-6 space-y-6">
		{#if isLoading}
			<div class="flex items-center justify-center py-12">
				<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
			</div>
		{:else}
			<!-- Partner Settings -->
			<div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
				<div class="px-6 py-4 border-b border-gray-100">
					<h2 class="text-lg font-semibold text-gray-900">Expense Sharing</h2>
					<p class="text-sm text-gray-500 mt-1">Configure default settings for shared expenses</p>
				</div>

				<div class="p-6 space-y-5">
					<!-- Partner Name -->
					<div>
						<label for="partnerName" class="block text-sm font-medium text-gray-700 mb-1">
							Partner Name
						</label>
						<input
							type="text"
							id="partnerName"
							bind:value={partnerName}
							placeholder="e.g., Alex"
							class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						/>
						<p class="mt-1 text-xs text-gray-500">
							Used when displaying shared expenses (e.g., "Outstanding balance with {partnerName || 'Partner'}")
						</p>
					</div>

					<!-- Default Split Type -->
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-2">
							Default Split Type
						</label>
						<div class="flex gap-4">
							<label class="flex items-center gap-2 cursor-pointer">
								<input
									type="radio"
									name="splitType"
									value="percentage"
									bind:group={defaultSplitType}
									class="text-blue-600 focus:ring-blue-500"
								/>
								<span class="text-sm text-gray-700">Percentage (%)</span>
							</label>
							<label class="flex items-center gap-2 cursor-pointer">
								<input
									type="radio"
									name="splitType"
									value="fixed"
									bind:group={defaultSplitType}
									class="text-blue-600 focus:ring-blue-500"
								/>
								<span class="text-sm text-gray-700">Fixed Amount ($)</span>
							</label>
						</div>
					</div>

					<!-- Default Split Value -->
					<div>
						<label for="splitValue" class="block text-sm font-medium text-gray-700 mb-1">
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
									class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
								/>
								<p class="mt-1 text-xs text-gray-500">
									Enter as decimal (0.5 = 50%). Partner pays {Math.round(defaultSplitValue * 100)}% of shared expenses.
								</p>
							{:else}
								<span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
								<input
									type="number"
									id="splitValue"
									bind:value={defaultSplitValue}
									step="0.01"
									min="0"
									class="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
								/>
								<p class="mt-1 text-xs text-gray-500">
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
							class="px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{isSaving ? 'Saving...' : 'Save Settings'}
						</button>
						{#if saveMessage}
							<span class="text-sm text-green-600 font-medium">{saveMessage}</span>
						{/if}
					</div>
				</div>
			</div>

			<!-- Data Management -->
			<div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
				<div class="px-6 py-4 border-b border-gray-100">
					<h2 class="text-lg font-semibold text-gray-900">Data Management</h2>
					<p class="text-sm text-gray-500 mt-1">Import and export your budget data</p>
				</div>

				<div class="p-6 space-y-6">
					<!-- Import Section -->
					<div>
						<h3 class="text-sm font-medium text-gray-900 mb-3">Import Data</h3>
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
									class="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 cursor-pointer transition-colors"
								>
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
									</svg>
									Import from Excel
								</label>
								<span class="text-xs text-gray-500">(.xlsx with "Expenses" sheet)</span>
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
									class="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 cursor-pointer transition-colors"
								>
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
									</svg>
									Restore from Backup
								</label>
								<span class="text-xs text-gray-500">(.json backup file)</span>
							</div>
						</div>

						<!-- Import Status Message -->
						{#if importMessage}
							<div class="mt-3 p-3 rounded-lg {importError ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}">
								<p class="text-sm">{importMessage}</p>
							</div>
						{/if}

						{#if isImporting}
							<div class="mt-3 flex items-center gap-2 text-sm text-gray-600">
								<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
								<span>Importing...</span>
							</div>
						{/if}
					</div>

					<!-- Divider -->
					<div class="border-t border-gray-100"></div>

					<!-- Export Section -->
					<div>
						<h3 class="text-sm font-medium text-gray-900 mb-3">Export Data</h3>
						<div class="flex flex-wrap gap-3">
							<button
								onclick={handleCSVExport}
								disabled={isExporting}
								class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
							>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
								</svg>
								Export to CSV
							</button>

							<button
								onclick={handleJSONExport}
								disabled={isExporting}
								class="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
							>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
								</svg>
								Full Backup (JSON)
							</button>
						</div>

						{#if isExporting}
							<div class="mt-3 flex items-center gap-2 text-sm text-gray-600">
								<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
								<span>Exporting...</span>
							</div>
						{/if}
					</div>

					<!-- Info -->
					<div class="bg-blue-50 rounded-lg p-4 border border-blue-100">
						<p class="text-sm text-blue-800">
							<strong>Note:</strong> Your data is stored locally in your browser using IndexedDB.
							Regular backups are recommended to prevent data loss.
						</p>
					</div>
				</div>
			</div>

			<!-- About -->
			<div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
				<div class="px-6 py-4 border-b border-gray-100">
					<h2 class="text-lg font-semibold text-gray-900">About</h2>
				</div>
				<div class="p-6">
					<p class="text-sm text-gray-600">
						Budget Tracker is a local-first PWA for personal budget tracking with expense splitting.
						All data is stored in your browser using IndexedDB.
					</p>
				</div>
			</div>
		{/if}
	</main>
</div>
