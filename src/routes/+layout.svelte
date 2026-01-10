<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import SideNav from '$lib/components/SideNav.svelte';
	import ToastContainer from '$lib/components/ToastContainer.svelte';
	import { settings } from '$lib/stores/settings';
	import { applyTheme, initThemeListener } from '$lib/stores/theme';
	import { onDestroy } from 'svelte';

	let { children } = $props();

	let cleanupListener: (() => void) | null = null;

	// Apply theme reactively when settings change
	$effect(() => {
		const currentSettings = $settings;
		if (currentSettings?.theme) {
			applyTheme(currentSettings.theme);
			cleanupListener?.();
			cleanupListener = initThemeListener(currentSettings.theme);
		}
	});

	onDestroy(() => {
		cleanupListener?.();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="flex min-h-screen">
	<!-- Sidebar navigation -->
	<SideNav />

	<!-- Main content -->
	<div class="flex-1">
		{@render children()}
	</div>
</div>

<!-- Toast Notifications -->
<ToastContainer />
