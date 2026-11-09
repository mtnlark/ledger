<script lang="ts">
	import { onMount } from 'svelte';
	import Settings from '../../../routes/settings/+page.svelte';
	let revision = $state(0);
	onMount(() => {
		const refresh = () => { revision++; };
		window.addEventListener('ledger:data-replaced', refresh);
		return () => window.removeEventListener('ledger:data-replaced', refresh);
	});
</script>
{#key revision}<Settings />{/key}
