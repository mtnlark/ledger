<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	let deferredPrompt: any = null;
	let showPrompt = $state(false);
	let isInstalled = $state(false);

	onMount(() => {
		if (!browser) return;

		// Check if already installed
		if (window.matchMedia('(display-mode: standalone)').matches) {
			isInstalled = true;
			return;
		}

		// Listen for the beforeinstallprompt event
		window.addEventListener('beforeinstallprompt', (e: Event) => {
			e.preventDefault();
			deferredPrompt = e;
			showPrompt = true;
		});

		// Listen for successful installation
		window.addEventListener('appinstalled', () => {
			showPrompt = false;
			isInstalled = true;
			deferredPrompt = null;
		});
	});

	async function handleInstall() {
		if (!deferredPrompt) return;

		deferredPrompt.prompt();
		const { outcome } = await deferredPrompt.userChoice;

		if (outcome === 'accepted') {
			showPrompt = false;
		}
		deferredPrompt = null;
	}

	function handleDismiss() {
		showPrompt = false;
		// Store dismissal in localStorage to avoid showing again for a while
		if (browser) {
			localStorage.setItem('pwa-prompt-dismissed', Date.now().toString());
		}
	}
</script>

{#if showPrompt && !isInstalled}
	<div class="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-40">
		<div class="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
			<div class="flex items-start gap-3">
				<div class="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
					<span class="text-xl">💰</span>
				</div>
				<div class="flex-1 min-w-0">
					<p class="text-sm font-medium text-gray-900">Install Budget Tracker</p>
					<p class="text-xs text-gray-500 mt-0.5">Add to your home screen for quick access</p>
				</div>
			</div>
			<div class="flex gap-2 mt-3">
				<button
					onclick={handleInstall}
					class="flex-1 bg-blue-600 text-white text-sm font-medium py-2 px-3 rounded-lg hover:bg-blue-700 transition-colors"
				>
					Install
				</button>
				<button
					onclick={handleDismiss}
					class="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
				>
					Not now
				</button>
			</div>
		</div>
	</div>
{/if}
