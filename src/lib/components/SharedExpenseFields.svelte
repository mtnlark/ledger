<script lang="ts">
	import { formatCurrency, formatPercentage } from '$lib/utils/format-helpers';
	import { roundCurrency } from '$lib/utils/currency';

	interface Props {
		isShared: boolean;
		splitType: 'percentage' | 'fixed';
		splitValue: number;
		amount: number;
		partnerName: string;
		isSettled?: boolean;
		showSettledOption?: boolean;
		idPrefix?: string;
	}

	let {
		isShared = $bindable(),
		splitType = $bindable(),
		splitValue = $bindable(),
		amount,
		partnerName,
		isSettled = $bindable(false),
		showSettledOption = false,
		idPrefix = ''
	}: Props = $props();

	// Computed split values - use roundCurrency for consistent precision
	let partnerShare = $derived.by(() => {
		if (splitType === 'percentage') {
			return roundCurrency(amount * splitValue);
		}
		return roundCurrency(Math.min(Math.max(splitValue, 0), amount));
	});

	let yourShare = $derived(roundCurrency(amount - partnerShare));

	// Validation for fixed split
	let splitValueInvalid = $derived(
		splitType === 'fixed' && (splitValue < 0 || splitValue > amount)
	);

	let validatedSplitValue = $derived(
		Math.min(Math.max(splitValue, 0), amount)
	);

	function handleFixedBlur() {
		if (splitValue > amount) splitValue = amount;
		if (splitValue < 0) splitValue = 0;
	}
</script>

<!-- Shared Toggle -->
<div class="border-t border-dashed border-theme-dashed pt-4">
	<label class="flex items-center gap-3 cursor-pointer">
		<input
			type="checkbox"
			bind:checked={isShared}
			class="w-5 h-5 text-success-500 border-theme rounded focus:ring-success-500/20"
		/>
		<span class="text-sm font-medium text-charcoal-soft">
			Shared with {partnerName}
		</span>
	</label>

	<!-- Split Options (shown when shared) -->
	{#if isShared}
		<div class="mt-4 ml-8 p-4 bg-success-50 border border-success-100 rounded-lg space-y-3">
			<!-- Split Type Toggle -->
			<div class="flex gap-2">
				<button
					type="button"
					onclick={() => (splitType = 'percentage')}
					class="px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-150 {splitType === 'percentage'
						? 'bg-success-500 text-white shadow-sm'
						: 'bg-surface text-charcoal-soft border border-theme hover:bg-surface-hover'}"
				>
					% Percentage
				</button>
				<button
					type="button"
					onclick={() => (splitType = 'fixed')}
					class="px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-150 {splitType === 'fixed'
						? 'bg-success-500 text-white shadow-sm'
						: 'bg-surface text-charcoal-soft border border-theme hover:bg-surface-hover'}"
				>
					$ Fixed Amount
				</button>
			</div>

			<!-- Split Value Input -->
			{#if splitType === 'percentage'}
				<div>
					<label for="{idPrefix}splitPercent" class="block text-sm text-charcoal-soft mb-1">
						{partnerName}'s share: <span class="font-mono font-medium">{formatPercentage(splitValue)}</span>
					</label>
					<input
						type="range"
						id="{idPrefix}splitPercent"
						min="0"
						max="1"
						step="0.05"
						bind:value={splitValue}
						aria-label="{partnerName}'s share percentage"
						class="w-full accent-success-500"
					/>
				</div>
			{:else}
				<div>
					<label for="{idPrefix}splitFixed" class="block text-sm text-charcoal-soft mb-1">
						{partnerName}'s exact share
						{#if amount > 0}
							<span class="text-charcoal-muted">(max {formatCurrency(amount)})</span>
						{/if}
					</label>
					<div class="relative">
						<span class="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-muted font-mono">$</span>
						<input
							type="number"
							id="{idPrefix}splitFixed"
							bind:value={splitValue}
							onblur={handleFixedBlur}
							step="0.01"
							min="0"
							max={amount}
							class="w-full pl-7 pr-3 py-2 bg-surface border rounded-lg focus:ring-2 transition-colors font-mono {splitValueInvalid
								? 'border-warning-500 focus:ring-warning-500/20 focus:border-warning-500'
								: 'border-theme focus:ring-success-500/20 focus:border-success-500'}"
						/>
					</div>
					{#if splitValueInvalid}
						<p class="text-xs text-warning-600 mt-1">Value will be clamped to {formatCurrency(validatedSplitValue)}</p>
					{/if}
				</div>
			{/if}

			<!-- Split Summary -->
			{#if amount > 0}
				<div class="text-sm pt-2 border-t border-success-200">
					<div class="flex justify-between text-charcoal-soft">
						<span>{partnerName} pays:</span>
						<span class="font-mono font-medium text-charcoal">{formatCurrency(partnerShare)}</span>
					</div>
					<div class="flex justify-between text-charcoal-soft">
						<span>You pay:</span>
						<span class="font-mono font-medium text-charcoal">{formatCurrency(yourShare)}</span>
					</div>
				</div>
			{/if}

			<!-- Already Settled Option -->
			{#if showSettledOption}
				<label class="flex items-center gap-2 pt-2 cursor-pointer">
					<input
						type="checkbox"
						bind:checked={isSettled}
						class="w-4 h-4 text-success-500 border-theme rounded focus:ring-success-500/20"
					/>
					<span class="text-sm text-charcoal-soft">Already settled</span>
				</label>
			{/if}
		</div>
	{/if}
</div>
