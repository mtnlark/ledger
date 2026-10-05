<script lang="ts">
	import { RefreshCw, X } from 'lucide-svelte';

	interface Props {
		suggestionCount: number;
		onReview: () => void;
		onDismiss: () => void;
	}

	let { suggestionCount, onReview, onDismiss }: Props = $props();
</script>

<div
	class="bg-primary-50 border border-primary-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4"
	role="status"
	aria-live="polite"
>
	<div class="flex items-center gap-3">
		<div class="p-2 bg-primary-100 rounded-lg text-primary-600">
			<RefreshCw size={18} />
		</div>
		<p class="text-sm text-charcoal">
			<span class="font-medium">{suggestionCount}</span>
			expected recurring {suggestionCount === 1 ? 'transaction' : 'transactions'} this month
		</p>
	</div>

	<div class="flex items-center gap-2">
		<button
			type="button"
			onclick={onReview}
			class="px-3 py-1.5 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors"
		>
			Review
		</button>
		<button
			type="button"
			onclick={onDismiss}
			class="p-1.5 text-charcoal-muted hover:text-charcoal hover:bg-primary-100 rounded-lg transition-colors"
			aria-label="Dismiss"
		>
			<X size={18} />
		</button>
	</div>
</div>
