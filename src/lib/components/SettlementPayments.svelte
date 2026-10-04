<script lang="ts">
	import type { Transaction } from '$lib/db';
	import type { SettlementPayment } from '$lib/planning/types';
	import { recordSettlement } from '$lib/stores/planning';
	import { formatDateForInput } from '$lib/utils/date-helpers';
	import { sumCurrency } from '$lib/utils/currency';
	import { formatCurrency } from '$lib/utils/format-helpers';
	let { transactions, payments, onSaved }: { transactions: Transaction[]; payments: SettlementPayment[]; onSaved: () => Promise<void> } = $props();
	let date = $state(formatDateForInput(new Date()));
	let notes = $state('');
	let direction = $state<'received' | 'sent'>('received');
	let amounts = $state<Record<number, number>>({});
	let busy = $state(false);
	let error = $state('');
	let confirming = $state(false);
	let total = $derived(sumCurrency(Object.values(amounts).filter(v => Number.isFinite(v))));
	let candidates = $derived(direction === 'received' ? transactions.filter(t => !t.refundOfTransactionId).map(t => ({ ...t, partnerShare: sumCurrency([t.partnerShare, ...transactions.filter(r => r.refundOfTransactionId === t.id).map(r => r.partnerShare + (r.settledAmount ?? 0))]) })).filter(t => t.partnerShare > (t.settledAmount ?? 0)) : transactions.filter(t => t.refundOfTransactionId && t.partnerShare < 0).map(t => {
		const original = transactions.find(o => o.id === t.refundOfTransactionId);
		const credit = -sumCurrency([original ? original.partnerShare - (original.settledAmount ?? 0) : 0, ...transactions.filter(r => r.refundOfTransactionId === t.refundOfTransactionId).map(r => r.partnerShare + (r.settledAmount ?? 0))]);
		return { ...t, partnerShare: Math.min(-t.partnerShare, credit + (t.settledAmount ?? 0)) };
	}).filter(t => t.partnerShare > (t.settledAmount ?? 0)));
	async function save() {
		if (busy) return; busy = true; error = '';
		try {
			await recordSettlement({ date, direction, amount: total, notes: notes.trim() || undefined, allocations: Object.entries(amounts).filter(([, amount]) => amount > 0).map(([transactionId, amount]) => ({ transactionId: Number(transactionId), amount })) });
			amounts = {}; confirming = false; await onSaved();
		} catch (e) { error = e instanceof Error ? e.message : String(e); } finally { busy = false; }
	}
</script>

<section class="bg-surface rounded-xl shadow-sm shadow-theme p-5 space-y-4">
	<h2 class="font-display text-xl">Settlement payments</h2>
	<p class="text-sm text-charcoal-muted">Record a reimbursement with its date and allocations. Partial payments leave the unpaid share outstanding and do not change spending.</p>
	<label class="block text-sm">Payment direction<select bind:value={direction} onchange={() => { amounts = {}; confirming = false; }} class="block w-full p-2 border border-theme rounded-lg bg-surface-alt"><option value="received">Received from partner</option><option value="sent">Sent to partner for refund credits</option></select></label>
	{#if candidates.length}
		<form onsubmit={(e) => { e.preventDefault(); confirming = true; }} class="space-y-3">
			<div class="grid grid-cols-2 gap-3"><label class="text-sm">Payment date<input required type="date" max={formatDateForInput(new Date())} bind:value={date} oninput={() => confirming = false} class="block w-full p-2 border border-theme bg-surface-alt rounded-lg" /></label><label class="text-sm">Notes<input bind:value={notes} oninput={() => confirming = false} class="block w-full p-2 border border-theme bg-surface-alt rounded-lg" /></label></div>
			<div class="space-y-2 max-h-72 overflow-y-auto">{#each candidates as t (t.id)}<label class="grid grid-cols-[1fr_120px] gap-3 items-center text-sm"><span>{t.merchant} · {formatDateForInput(t.date)}<span class="block text-xs text-charcoal-muted">{formatCurrency(t.partnerShare - (t.settledAmount ?? 0))} unpaid</span></span><input aria-label={`Payment toward ${t.merchant} ${t.id}`} type="number" min="0" max={t.partnerShare - (t.settledAmount ?? 0)} step="0.01" value={amounts[t.id!] ?? 0} oninput={(e) => { amounts = { ...amounts, [t.id!]: Number(e.currentTarget.value) }; confirming = false; }} class="p-2 border border-theme bg-surface-alt rounded-lg font-mono" /></label>{/each}</div>
			<p class="text-sm">Payment total: <strong class="font-mono">{formatCurrency(total)}</strong></p>
			{#if !confirming}<button disabled={total <= 0} class="btn-primary">Review payment</button>{:else}<p class="text-sm">Confirm {formatCurrency(total)} {direction} on {date}, allocated to {Object.values(amounts).filter(a => a > 0).length} expenses.</p><button type="button" disabled={busy} onclick={save} class="btn-primary">Confirm settlement payment</button>{/if}
		</form>
	{/if}
	{#if error}<p role="alert" class="text-danger-600 text-sm">{error}</p>{/if}
	<details class="text-sm"><summary class="cursor-pointer text-charcoal-muted">Payment history ({payments.length})</summary>{#each [...payments].reverse() as payment (payment.id)}<div class="py-3 border-b border-theme"><p>{payment.date} · {payment.direction ?? "received"} · <span class="font-mono">{formatCurrency(payment.amount)}</span> · {payment.allocations.length} allocations</p>{#if payment.notes}<p class="text-xs text-charcoal-muted">{payment.notes}</p>{/if}<p class="text-xs text-charcoal-muted">{payment.allocations.map(a => `Expense #${a.transactionId}: ${formatCurrency(a.amount)}`).join('; ')}</p></div>{/each}</details>
</section>
