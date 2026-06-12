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
	import { registerStorageCallbacks, initializeStorage } from '$lib/storage';
	import type { TransactionFormData } from '$lib/components/TransactionForm.svelte';
	import { toast } from '$lib/stores/toast';
	import { db } from '$lib/db';
	import { onDestroy, onMount } from 'svelte';

	// Wire storage layer UI feedback to toast (keeps storage UI-agnostic)
	registerStorageCallbacks({
		onWarning: (msg, duration) => toast.warning(msg, duration),
		onError: (msg, duration) => toast.error(msg, duration)
	});

	let { children } = $props();

	// The menu-bar quick-add window renders this same layout; it gets a bare
	// shell and skips anything that writes or schedules (single-writer rule).
	let isQuickWindow = $derived($page.url.pathname.startsWith('/quick-add'));

	let cleanupListener: (() => void) | null = null;
	let hasPurgedDeleted = false;

	// One-time startup cleanup: permanently remove soft-deleted transactions from previous sessions
	$effect(() => {
		if (hasPurgedDeleted || isQuickWindow) return;
		hasPurgedDeleted = true;

		purgeDeletedTransactions().then((count) => {
			if (count > 0 && import.meta.env.DEV) {
				console.log(`Purged ${count} soft-deleted transactions from previous session`);
			}
		});
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

		// Start notifications asynchronously
		(async () => {
			// Check if today has any transactions (for daily reminder skip logic)
			const now = new Date();
			const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
			const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
			const todayCount = await db.transactions
				.where('date')
				.between(todayStart, todayEnd, true, true)
				.count();

			const started = await initNotifications(s, todayCount > 0);

			// If OS permission was revoked, silently disable notifications
			if (!started && s.notificationsEnabled) {
				const stillGranted = await isNotificationPermissionGranted();
				if (!stillGranted) {
					await updateSettings({ notificationsEnabled: false });
				}
			}
		})();

		return () => cleanupNotifications();
	});

	// Receive transactions submitted from the quick-add window. This window is
	// the single writer of data.json; the quick window only reads shared Dexie.
	let unlistenQuickAdd: (() => void) | null = null;

	onMount(() => {
		if (isQuickWindow) return;
		(async () => {
			try {
				const { listen } = await import('@tauri-apps/api/event');
				unlistenQuickAdd = await listen<Omit<TransactionFormData, 'date'> & { date: string }>(
					'ledger://quick-add-submit',
					async (event) => {
						try {
							await initializeStorage();
							await addTransaction({ ...event.payload, date: new Date(event.payload.date) });
							toast.success('Transaction added');
							window.dispatchEvent(new CustomEvent('ledger:transactions-changed'));
						} catch (error) {
							console.error('Quick add failed:', error);
							toast.error('Failed to add transaction');
						}
					}
				);
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
			{@render children()}
		</div>
	</div>

	<!-- Toast Notifications -->
	<ToastContainer />

	<!-- App-wide keyboard shortcuts (pages register context-specific handlers) -->
	<KeyboardShortcuts />
{/if}
