<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import BottomNav from '$lib/components/BottomNav.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<!-- Main content with padding for bottom nav on mobile -->
<div class="pb-16 md:pb-0">
	{@render children()}
</div>

<!-- Mobile bottom navigation -->
<BottomNav />
