<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import SideNav from '$lib/components/SideNav.svelte';
	import ToastContainer from '$lib/components/ToastContainer.svelte';
	import { settings, updateSettings } from '$lib/stores/settings';
	import { applyTheme, initThemeListener } from '$lib/stores/theme';
	import { initNotifications, cleanupNotifications, isNotificationPermissionGranted } from '$lib/notifications';
	import { purgeDeletedTransactions } from '$lib/stores/transactions';
	import { db } from '$lib/db';
	import { onDestroy } from 'svelte';

	let { children } = $props();

	let cleanupListener: (() => void) | null = null;
	let hasPurgedDeleted = false;

	// One-time startup cleanup: permanently remove soft-deleted transactions from previous sessions
	$effect(() => {
		if (hasPurgedDeleted) return;
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

	onDestroy(() => {
		cleanupListener?.();
		cleanupNotifications();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

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
