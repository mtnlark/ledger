<script lang="ts">
	import { slide } from 'svelte/transition';

	interface Props {
		isSubscription: boolean;
		subscriptionFrequency: 'monthly' | 'semi-annual' | 'annual';
		merchant?: string;
		amount?: number;
		onCancelSubscription?: (merchant: string, amount?: number) => void;
		onClose?: () => void;
		showTransition?: boolean;
	}

	let {
		isSubscription = $bindable(),
		subscriptionFrequency = $bindable(),
		merchant = '',
		amount,
		onCancelSubscription,
		onClose,
		showTransition = false
	}: Props = $props();

	// Cancel confirmation state
	let showCancelConfirm = $state(false);

	function handleCancel() {
		if (merchant && onCancelSubscription) {
			onCancelSubscription(merchant, amount);
			onClose?.();
		}
	}
</script>

<!-- Subscription Toggle -->
<div class="border-t border-dashed border-theme-dashed pt-4">
	<label class="flex items-center justify-between cursor-pointer">
		<div>
			<span class="text-sm font-medium text-charcoal-soft">Subscription</span>
			<p class="text-xs text-charcoal-muted mt-0.5">Recurring payment (e.g., streaming, news)</p>
		</div>
		<button
			type="button"
			onclick={() => (isSubscription = !isSubscription)}
			class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-2 {isSubscription ? 'bg-primary-500' : 'bg-[var(--color-border-dashed)]'}"
			role="switch"
			aria-checked={isSubscription}
			aria-label="Toggle subscription"
		>
			<span
				class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {isSubscription ? 'translate-x-5' : 'translate-x-0'}"
			></span>
		</button>
	</label>

	<!-- Frequency selector (shown when subscription is enabled) -->
	{#if isSubscription}
		<div
			class="mt-3 flex gap-2"
			transition:slide={showTransition ? { duration: 150 } : { duration: 0 }}
		>
			<button
				type="button"
				onclick={() => (subscriptionFrequency = 'monthly')}
				class="px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-150 {subscriptionFrequency === 'monthly'
					? 'bg-primary-500 text-white shadow-sm'
					: 'bg-surface-alt text-charcoal-soft border border-theme hover:bg-surface-hover'}"
			>
				Monthly
			</button>
			<button
				type="button"
				onclick={() => (subscriptionFrequency = 'semi-annual')}
				class="px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-150 {subscriptionFrequency === 'semi-annual'
					? 'bg-primary-500 text-white shadow-sm'
					: 'bg-surface-alt text-charcoal-soft border border-theme hover:bg-surface-hover'}"
			>
				Semi-Annual
			</button>
			<button
				type="button"
				onclick={() => (subscriptionFrequency = 'annual')}
				class="px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-150 {subscriptionFrequency === 'annual'
					? 'bg-primary-500 text-white shadow-sm'
					: 'bg-surface-alt text-charcoal-soft border border-theme hover:bg-surface-hover'}"
			>
				Annual
			</button>
		</div>

		<!-- Cancel Subscription Option -->
		{#if onCancelSubscription && merchant}
			<div class="mt-3 pt-3 border-t border-dashed border-theme-dashed">
				{#if !showCancelConfirm}
					<button
						type="button"
						onclick={() => (showCancelConfirm = true)}
						class="text-sm text-danger-500 hover:text-danger-600 hover:underline transition-colors"
					>
						Cancel this subscription...
					</button>
				{:else}
					<div class="bg-danger-50 border border-danger-100 rounded-lg p-3">
						<p class="text-sm text-charcoal mb-3">
							Mark <span class="font-medium">{merchant}</span> as cancelled? It won't count toward your recurring total.
						</p>
						<div class="flex gap-2">
							<button
								type="button"
								onclick={handleCancel}
								class="px-3 py-1.5 text-sm font-medium bg-danger-500 text-white rounded-lg hover:bg-danger-600 transition-colors"
							>
								Yes, Cancel
							</button>
							<button
								type="button"
								onclick={() => (showCancelConfirm = false)}
								class="px-3 py-1.5 text-sm font-medium text-charcoal-soft border border-theme rounded-lg hover:bg-surface-hover transition-colors"
							>
								Never mind
							</button>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>
