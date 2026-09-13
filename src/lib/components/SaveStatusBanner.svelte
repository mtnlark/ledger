<script lang="ts">
	import { saveStatus, retryPersistence } from '$lib/storage';
	import { exportAllDataToJSON, downloadFile } from '$lib/utils/export';
	let message = $state('');
	async function retry() { try { await retryPersistence(); message = ''; } catch (error) { message = String(error); } }
	async function exportBackup() { try { downloadFile(await exportAllDataToJSON(), 'ledger-unsaved-backup.json', 'application/json'); } catch (error) { message = String(error); } }
</script>
{#if $saveStatus === 'unsaved'}
	<div role="alert" class="sticky top-0 z-[100] bg-amber-100 text-amber-950 p-4 border-b border-amber-400">
		<strong>Changes not saved to disk</strong>
		<p>Your changes are in this session. Retry saving before making more changes.</p>
		<button class="underline mr-4" onclick={retry}>Retry</button><button class="underline" onclick={exportBackup}>Export Backup</button>
		{#if message}<p>{message}</p>{/if}
	</div>
{:else if $saveStatus === 'saving'}
	<div role="status" class="text-sm px-4">Saving…</div>
{/if}
