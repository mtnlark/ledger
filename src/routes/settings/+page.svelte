<script lang="ts">
	import { onMount } from 'svelte';
	import { initializeDatabase, type Settings, DEFAULT_SETTINGS } from '$lib/db';
	import { getSettings, updateSettings } from '$lib/stores/settings';
	import HeaderNav from '$lib/components/HeaderNav.svelte';

	// State
	let isLoading = $state(true);
	let settings = $state<Settings>(DEFAULT_SETTINGS);
	let isSaving = $state(false);
	let saveMessage = $state('');

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

				<div class="p-6 space-y-4">
					<div class="bg-amber-50 rounded-lg p-4 border border-amber-100">
						<p class="text-sm text-amber-800">
							Import/export functionality coming soon. Your data is stored locally in your browser.
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
