<script lang="ts">
	interface Props {
		activeTab: string;
		onTabChange: (tab: string) => void;
	}

	let { activeTab, onTabChange }: Props = $props();

	const tabs = [
		{ id: 'overview', label: 'Overview' },
		{ id: 'spending', label: 'Spending' },
		{ id: 'savings', label: 'Savings' },
		{ id: 'recurring', label: 'Recurring' },
		{ id: 'year-in-review', label: 'Year in Review' }
	];
</script>

<nav aria-label="Insights tabs" class="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
	{#each tabs as tab}
		<button
			type="button"
			role="tab"
			aria-selected={activeTab === tab.id}
			aria-controls="insights-tabpanel"
			class="px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors
				{activeTab === tab.id
					? 'bg-primary-500 text-white shadow-sm'
					: 'bg-surface-alt text-charcoal-soft hover:bg-cream-dark'}"
			onclick={() => onTabChange(tab.id)}
		>
			{tab.label}
		</button>
	{/each}
</nav>
