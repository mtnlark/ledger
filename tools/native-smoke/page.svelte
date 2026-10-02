<script lang="ts">
	import { onMount } from 'svelte';
	import { db } from '$lib/db';
	import { initializeStorage, getAllData, replaceAllData } from '$lib/storage';
	import { addTransaction, updateTransaction } from '$lib/stores/transactions';
	import { addSavingsAccount } from '$lib/stores/savingsAccounts';
	import { addContribution, updateContribution } from '$lib/stores/savingsContributions';
	import { previewHistoricalData, prepareHistoricalRepair, applyHistoricalRepairs } from '$lib/storage/historical-repair';
	import { checksum, checksumText, parseBackup } from '$lib/storage/backup';
	import { appDataDir, join } from '@tauri-apps/api/path';
	import { exists, readTextFile, writeTextFile, readDir } from '@tauri-apps/plugin-fs';
	let status = $state('Running native smoke checks');
	function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
	onMount(() => { void run(); });
	async function run() {
		const directory = await appDataDir(), resultPath = await join(directory, 'smoke-result.json');
		try {
			const initialized = await initializeStorage();
			const previous = await exists(resultPath) ? JSON.parse(await readTextFile(resultPath)) : { stage: 0 };
			assert(previous.ok !== false, 'A prior smoke phase failed');
			const stage = previous.stage + 1;
			if (stage === 1) {
				const transactionId = await addTransaction({ date: new Date(2026, 8, 10), merchant: 'Native saved purchase', amount: 100, categoryId: 1, isShared: false, splitType: 'percentage', splitValue: 0.5, isSettled: false, isEssential: false, isSubscription: false });
				let rejected = false;
				try { await updateTransaction(transactionId, { date: new Date(NaN) }); } catch { rejected = true; }
				assert(rejected, 'Invalid date was accepted');
				const a = await addSavingsAccount({ name: 'Native fund A', accountType: 'savings', currentBalance: 100, sortOrder: 100 });
				const b = await addSavingsAccount({ name: 'Native fund B', accountType: 'savings', currentBalance: 200, sortOrder: 101 });
				const contributionId = await addContribution({ accountId: a, amount: 10.11, date: new Date(2026, 8, 10), source: 'other' });
				await updateContribution(contributionId, { accountId: b, amount: 20.22 });
				assert((await db.savingsAccounts.get(a))?.currentBalance === 100 && (await db.savingsAccounts.get(b))?.currentBalance === 220.22, 'Native contribution transfer balances are wrong');
				await parseBackup(await readTextFile(await join(directory, 'data.json')));
				await writeTextFile(resultPath, JSON.stringify({ ok: true, stage, transactionId, a, b, contributionId, checks: ['native durable save', 'invalid date rejection', 'contribution transfer', 'strict disk readback'] }));
			} else if (stage === 2) {
				assert(initialized.status === 'loaded', 'Relaunch did not load the saved primary');
				assert((await db.transactions.get(previous.transactionId))?.merchant === 'Native saved purchase', 'Saved transaction did not survive relaunch');
				assert((await db.savingsAccounts.get(previous.b))?.currentBalance === 220.22, 'Saved balance did not survive relaunch');
				const damaged = await getAllData();
				damaged.transactions[0].date = null as unknown as Date; damaged.transactions[0].categoryId = 999;
				const content = JSON.stringify({ ...damaged, checksum: await checksum(damaged) });
				const damagedPath = await join(directory, 'selected-damaged.json'); await writeTextFile(damagedPath, content);
				const preview = await previewHistoricalData({ name: 'selected-damaged.json', text: await readTextFile(damagedPath) });
				const plan = prepareHistoricalRepair(preview, [{ kind: 'category', id: 999, name: 'Reviewed historical category' }, { kind: 'field', diagnosticId: `transactions:${damaged.transactions[0].id}:date`, value: '2026-09-10' }]);
				await applyHistoricalRepairs(plan);
				await parseBackup(await readTextFile(await join(directory, 'data.json')));
				const originalsDir = await join(directory, 'originals'), originals = await readDir(originalsDir);
				assert(originals.length === 2, 'Repair did not preserve both originals');
				for (const original of originals) {
					const envelope = JSON.parse(await readTextFile(await join(originalsDir, original.name!)));
					assert(envelope.checksum === await checksumText(envelope.content), 'Original readback checksum is wrong');
				}
				await writeTextFile(resultPath, JSON.stringify({ ...previous, stage, checks: [...previous.checks, 'native relaunch', 'reviewed damaged-file import', 'original snapshot readback'] }));
			} else if (stage === 3) {
				assert(initialized.status === 'loaded', 'Repaired primary did not relaunch normally');
				assert((await db.categories.get(999))?.isActive === false, 'Repaired reference did not survive relaunch');
				assert((await db.transactions.get(previous.transactionId))?.date.getTime() === new Date(2026, 8, 10).getTime(), 'Repaired date did not survive relaunch');
				const snapshot = (await parseBackup(await readTextFile(await join(directory, 'data.json')))).data;
				await replaceAllData(snapshot);
				await parseBackup(await readTextFile(await join(directory, 'data.json')));
				await writeTextFile(resultPath, JSON.stringify({ ...previous, stage, complete: true, checks: [...previous.checks, 'repaired-file restart', 'strict backup restore'] }));
			}
			status = `Native smoke phase ${stage} passed`;
		} catch (error) {
			status = error instanceof Error ? error.stack ?? error.message : String(error);
			await writeTextFile(resultPath, JSON.stringify({ ok: false, error: status }));
		}
	}
</script>
<p>{status}</p>
