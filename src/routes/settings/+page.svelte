<script lang="ts">
	import { onMount } from 'svelte';
	import { Upload, Download, Database, FileSpreadsheet } from 'lucide-svelte';
	import { initializeDatabase, type Settings, type Category, type Transaction, DEFAULT_SETTINGS } from '$lib/db';
	import { getSettings, updateSettings } from '$lib/stores/settings';
	import { getTransactionsByMonth, getAvailableMonths } from '$lib/stores/transactions';
	import { getAllCategories } from '$lib/stores/categories';
	import HeaderNav from '$lib/components/HeaderNav.svelte';
	import { readExcelFile, parseExpensesSheet, importTransactions, fixTransactionDates, diagnoseDates, type ImportResult } from '$lib/utils/import';
	import { exportTransactionsToCSV, exportAllDataToJSON, importFromJSON, downloadFile } from '$lib/utils/export';
	import { Wrench } from 'lucide-svelte';
	import { toast } from '$lib/stores/toast';

	// State
	let isLoading = $state(true);
	let settings = $state<Settings>(DEFAULT_SETTINGS);
	let isSaving = $state(false);

	// Import/Export state
	let isImporting = $state(false);
	let isExporting = $state(false);
	let isFixingDates = $state(false);
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
			const filename = `budget-tracker-export-${new Date().toISOString().slice(0, 10)}.csv`;
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
			const filename = `budget-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
			downloadFile(json, filename, 'application/json');
			toast.success('Backup downloaded');
		} catch (error) {
			console.error('Backup failed:', error);
			toast.error('Backup failed');
		} finally {
			isExporting = false;
		}
	}

	// Fix transaction dates that were incorrectly stored due to timezone issues
	async function handleFixDates() {
		isFixingDates = true;
		try {
			const result = await fixTransactionDates();
			console.log('Fix dates result:', result);

			if (result.fixed > 0) {
				toast.success(`Fixed ${result.fixed} of ${result.checked} transaction dates`);
			} else {
				toast.warning(`Checked ${result.checked} transactions - no evening-hour dates found`);
			}

			// Log details for debugging
			if (result.details.length > 0) {
				console.log('Date fix details:', result.details);
			}
		} catch (error) {
			console.error('Failed to fix dates:', error);
			toast.error('Failed to fix dates');
		} finally {
			isFixingDates = false;
		}
	}

	// Diagnose date storage issues
	async function handleDiagnoseDates() {
		try {
			const diagnosis = await diagnoseDates();
			console.log('=== DATE DIAGNOSIS ===');
			console.log(`Total transactions: ${diagnosis.total}`);
			console.log('\n--- First 10 transactions ---');
			console.table(diagnosis.samples);

			if (diagnosis.monthBoundaryIssues.length > 0) {
				console.log('\n--- Transactions on month boundaries (potential off-by-one) ---');
				console.table(diagnosis.monthBoundaryIssues);
			}

			// Show a summary toast
			const boundaryCount = diagnosis.monthBoundaryIssues.length;
			if (boundaryCount > 0) {
				toast.success(`Found ${boundaryCount} transactions on month boundaries - check console`);
			} else {
				toast.success(`Check console for ${diagnosis.total} transactions`);
			}
		} catch (error) {
			console.error('Diagnosis failed:', error);
			toast.error('Failed to diagnose dates');
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
									<FileSpreadsheet size={16} />
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
									<Upload size={16} />
									Restore from Backup
								</label>
								<span class="text-xs text-gray-500">(.json backup file)</span>
							</div>
						</div>

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
								<Download size={16} />
								Export to CSV
							</button>

							<button
								onclick={handleJSONExport}
								disabled={isExporting}
								class="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
							>
								<Database size={16} />
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

					<!-- Divider -->
					<div class="border-t border-gray-100"></div>

					<!-- Maintenance Section -->
					<div>
						<h3 class="text-sm font-medium text-gray-900 mb-3">Maintenance</h3>
						<div class="space-y-3">
							<div class="flex flex-wrap items-start gap-3">
								<button
									onclick={handleFixDates}
									disabled={isFixingDates}
									class="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-800 font-medium rounded-lg hover:bg-amber-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
								>
									<Wrench size={16} />
									{isFixingDates ? 'Fixing...' : 'Fix Transaction Dates'}
								</button>
								<button
									onclick={handleDiagnoseDates}
									class="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
								>
									Diagnose Dates
								</button>
							</div>
							<p class="text-xs text-gray-500">
								Use "Diagnose Dates" to check how dates are stored (see browser console).
								"Fix Transaction Dates" repairs dates that appear one day off due to timezone issues.
							</p>

							{#if isFixingDates}
								<div class="flex items-center gap-2 text-sm text-gray-600">
									<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-600"></div>
									<span>Checking and fixing dates...</span>
								</div>
							{/if}
						</div>
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
