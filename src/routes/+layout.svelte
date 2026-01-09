<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import SideNav from '$lib/components/SideNav.svelte';
	import ToastContainer from '$lib/components/ToastContainer.svelte';

	let { children } = $props();
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
