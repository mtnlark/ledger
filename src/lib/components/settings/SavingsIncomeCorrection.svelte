<script lang="ts">
	import { toast } from '$lib/stores/toast';
	import { getAllSavingsAccounts } from '$lib/stores/savingsAccounts';
	import { applyHistoricalRepairs, previewSavingsIncomeCorrection, type SavingsIncomeCorrectionPreview } from '$lib/storage/historical-repair';
	import { PersistenceError, saveStatus } from '$lib/storage';
	import { formatDateForInput, parseLocalDate } from '$lib/utils/date-helpers';
	import { formatCurrency } from '$lib/utils/format-helpers';
	import type { SavingsAccount } from '$lib/db';
	let open = $state(false);
	let accounts = $state<SavingsAccount[]>([]);
	let accountId = $state<number | ''>('');
	let date = $state(formatDateForInput(new Date()));
	let amount = $state('');
	let balanceAlreadyAdjusted = $state(false);
	let notes = $state('');
	let preview = $state.raw<SavingsIncomeCorrectionPreview | null>(null);
	let busy = $state(false);
	let message = $state('');
	let blocked = $derived(busy || $saveStatus !== 'saved');
	async function run(action: () => Promise<void>) {
		busy = true; message = '';
		try { await action(); }
		catch (error) {
			message = error instanceof Error ? error.message : String(error);
			if (error instanceof PersistenceError && error.applied) { preview = null; open = false; }
		} finally { busy = false; }
	}
</script>
<div class="space-y-4 border-t border-theme pt-4">
	<button class="px-4 py-2 rounded-lg border border-theme" disabled={blocked} onclick={() => run(async () => { accounts = (await getAllSavingsAccounts()).filter(a => a.accountType === 'savings'); open = true; preview = null; balanceAlreadyAdjusted = false; })}>Correct savings counted as income</button>
	{#if message}<p role="status">{message}</p>{/if}
	{#if open && !preview}
		<form class="space-y-4 border border-theme rounded-lg p-4" onsubmit={(event) => { event.preventDefault(); run(async () => { preview = await previewSavingsIncomeCorrection({ accountId: Number(accountId), date: parseLocalDate(date), amount: Number(amount), balanceAlreadyAdjusted, notes }); }); }}>
			<p class="text-sm">Use this when a past savings transfer was included in monthly income and its withdrawal is missing. Review the changes before applying.</p>
			<label class="block">Fund<select required bind:value={accountId} class="ml-2 p-2 bg-surface-alt border border-theme rounded"><option value="">Choose a savings fund</option>{#each accounts as account (account.id)}<option value={account.id}>{account.name}</option>{/each}</select></label>
			<label class="block">Actual date<input required type="date" max={formatDateForInput(new Date())} bind:value={date} class="ml-2 p-2 bg-surface-alt border border-theme rounded" /></label>
			<label class="block">Amount<input required type="number" min="0.01" step="0.01" bind:value={amount} class="ml-2 p-2 bg-surface-alt border border-theme rounded" /></label>
			<label class="block"><input type="checkbox" bind:checked={balanceAlreadyAdjusted} /> Fund balance already reflects this withdrawal</label>
			<label class="block">Note (optional)<input bind:value={notes} class="ml-2 p-2 bg-surface-alt border border-theme rounded" /></label>
			<div class="flex gap-3"><button type="button" disabled={busy} onclick={() => open = false} class="px-4 py-2 border border-theme rounded-lg">Cancel</button><button disabled={blocked} class="px-4 py-2 border border-theme rounded-lg">Preview income correction</button></div>
		</form>
	{/if}
	{#if preview}
		<div class="space-y-3 border border-theme rounded-lg p-4">
			<h3 class="font-medium">Savings income correction preview</h3>
			<p>{preview.month} income: {formatCurrency(preview.incomeBefore)} → {formatCurrency(preview.incomeAfter)}</p>
			<p>{preview.fundName}: add {formatCurrency(preview.amount)} used on {preview.date}</p>
			<p>Fund balance: {formatCurrency(preview.balanceBefore)} → {formatCurrency(preview.balanceAfter)}</p>
			<p>Note: {preview.notes}</p>
			<p>No category top-up. Existing category allowances, contributions, purchases, and bank records are preserved.</p>
			<p>Available money, surplus, spending totals, and expected spending stay the same. Income decreases and From savings increases by {formatCurrency(preview.amount)}.</p>
			<p>The corrected snapshot passed strict validation. Applying rechecks the ledger and preserves a verified original outside routine backup pruning.</p>
			<div class="flex gap-3"><button disabled={busy} class="px-4 py-2 border border-theme rounded-lg" onclick={() => preview = null}>Back to correction</button><button disabled={blocked} class="px-4 py-2 bg-primary-500 text-white rounded-lg" onclick={() => run(async () => { const plan = preview!.plan; await applyHistoricalRepairs(plan); toast.success('Income corrected; savings withdrawal recorded'); preview = null; open = false; message = 'Reviewed income correction saved'; })}>Preserve original and apply income correction</button></div>
		</div>
	{/if}
</div>
