<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import SideNav from '$lib/components/SideNav.svelte';
	import ToastContainer from '$lib/components/ToastContainer.svelte';
	import KeyboardShortcuts from '$lib/components/KeyboardShortcuts.svelte';
	import { page } from '$app/stores';
	import { settings, updateSettings } from '$lib/stores/settings';
	import { applyTheme, initThemeListener } from '$lib/stores/theme';
	import { initNotifications, cleanupNotifications, isNotificationPermissionGranted } from '$lib/notifications';
	import { purgeDeletedTransactions, addTransaction } from '$lib/stores/transactions';
	import SaveStatusBanner from '$lib/components/SaveStatusBanner.svelte';
	import { createQuickAddHandler, type QuickAddRequest } from '$lib/services/quick-add';
	import { retryPersistence } from '$lib/storage';
	import { registerStorageCallbacks, initializeStorage } from '$lib/storage';
	import { toast } from '$lib/stores/toast';
	import { db } from '$lib/db';
	import { onDestroy, onMount } from 'svelte';

	// Wire storage layer UI feedback to toast (keeps storage UI-agnostic)
	registerStorageCallbacks({
		onWarning: (msg, duration) => toast.warning(msg, duration),
		onError: (msg, duration) => toast.error(msg, duration)
	});

	let { children } = $props();
	let dataRevision = $state(0);
	onMount(() => {
		const refresh = () => { dataRevision++; };
		window.addEventListener('ledger:data-replaced', refresh);
		return () => window.removeEventListener('ledger:data-replaced', refresh);
	});

	// The menu-bar quick-add window renders this same layout; it gets a bare
	// shell and skips anything that writes or schedules (single-writer rule).
	let isQuickWindow = $derived($page.url.pathname.startsWith('/quick-add'));

	let cleanupListener: (() => void) | null = null;

	onMount(() => {
		if (isQuickWindow) return;
		void initializeStorage()
			.then(() => purgeDeletedTransactions())
			.catch((error) => console.error('Startup cleanup failed:', error));
	});

	// Apply theme reactively when settings change
	$effect(() => {
		const currentSettings = $settings;
		if (currentSettings?.theme) {
			applyTheme(currentSettings.theme);
			cleanupListener?.();
			cleanupListener = initThemeListener(currentSettings.theme);
		}
	});

	// Notification scheduler — restarts whenever notification settings change
	$effect(() => {
		if (isQuickWindow) return;
		const s = $settings;
		if (!s?.notificationsEnabled) {
			cleanupNotifications();
			return;
		}

		let cancelled = false;
		void (async () => {
			await initializeStorage();
			if (cancelled) return;

			const now = new Date();
			const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
			const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
			const todayCount = await db.transactions
				.where('date')
				.between(todayStart, todayEnd, true, true)
				.count();

			const started = await initNotifications(s, todayCount > 0);
			if (cancelled) return;

			if (!started && s.notificationsEnabled) {
				const stillGranted = await isNotificationPermissionGranted();
				if (!stillGranted) {
					await updateSettings({ notificationsEnabled: false });
				}
			}
		})().catch((error) => console.error('Notification setup failed:', error));

		return () => {
			cancelled = true;
			cleanupNotifications();
		};
	});

	// Receive transactions submitted from the quick-add window. This window is
	// the single writer of data.json; the quick window only reads shared Dexie.
	let unlistenQuickAdd: (() => void) | null = null;

	onMount(() => {
		if (isQuickWindow) return;
		(async () => {
			try {
				const { listen, emit } = await import('@tauri-apps/api/event');
				const handle = createQuickAddHandler(async (data) => { await initializeStorage(); return addTransaction(data); }, retryPersistence);
				unlistenQuickAdd = await listen<QuickAddRequest>('ledger://quick-add-submit', async (event) => {
					const result = await handle(event.payload);
					await emit('ledger://quick-add-result', result);
					if (result.status === 'saved') window.dispatchEvent(new CustomEvent('ledger:transactions-changed'));
				});
			} catch {
				// Not running inside Tauri (tests / plain web) — quick add unavailable
			}
		})();
		return () => unlistenQuickAdd?.();
	});

	// Daily SimpleFIN balance sync on app open (main window only; single writer)
	onMount(() => {
		if (isQuickWindow) return;
		(async () => {
			try {
				await initializeStorage();
				const { maybeSyncOnLaunch } = await import('$lib/services/simplefin');
				if (await maybeSyncOnLaunch()) {
					window.dispatchEvent(new CustomEvent('ledger:networth-changed'));
				}
			} catch {
				// Non-Tauri environment, or sync failure — statuses are recorded per account
			}
		})();
	});

	onDestroy(() => {
		cleanupListener?.();
		cleanupNotifications();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if isQuickWindow}
	<!-- Quick-add window: bare shell, no nav or app-wide shortcuts -->
	{@render children()}
{:else}
	<a
		href="#main-content"
		class="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary-500 focus:text-white focus:rounded-lg focus:font-medium focus:text-sm focus:shadow-lg"
	>
		Skip to content
	</a>

	<div class="flex min-h-screen">
		<!-- Sidebar navigation -->
		<SideNav />

		<!-- Main content -->
		<div class="flex-1" id="main-content">
			<SaveStatusBanner />
			{#key dataRevision}{@render children()}{/key}
		</div>
	</div>

	<!-- Toast Notifications -->
	<ToastContainer />

	<!-- App-wide keyboard shortcuts (pages register context-specific handlers) -->
	<KeyboardShortcuts />
{/if}
