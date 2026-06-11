<script lang="ts">
	import { onMount } from 'svelte';
	import { Check } from 'lucide-svelte';
	import { DEFAULT_SETTINGS, type Category, type Settings } from '$lib/db';
	import { getAllCategories } from '$lib/stores/categories';
	import { getSettings } from '$lib/stores/settings';
	import TransactionForm, { type TransactionFormData } from '$lib/components/TransactionForm.svelte';

	let categories = $state<Category[]>([]);
	let settings = $state<Settings>(DEFAULT_SETTINGS);
	let ready = $state(false);
	let justAdded = $state(false);

	// This window reads the IndexedDB the main window owns and populates. It must
	// NEVER call initializeStorage() (which clears and reloads the shared tables)
	// or write through the storage layer — submits are handed to the main window.
	async function loadContext() {
		try {
			const [cats, s] = await Promise.all([getAllCategories(), getSettings()]);
			if (cats.length > 0) {
				categories = cats;
				settings = s;
				ready = true;
			}
		} catch {
			// Main window hasn't initialized storage yet — retry below
		}
	}

	onMount(() => {
		loadContext();
		// Retry until the main window has populated the shared database,
		// and refresh context whenever this window is shown again
		const retry = setInterval(() => {
			if (ready) {
				clearInterval(retry);
			} else {
				loadContext();
			}
		}, 1500);
		const onVisible = () => {
			if (document.visibilityState === 'visible') loadContext();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			clearInterval(retry);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	async function handleSubmit(data: TransactionFormData) {
		// Hand the transaction to the main window — the single writer of data.json
		const { emit } = await import('@tauri-apps/api/event');
		await emit('ledger://quick-add-submit', { ...data, date: data.date.toISOString() });
		justAdded = true;
		setTimeout(async () => {
			justAdded = false;
			const { getCurrentWindow } = await import('@tauri-apps/api/window');
			await getCurrentWindow().hide();
		}, 900);
	}

	async function handleCancel() {
		const { getCurrentWindow } = await import('@tauri-apps/api/window');
		await getCurrentWindow().hide();
	}
</script>

<svelte:head>
	<title>Quick Add — Ledger</title>
</svelte:head>

<div class="min-h-screen bg-cream">
	{#if justAdded}
		<div class="flex flex-col items-center justify-center min-h-screen gap-3">
			<div class="w-12 h-12 rounded-full bg-success-100 text-success-600 flex items-center justify-center">
				<Check size={28} strokeWidth={2.5} />
			</div>
			<p class="font-medium text-charcoal">Added</p>
		</div>
	{:else if !ready}
		<div class="flex items-center justify-center min-h-screen px-8 text-center">
			<p class="text-sm text-charcoal-muted">Waiting for Ledger to finish loading…</p>
		</div>
	{:else}
		<TransactionForm {categories} {settings} onSubmit={handleSubmit} onCancel={handleCancel} />
	{/if}
</div>
