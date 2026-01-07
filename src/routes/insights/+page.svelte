<script lang="ts">
	import HeaderNav from '$lib/components/HeaderNav.svelte';
</script>

<svelte:head>
	<title>Insights - Budget Tracker</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<!-- Header -->
	<HeaderNav title="Insights" showBack={true} />

	<!-- Main Content -->
	<main class="max-w-4xl mx-auto px-4 py-6">
		<div class="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
			<div class="text-4xl mb-4">📊</div>
			<h2 class="text-lg font-semibold text-gray-900 mb-2">Coming Soon</h2>
			<p class="text-gray-500">
				Category breakdowns, spending trends, and monthly comparisons will be available here.
			</p>
		</div>
	</main>
</div>
