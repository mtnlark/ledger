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

<div aria-label="Insights tabs" role="tablist" class="flex gap-6 overflow-x-auto border-b border-theme">
	{#each tabs as tab}
		<button
			type="button"
			role="tab"
			aria-selected={activeTab === tab.id}
			aria-controls="insights-tabpanel"
			class="relative pb-2.5 pt-1 text-sm font-medium whitespace-nowrap transition-colors
				{activeTab === tab.id
					? 'text-charcoal'
					: 'text-charcoal-muted hover:text-charcoal'}"
			onclick={() => onTabChange(tab.id)}
		>
			{tab.label}
			{#if activeTab === tab.id}
				<span class="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary-500" aria-hidden="true"></span>
			{/if}
		</button>
	{/each}
</div>
