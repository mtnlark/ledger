<script lang="ts">
	import { toast } from '$lib/stores/toast';
	import type { Category } from '$lib/db';
	import { getAllCategories } from '$lib/stores/categories';
	import { parseBackup, type BackupPreview } from '$lib/storage/backup';
	import { replaceAllData, saveStatus, PersistenceError } from '$lib/storage';
	import { previewSplitRepairs, applySplitRepairs, type SplitRepair } from '$lib/storage/split-repair';
	import { readExcelFile, parseExpensesSheetWithDiagnostics, previewSpreadsheet, importTransactions, type SheetPreview } from '$lib/utils/import';
	import { formatCurrency } from '$lib/utils/format-helpers';
	let backup = $state<BackupPreview | null>(null);
	let sheet = $state<SheetPreview | null>(null);
	let repairs = $state<SplitRepair[] | null>(null);
	let selected = $state<number[]>([]);
	let mapping = $state<Record<string, number>>({});
	let categories = $state<Category[]>([]);
	let busy = $state(false);
	let message = $state('');
	let blocked = $derived(busy || $saveStatus !== 'saved');
	async function run(action: () => Promise<void>) {
		busy = true; message = '';
		try { await action(); }
		catch (error) {
			message = error instanceof Error ? error.message : String(error);
			if (error instanceof PersistenceError && error.applied) { backup = null; sheet = null; repairs = null; }
		} finally { busy = false; }
	}
	async function choose(event: Event, kind: 'backup' | 'sheet') {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		await run(async () => {
			backup = null; sheet = null; repairs = null; mapping = {};
			categories = await getAllCategories();
			if (kind === 'backup') backup = await parseBackup(await file.text());
			else sheet = await previewSpreadsheet(parseExpensesSheetWithDiagnostics(await readExcelFile(file)));
		});
		input.value = '';
	}
</script>
<div class="space-y-4">
	<label class="block">Preview Excel import <input type="file" accept=".xlsx" disabled={blocked} onchange={(e) => choose(e, 'sheet')} /></label>
	<label class="block">Preview backup restore <input type="file" accept=".json" disabled={blocked} onchange={(e) => choose(e, 'backup')} /></label>
	<button class="px-4 py-2 rounded-lg border border-theme" disabled={blocked} onclick={() => run(async () => { categories = await getAllCategories(); repairs = await previewSplitRepairs(); selected = []; backup = null; sheet = null; })}>Review historical fixed shares</button>
	{#if message}<p role="status" class="text-sm">{message}</p>{/if}
	{#if backup}
		<div class="space-y-3 border border-theme rounded-lg p-4">
			<h3 class="font-medium">Restore preview</h3>
			<p>All current data will be replaced. A recovery backup must succeed first.</p>
			<ul>{#each Object.entries(backup.counts) as [name, count] (name)}<li>{name}: {count}</li>{/each}</ul>
			{#each backup.warnings as warning (warning)}<p>{warning}</p>{/each}
			<button class="px-4 py-2 rounded-lg border border-theme mr-2 disabled:opacity-50" disabled={blocked} onclick={() => run(async () => { if (backup) await replaceAllData(backup.data); backup = null; toast.success('Backup restored'); })}>Replace all data</button>
			<button class="px-4 py-2 rounded-lg border border-theme mr-2 disabled:opacity-50" disabled={busy} onclick={() => backup = null}>Cancel</button>
		</div>
	{/if}
	{#if sheet}
		<div class="space-y-3 border border-theme rounded-lg p-4">
			<h3 class="font-medium">Spreadsheet preview</h3>
			<p>{sheet.accepted.length} accepted · {sheet.duplicates.length} duplicates · {sheet.invalid.length} invalid · {sheet.blankRows.length} blank rows</p>
			{#each sheet.unknownCategories as name (name)}
				<label class="block">Map “{name}”
					<select class="ml-2 rounded border border-theme bg-surface px-3 py-2" bind:value={mapping[name]}><option value={undefined}>Choose a category</option>{#each categories as category (category.id)}<option value={category.id}>{category.name}</option>{/each}</select>
				</label>
			{/each}
			<div class="max-h-72 overflow-auto">
				<table class="w-full text-sm text-left"><thead><tr><th>Row</th><th>Merchant</th><th>Amount</th><th>Category → destination</th></tr></thead><tbody>
				{#each sheet.accepted as row (row.sourceRow)}<tr><td>{row.sourceRow}</td><td>{row.merchant}</td><td>{formatCurrency(row.amount)}</td><td>{row.category} → {categories.find((c) => c.id === mapping[row.category] || (!mapping[row.category] && c.name.toLowerCase() === row.category.toLowerCase()))?.name ?? 'Choose mapping'}</td></tr>{/each}
				</tbody></table>
				{#each [...sheet.invalid, ...sheet.duplicates] as row (row.row)}<p>Row {row.row}: {row.reason}</p>{/each}
				{#if sheet.blankRows.length}<p>Blank rows: {sheet.blankRows.join(', ')}</p>{/if}
			</div>
			<button class="px-4 py-2 rounded-lg border border-theme mr-2 disabled:opacity-50" disabled={blocked || !sheet.accepted.length || sheet.unknownCategories.some((name) => !mapping[name])} onclick={() => run(async () => { if (!sheet) return; const result = await importTransactions(sheet.accepted, { categoryMapping: mapping }); sheet = null; message = `Imported ${result.imported} transactions; ${result.skipped} additional duplicates skipped`; })}>Import approved rows</button>
			<button class="px-4 py-2 rounded-lg border border-theme mr-2 disabled:opacity-50" disabled={busy} onclick={() => sheet = null}>Cancel</button>
		</div>
	{/if}
	{#if repairs}
		<div class="space-y-3 border border-theme rounded-lg p-4">
			<h3 class="font-medium">Historical fixed-share review</h3>
			<p>Select purchases to correct. Settled, deleted, incomplete or ambiguous groups require manual review.</p>
			{#if !repairs.length}<p>No inconsistencies found.</p>{/if}
			{#each repairs as row (row.parent.id)}
				<div class="border-t border-theme py-2">
					<label><input type="checkbox" value={row.parent.id} bind:group={selected} disabled={!!row.reason || blocked} /> {new Date(row.parent.date).toLocaleDateString()} · {row.parent.merchant}: {formatCurrency(row.existingTotal)} → {formatCurrency(row.proposedTotal)}</label>
					{#each row.children as child, index (child.id)}<p class="text-sm">{categories.find((c) => c.id === child.categoryId)?.name ?? child.categoryId}: purchase {formatCurrency(child.amount)}, partner {formatCurrency(child.partnerShare)} → {row.reason ? 'manual review' : formatCurrency(row.allocations[index])}</p>{/each}
					{#if row.reason}<p>{row.reason}</p>{/if}
				</div>
			{/each}
			<button class="px-4 py-2 rounded-lg border border-theme mr-2 disabled:opacity-50" disabled={blocked || !selected.length} onclick={() => run(async () => { await applySplitRepairs(repairs!.filter((r) => selected.includes(r.parent.id!))); repairs = await previewSplitRepairs(); selected = []; message = 'Selected corrections saved'; })}>Back up and apply selected corrections</button>
			<button class="px-4 py-2 rounded-lg border border-theme mr-2 disabled:opacity-50" disabled={busy} onclick={() => repairs = null}>Close review</button>
		</div>
	{/if}
</div>
