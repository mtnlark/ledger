<script lang="ts">
	import ModalContainer from './ModalContainer.svelte';
	import TransactionForm, {
		type TransactionFormData,
		type SplitTransactionFormData
	} from './TransactionForm.svelte';
	import type { Category, Settings } from '$lib/db';

	interface Props {
		isOpen: boolean;
		categories: Category[];
		settings: Settings;
		onSubmit: (data: TransactionFormData) => Promise<void> | void;
		onSplitSubmit?: (data: SplitTransactionFormData) => Promise<void> | void;
		onClose: () => void;
	}

	let { isOpen, categories, settings, onSubmit, onSplitSubmit, onClose }: Props = $props();

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
	<TransactionForm
		{categories}
		{settings}
		onSubmit={handleSubmit}
		onSplitSubmit={onSplitSubmit ? handleSplitSubmit : undefined}
		onCancel={onClose}
	/>
</ModalContainer>
