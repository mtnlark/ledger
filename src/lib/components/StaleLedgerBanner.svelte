<script lang="ts">
	import { CalendarClock, X } from 'lucide-svelte';

	interface Props {
		daysSinceEntry: number;
		onAddTransaction: () => void;
		onDismiss: () => void;
	}

	let { daysSinceEntry, onAddTransaction, onDismiss }: Props = $props();
</script>

<div class="bg-warning-50 border border-warning-200 rounded-xl px-4 py-3 flex items-center gap-3" role="status">
	<div class="p-1.5 bg-warning-100 rounded-lg text-warning-600 flex-shrink-0">
		<CalendarClock size={16} />
	</div>
	<div class="flex-1 min-w-0">
		<p class="text-sm font-medium text-charcoal">Nothing logged in {daysSinceEntry} days</p>
		<p class="text-xs text-charcoal-muted">
			Make sure your transactions are up to date so budgets and insights stay accurate.
		</p>
	</div>
	<button
		type="button"
		onclick={onAddTransaction}
		class="px-3 py-1.5 text-sm font-medium rounded-lg bg-warning-500 text-white hover:bg-warning-600 transition-colors btn-press flex-shrink-0"
	>
		Add transaction
	</button>
	<button
		type="button"
		onclick={onDismiss}
		class="p-1.5 text-charcoal-muted hover:text-charcoal hover:bg-warning-100 rounded-lg transition-colors flex-shrink-0"
		aria-label="Dismiss reminder for a week"
		title="Dismiss for a week"
	>
		<X size={16} />
	</button>
</div>
