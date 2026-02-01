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
