<script lang="ts">
	import ModalContainer from './ModalContainer.svelte';
	import TransactionForm, {
		type TransactionFormData,
		type SplitTransactionFormData
	} from './TransactionForm.svelte';
	import type { Category, Settings } from '$lib/db';
	import type { EntryTemplate } from '$lib/planning/types';

	interface Props {
		isOpen: boolean;
		categories: Category[];
		settings: Settings;
		initialTemplate?: EntryTemplate | null;
		onSubmit: (data: TransactionFormData) => Promise<void> | void;
		onSplitSubmit?: (data: SplitTransactionFormData) => Promise<void> | void;
		onClose: () => void;
	}

	let { isOpen, categories, settings, initialTemplate = null, onSubmit, onSplitSubmit, onClose }: Props = $props();
	let selectedTemplateId = $state('');
	$effect(() => { if (!isOpen) selectedTemplateId = ''; });
	let template = $derived(settings.planning?.templates.find(t => t.id === selectedTemplateId) ?? initialTemplate);

	// Close after the action settles; errors surface via toast from the action layer.
	async function handleSubmit(data: TransactionFormData) {
		await onSubmit(data);
		onClose();
	}

	async function handleSplitSubmit(data: SplitTransactionFormData) {
		await onSplitSubmit?.(data);
		onClose();
	}
</script>

<ModalContainer {isOpen} title="Add Transaction" maxWidth="xl" {onClose}>
	{#if settings.planning?.templates.length}
		<label class="block px-6 pt-4 text-sm">Saved template
			<select bind:value={selectedTemplateId} class="block w-full mt-1 p-2 border border-theme rounded-lg bg-surface-alt"><option value="">Choose a template</option>{#each settings.planning.templates as entry (entry.id)}<option value={entry.id}>{entry.name}</option>{/each}</select>
		</label>
	{/if}
	<TransactionForm
		{categories}
		{settings}
		initialTemplate={template}
		onSubmit={handleSubmit}
		onSplitSubmit={onSplitSubmit ? handleSplitSubmit : undefined}
		onCancel={onClose}
	/>
</ModalContainer>
