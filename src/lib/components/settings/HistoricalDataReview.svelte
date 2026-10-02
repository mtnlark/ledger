<script lang="ts">
	import { applyHistoricalRepairs, prepareHistoricalRepair, previewHistoricalData, type HistoricalPreview, type HistoricalRepairPlan, type RepairChoice } from '$lib/storage/historical-repair';
	import { PersistenceError, saveStatus } from '$lib/storage';
	import { formatCurrency } from '$lib/utils/format-helpers';
	import type { SavingsAccountType } from '$lib/db';
	let preview = $state.raw<HistoricalPreview | null>(null);
	let plan = $state.raw<HistoricalRepairPlan | null>(null);
	let busy = $state(false);
	let message = $state('');
	let categoryNames = $state<Record<number, string>>({});
	let categoryApproved = $state<Record<number, boolean>>({});
	let accountActions = $state<Record<number, string>>({});
	let accountNames = $state<Record<number, string>>({});
	let accountTypes = $state<Record<number, SavingsAccountType>>({});
	let accountBalances = $state<Record<number, string>>({});
	let fields = $state<Record<string, string>>({});
	let balances = $state<Record<number, string>>({});
	let approvedBalances = $state<Record<number, boolean>>({});
	let approvedPurchases = $state<Record<number, boolean>>({});
	let purchaseShares = $state<Record<number, string>>({});
	let blocked = $derived(busy || $saveStatus !== 'saved');
	async function run(action: () => Promise<void> | void) {
		busy = true; message = '';
		try { await action(); }
		catch (error) {
			message = error instanceof Error ? error.message : String(error);
			if (error instanceof PersistenceError && error.applied) { preview = null; plan = null; }
		} finally { busy = false; }
	}
	function resetReview(value: HistoricalPreview) {
		preview = value; plan = null; categoryNames = {}; categoryApproved = {}; accountActions = {}; accountNames = {}; accountTypes = {}; accountBalances = {}; fields = {}; balances = {}; approvedBalances = {}; approvedPurchases = {}; purchaseShares = {};
	}
	async function chooseFile(event: Event) {
		const input = event.target as HTMLInputElement, file = input.files?.[0];
		if (!file) return;
		await run(async () => { resetReview(await previewHistoricalData({ name: file.name, text: await file.text() })); });
		input.value = '';
	}
	function collectChoices(): RepairChoice[] {
		if (!preview) return [];
		const choices: RepairChoice[] = [];
		for (const problem of preview.diagnostics) {
			const id = Number(problem.value);
			if (problem.kind === 'missing_category' && categoryApproved[id]) choices.push({ kind: 'category', id, name: categoryNames[id] ?? '' });
			if (problem.kind === 'missing_savings_account') {
				if (accountActions[id] === 'delete_contributions') choices.push({ kind: 'account', id, action: 'delete_contributions' });
				if (accountActions[id] === 'recreate') choices.push({ kind: 'account', id, action: 'recreate', name: accountNames[id] ?? '', accountType: accountTypes[id], confirmedBalance: Number(String(accountBalances[id] ?? '').trim() || NaN) });
			}
			if (problem.kind === 'date' || problem.kind === 'reference') choices.push({ kind: 'field', diagnosticId: problem.id, value: problem.kind === 'date' ? fields[problem.id] ?? '' : Number(String(fields[problem.id] ?? '').trim() || NaN) });
		}
		for (const account of preview.accounts) if (approvedBalances[account.id]) choices.push({ kind: 'balance', id: account.id, confirmedBalance: Number(String(balances[account.id] ?? '').trim() || NaN) });
		for (const purchase of preview.purchases) if (approvedPurchases[purchase.parent.id!]) choices.push({ kind: 'purchase', parentId: purchase.parent.id!, confirmedPartnerShare: Number(String(purchaseShares[purchase.parent.id!] ?? '').trim() || NaN) });
		return choices;
	}
