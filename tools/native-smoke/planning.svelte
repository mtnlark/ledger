<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { db, getMonthKey } from '$lib/db';
	import { initializeStorage } from '$lib/storage';
	import { addTransaction, getAllTransactions } from '$lib/stores/transactions';
	import { addSavingsAccount } from '$lib/stores/savingsAccounts';
	import { addContribution, getAllContributions } from '$lib/stores/savingsContributions';
	import { saveBudget } from '$lib/stores/budget';
	import { getForecastPlanning } from '$lib/stores/forecast';
	import { calculateForecast } from '$lib/planning/forecast';
	import { getSettings, updateSettings } from '$lib/stores/settings';
	import { setSelectedMonth } from '$lib/stores/selectedMonth';
	import { parseBackup } from '$lib/storage/backup';
	import { appDataDir, join } from '@tauri-apps/api/path';
	import { exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
	import Dashboard from '../+page.svelte';
	import SideNav from '$lib/components/SideNav.svelte';
	let status = $state('Running simplified dashboard checks in native dev mode');
	let showDashboard = $state(false);
	const checks: string[] = [];
	function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
	async function until(check: () => boolean | Promise<boolean>, message: string) { for (let i = 0; i < 300; i++) { if (await check()) return; await new Promise(r => setTimeout(r, 25)); } throw new Error(message); }
	onMount(() => { void run(); });
	async function run() {
		const directory = await appDataDir(), resultPath = await join(directory, 'planning-result.json');
		try {
			await initializeStorage();
			const restarted = await exists(resultPath);
			const now = new Date(), month = getMonthKey(now);
			setSelectedMonth(month);
			if (!restarted) {
				await saveBudget(month, { income: 5000, savedAmount: 0 });
				const accountId = await addSavingsAccount({ name: 'Dev savings', accountType: 'savings', currentBalance: 0, sortOrder: 100 });
				await addContribution({ accountId, date: new Date(now.getFullYear(), now.getMonth(), 25), amount: 100, source: 'bank_transfer' });
				const categoryId = (await db.categories.toArray())[0].id!;
				const entry = { date: now, merchant: 'Rent', amount: 2000, categoryId, isShared: false, splitType: 'percentage' as const, splitValue: .5, isSettled: false, isEssential: true, isSubscription: false };
				for (let offset = -2; offset <= 0; offset++) await addTransaction({ ...entry, date: new Date(now.getFullYear(), now.getMonth() + offset, 1) });
				for (const offset of [-2, -1]) {
					await addTransaction({ ...entry, merchant: 'Power', amount: offset === -2 ? 100 : 140, date: new Date(now.getFullYear(), now.getMonth() + offset, 15) });
					await addTransaction({ ...entry, merchant: `Everyday ${offset}`, amount: 300, date: new Date(now.getFullYear(), now.getMonth() + offset, 28) });
				}
				await updateSettings({ fixedRecurringAmounts: [{ merchant: 'power', amount: 125 }], lastAutoSuggestedMonth: month });
			} else {
				assert(JSON.parse(await readTextFile(resultPath)).ok, 'Prior dev checks failed');
				assert(await db.transactions.count() === 7, 'Records did not survive native restart');
			}
			const transactions = await getAllTransactions(), contributions = await getAllContributions();
			const settingsBefore = JSON.stringify(await getSettings());
			const forecast = calculateForecast({ month, transactions, contributions, planning: await getForecastPlanning(month, transactions), income: 5000 });
			assert(forecast.recorded === 2000 && forecast.upcoming === 125 && forecast.savings === 100, 'Rent, bill estimate or future savings counted incorrectly');
			assert(forecast.variable === (now.getDate() < 28 ? 300 : 0), 'Everyday spending baseline includes rent or bills');
			assert(JSON.stringify(await getSettings()) === settingsBefore && await db.transactions.count() === 7, 'Forecast changed saved records');
			checks.push('early rent counted once; variable bill override; future savings reserved; estimate writes nothing');
			showDashboard = true; await tick();
			await until(() => document.querySelector('[aria-label="Projected spending"]')?.textContent?.includes(now.getDate() < 28 ? '2,425.00' : '2,125.00') ?? false, 'Dashboard forecast did not render');
			assert(!document.querySelector('a[href="/planning"]'), 'Planning navigation still present');
			const card = document.querySelector('[aria-label="Spending forecast"]')!;
			const details = card.querySelector('details')!;
			assert(!details.open, 'Forecast explanation is not collapsed');
			details.querySelector('summary')!.click(); await tick();
			assert(details.open && card.textContent?.includes('Expected remainder'), 'Forecast breakdown did not open');
			assert(card.textContent?.includes('Power') && !card.querySelector('a[href="/planning"]'), 'Bill assumptions missing or simulator link remains');
			assert(document.documentElement.scrollWidth <= window.innerWidth + 1, 'Dashboard overflows native viewport');
			checks.push('actual Dashboard and sidebar; collapsed forecast breakdown; no Planning navigation; viewport fits');
			const add = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Add'); assert(add, 'Dashboard Add action missing'); add.click(); await tick();
			assert(document.querySelector('form'), 'Familiar entry form did not open');
			assert(!document.body.textContent?.includes('Expected one-off') && !document.body.textContent?.includes('Saved template'), 'Extra entry controls remain');
			checks.push('familiar entry form without templates or one-off controls');
			await parseBackup(await readTextFile(await join(directory, 'data.json')));
			checks.push('strict native disk validation');
			await writeTextFile(resultPath, JSON.stringify({ ok: true, mode: 'tauri dev', restarted, checks }));
			status = restarted ? 'Native dev checks and restart passed' : 'Native dev dashboard checks passed';
		} catch (error) { status = error instanceof Error ? error.message + '\n' + (error.stack ?? '') : String(error); await writeTextFile(resultPath, JSON.stringify({ ok: false, mode: 'tauri dev', checks, error: status })); }
	}
</script>
<p>{status}</p>
{#if showDashboard}<SideNav /><div class="ml-16"><Dashboard /></div>{/if}
