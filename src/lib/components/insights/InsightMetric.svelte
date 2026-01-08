<script lang="ts">
	interface Props {
		value: string | number;
		label: string;
		trend?: {
			value: number;
			isPositive?: boolean;
		};
		size?: 'sm' | 'md' | 'lg';
	}

	let { value, label, trend, size = 'md' }: Props = $props();

	const sizeClasses = {
		sm: { value: 'text-lg font-semibold', label: 'text-xs' },
		md: { value: 'text-2xl font-bold', label: 'text-sm' },
		lg: { value: 'text-3xl font-bold', label: 'text-base' }
	};
</script>

<div class="text-center">
	<p class="{sizeClasses[size].value} text-gray-900">{value}</p>
	<p class="{sizeClasses[size].label} text-gray-500">{label}</p>
	{#if trend}
		<p
			class="text-xs mt-1 {trend.isPositive !== false ? 'text-green-600' : 'text-red-600'}"
		>
			{trend.value > 0 ? '+' : ''}{trend.value.toFixed(1)}%
		</p>
	{/if}
</div>