</script>
<div class="space-y-4 border-t border-theme pt-4">
	<button class="px-4 py-2 rounded-lg border border-theme" disabled={blocked} onclick={() => run(async () => resetReview(await previewHistoricalData()))}>Review ledger integrity</button>
	<label class="block">Review damaged JSON file <input type="file" accept=".json" disabled={blocked} onchange={chooseFile} /></label>
	{#if message}<p role="status">{message}</p>{/if}
	{#if preview && !plan}
		<div class="space-y-4 border border-theme rounded-lg p-4">
			<h3 class="font-medium">Data integrity review: {preview.source}</h3>
			<p class="text-sm">Review changes before applying them. The original is preserved separately from routine backups. Selected files replace the current ledger after correction.</p>
			{#if !preview.diagnostics.length}<p>No date or reference defects found.</p>{/if}
			{#each preview.diagnostics as problem (problem.id)}
				<div class="space-y-2 border-t border-theme pt-3">
					<p>{problem.table} · record {problem.recordId} · {problem.field}: {problem.message}</p>
					{#each problem.references ?? [] as reference (`${reference.table}:${reference.recordId}:${reference.field}`)}
						<p class="text-sm">{reference.table} record {reference.recordId} · {reference.field} · {JSON.stringify(reference.context)}</p>
					{/each}
					{#if problem.kind === 'missing_category'}
						<label class="block">Placeholder name for category {problem.value}<input class="ml-2 border border-theme rounded bg-surface p-2" bind:value={categoryNames[Number(problem.value)]} /></label>
						<label class="block"><input type="checkbox" bind:checked={categoryApproved[Number(problem.value)]} /> Approve inactive placeholder at the original category ID</label>
					{:else if problem.kind === 'missing_savings_account'}
						<label class="block">Account {problem.value} repair<select class="ml-2 border border-theme rounded bg-surface p-2" bind:value={accountActions[Number(problem.value)]}><option value="">Choose a repair</option><option value="recreate">Recreate account</option><option value="delete_contributions">Delete listed orphaned contributions</option></select></label>
						{#if accountActions[Number(problem.value)] === 'recreate'}
							<label class="block">Recovered account name<input class="ml-2 border border-theme rounded bg-surface p-2" bind:value={accountNames[Number(problem.value)]} /></label>
							<label class="block">Recovered account type<select class="ml-2 border border-theme rounded bg-surface p-2" bind:value={accountTypes[Number(problem.value)]}><option value={undefined}>Choose type</option><option value="savings">Savings</option><option value="retirement">Retirement</option><option value="investment">Investment</option></select></label>
							<label class="block">Confirmed account balance<input type="number" step="0.01" class="ml-2 border border-theme rounded bg-surface p-2" bind:value={accountBalances[Number(problem.value)]} /></label>
						{/if}
					{:else}
						<p class="text-sm">Current value: {JSON.stringify(problem.value) ?? 'missing'}</p>
						<label class="block">Correction for {problem.table} {problem.recordId} {problem.field}<input type={problem.kind === 'date' ? 'date' : 'number'} class="ml-2 border border-theme rounded bg-surface p-2" bind:value={fields[problem.id]} /></label>
					{/if}
				</div>
			{/each}
			{#if preview.accounts.length}
				<p class="text-sm">Balances and contributions are review context. Contribution totals cannot establish opening balances. Supply a confirmed replacement only when a balance needs correction.</p>
				{#each preview.accounts as account (account.id)}
					<details class="border-t border-theme pt-3"><summary>{account.name} · balance {account.balance === undefined ? 'not recorded' : formatCurrency(account.balance)} · contributions {formatCurrency(account.contributionTotal)}</summary>
						{#each account.contributions ?? [] as contribution (contribution.id)}<p class="text-sm">Contribution {contribution.id} · {String(contribution.date)} · {formatCurrency(contribution.amount)} · {contribution.source}</p>{/each}
						<label class="block">Confirmed replacement balance for {account.name}<input type="number" step="0.01" class="ml-2 border border-theme rounded bg-surface p-2" bind:value={balances[account.id]} /></label>
						<label class="block"><input type="checkbox" bind:checked={approvedBalances[account.id]} /> Approve replacement balance for {account.name}</label>
					</details>
				{/each}
			{/if}
			{#each preview.purchases as purchase (purchase.parent.id)}
				<div class="space-y-2 border-t border-theme pt-3"><p>{purchase.parent.merchant} · purchase {formatCurrency(purchase.parent.amount)} · partner shares {formatCurrency(purchase.existingTotal)} → {formatCurrency(purchase.proposedTotal)}</p>
					{#each purchase.children as child (child.id)}<p class="text-sm">Transaction {child.id} · category {child.categoryId} · amount {formatCurrency(child.amount)} · partner share {formatCurrency(child.partnerShare)}</p>{/each}
					{#if purchase.reason}<p>{purchase.reason}. Review and edit this purchase in the ledger.</p>{:else}
						<label class="block">Confirmed partner share for purchase {purchase.parent.id}<input type="number" step="0.01" class="ml-2 border border-theme rounded bg-surface p-2" bind:value={purchaseShares[purchase.parent.id!]} /></label>
						<label class="block"><input type="checkbox" bind:checked={approvedPurchases[purchase.parent.id!]} /> Approve purchase {purchase.parent.id} share allocation</label>
					{/if}
				</div>
			{/each}
			<button class="px-4 py-2 rounded-lg border border-theme" disabled={blocked} onclick={() => run(() => { plan = prepareHistoricalRepair(preview!, collectChoices()); })}>Preview supplied corrections</button>
			<button class="px-4 py-2 rounded-lg border border-theme" disabled={busy} onclick={() => preview = null}>Cancel review</button>
		</div>
	{/if}
	{#if plan}
		<div class="space-y-3 border border-theme rounded-lg p-4">
			<h3 class="font-medium">Correction preview: {plan.source}</h3>
			<p>The repaired snapshot passed strict validation. Applying preserves the original and saves these changes once.</p>
			{#each plan.changes as change, index (index)}<p class="text-sm">{change.table} · record {change.recordId} · {change.field}: {JSON.stringify(change.before) ?? 'missing'} → {JSON.stringify(change.after)}</p>{/each}
			<button class="px-4 py-2 rounded-lg border border-theme" disabled={blocked} onclick={() => run(async () => { await applyHistoricalRepairs(plan!); preview = null; plan = null; message = 'Reviewed corrections saved'; })}>Preserve original and apply approved corrections</button>
			<button class="px-4 py-2 rounded-lg border border-theme" disabled={busy} onclick={() => plan = null}>Back to review</button>
		</div>
	{/if}
</div>
