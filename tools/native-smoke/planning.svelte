<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { db, getMonthKey, navigateMonth } from '$lib/db';
	import { initializeStorage } from '$lib/storage';
	import { addTransaction, addSplitTransaction, addRefund, calculateOutstandingBalance, getAllTransactions } from '$lib/stores/transactions';
	import { addSavingsAccount } from '$lib/stores/savingsAccounts';
	import { addContribution } from '$lib/stores/savingsContributions';
	import { saveBudget } from '$lib/stores/budget';
	import { getPlanning, saveSchedule, saveSavingsPlan, recordSettlement, confirmCompleteThrough, linkSavingsAllocation, templateFromTransactions, saveTemplate } from '$lib/stores/planning';
	import { addLinkedAccount } from '$lib/stores/linkedAccounts';
	import { calculateForecast } from '$lib/planning/forecast';
	import { formatDateForInput } from '$lib/utils/date-helpers';
	import { setSelectedMonth } from '$lib/stores/selectedMonth';
	import { parseBackup } from '$lib/storage/backup';
	import { appDataDir, join } from '@tauri-apps/api/path';
	import { exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
	import PlanningPage from '../planning/+page.svelte';
	let status = $state('Running planning checks in native dev mode');
	let showPlanning = $state(false);
	const checks: string[] = [];
	function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
	async function until(check: () => boolean | Promise<boolean>, message: string) { for (let i = 0; i < 200; i++) { if (await check()) return; await new Promise(r => setTimeout(r, 25)); } throw new Error(message); }
	function button(name: string) { const found = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === name); assert(found, `Missing button: ${name}`); return found; }
	function input(label: string, value: string) { const found = [...document.querySelectorAll('label')].find(l => l.textContent?.trim().startsWith(label))?.querySelector('input'); assert(found, `Missing input: ${label}`); found.value = value; found.dispatchEvent(new Event('input', { bubbles: true })); found.dispatchEvent(new Event('change', { bubbles: true })); }
	onMount(() => { void run(); });
	async function run() {
		const directory = await appDataDir(), resultPath = await join(directory, 'planning-result.json');
		try {
			await initializeStorage();
			if (await exists(resultPath)) {
				const previous = JSON.parse(await readTextFile(resultPath));
				assert(previous.ok, 'Prior dev checks failed');
				assert((await getPlanning()).schedules.length === 2, 'Plans did not survive native restart');
				await parseBackup(await readTextFile(await join(directory, 'data.json')));
				await writeTextFile(resultPath, JSON.stringify({ ...previous, restarted: true, checks: [...previous.checks, 'native restart and strict disk readback'] }));
				status = 'Native dev checks and restart passed'; return;
			}
			const now = new Date(), month = getMonthKey(now), date = formatDateForInput(now);
			setSelectedMonth(month);
			await saveBudget(month, { income: 5000, savedAmount: 0 });
			const accountId = await addSavingsAccount({ name: 'Dev goal', accountType: 'savings', currentBalance: 200, targetAmount: 2000, sortOrder: 100 });
			const bankId = await addLinkedAccount({ name: 'Dev bank', institution: 'Fixture', accountType: 'savings', accountClass: 'asset', initialBalance: 1000 });
			await linkSavingsAllocation(accountId, bankId, 200);
			await saveSavingsPlan({ id: 'dev-plan', accountId, amount: 500, startMonth: month });
			await saveSchedule({ id: 'rent', merchant: 'Rent', amount: 2000, date: `${navigateMonth(month, -1)}-01`, frequency: 'monthly', amountType: 'fixed', categoryId: 1, isShared: false, splitType: 'percentage', splitValue: .5, active: true });
			const entry = { date: new Date(now.getFullYear(), now.getMonth(), 1), merchant: 'Rent', amount: 2000, categoryId: 1, isShared: false, splitType: 'percentage' as const, splitValue: .5, isSettled: false, isEssential: true, isSubscription: false };
			await addTransaction(entry);
			await addTransaction({ ...entry, date: new Date(now.getFullYear(), now.getMonth() - 1, 15), merchant: 'Groceries', amount: 300 });
			const forecast = calculateForecast({ month, transactions: await getAllTransactions(), contributions: [], planning: await getPlanning(), income: 5000 });
			assert(forecast.upcoming === 0 && forecast.recorded === 2000 && forecast.variable === 300 && forecast.remainder === 2200, 'Early rent forecast is wrong'); checks.push('early rent counted once; historical variable spending; reserved savings');
			showPlanning = true; await tick();
			await until(() => !!document.querySelector('button[aria-pressed]'), 'Planning UI did not render');
			button('Purchase simulator').click(); await tick();
			input('Date', `${navigateMonth(month, 1)}-15`); input('Your purchase amount', '1200'); await tick();
			assert(document.body.textContent?.includes('Purchase, savings unchanged:'), 'Purchase comparison did not render');
			const count = await db.transactions.count();
			assert((await getPlanning()).schedules.length === 1, 'Preview modified saved plans');
			button('Review planned changes').click(); await tick();
			assert(document.body.textContent?.includes('Confirm planned changes'), 'Confirmation did not show specific changes');
			button('Confirm and apply plans').click();
			await until(async () => (await getPlanning()).schedules.length === 2, 'Confirmed scenario was not saved');
			assert(await db.transactions.count() === count, 'Applying a scenario changed recorded expenses'); checks.push('native dev simulator UI; concrete confirmation; preview purity');
			await until(() => !!document.querySelector('button[aria-pressed]'), 'Planning did not refresh');
			button('Goals and funding').click(); await tick();
			assert(document.body.textContent?.includes('All monthly savings plans share'), 'Unified funding UI missing'); checks.push('goal planner UI');
			assert(document.body.textContent?.includes('Unexplained difference:') && document.body.textContent?.includes('Stale or unverified balance'), 'Bank allocation review UI missing'); checks.push('stale bank balance and unexplained difference UI');
			showPlanning = false; await tick();
			const sharedId = await addTransaction({ ...entry, merchant: 'Shared purchase', date: now, amount: 100, isShared: true, splitType: 'fixed', splitValue: 40 });
			await addRefund(sharedId, 25, now);
			assert(await calculateOutstandingBalance() === 30, 'Refund share not credited');
			await recordSettlement({ date, amount: 10, allocations: [{ transactionId: sharedId, amount: 10 }] });
			assert(await calculateOutstandingBalance() === 20, 'Partial settlement incorrect');
			await recordSettlement({ date, amount: 20, allocations: [{ transactionId: sharedId, amount: 20 }] });
			assert(await calculateOutstandingBalance() === 0, 'Full net settlement incorrect'); checks.push('partial refund; partial and full allocated reimbursements');
			const lateRefund = await addRefund(sharedId, 25, now);
			assert(await calculateOutstandingBalance() === -10, 'Reimbursed refund did not create partner credit');
			await recordSettlement({ date, direction: 'sent', amount: 10, allocations: [{ transactionId: lateRefund, amount: 10 }] });
			assert(await calculateOutstandingBalance() === 0, 'Sent refund credit was not allocated'); checks.push('sent payment for refund credit');
			const splitIds = await addSplitTransaction({ ...entry, merchant: 'Template purchase', date: now, amount: 100, notes: '#trip' }, [{ categoryId: 1, amount: 60, notes: '#food' }, { categoryId: 1, amount: 40, notes: '#home' }]);
			const template = templateFromTransactions((await getAllTransactions()).filter(t => splitIds.includes(t.id!)), 'Dev template');
			await saveTemplate(template);
			assert((await getPlanning()).templates[0].splits?.every(s => s.notes?.includes('#trip')), 'Split template lost notes and tags'); checks.push('split template notes and tags');
			await addContribution({ date: now, accountId, amount: -50, kind: 'withdrawal', source: 'bank_transfer' });
			assert((await db.savingsAccounts.get(accountId))?.currentBalance === 150, 'Withdrawal did not reduce goal funding');
			await confirmCompleteThrough(date); checks.push('savings withdrawal; completeness confirmation');
			await parseBackup(await readTextFile(await join(directory, 'data.json'))); checks.push('strict native disk readback');
			await writeTextFile(resultPath, JSON.stringify({ ok: true, mode: 'tauri dev', checks }));
			status = 'Native dev planning checks passed';
		} catch (error) { status = error instanceof Error ? error.stack ?? error.message : String(error); await writeTextFile(resultPath, JSON.stringify({ ok: false, mode: 'tauri dev', checks, error: status })); }
	}
</script>
<p>{status}</p>
{#if showPlanning}<PlanningPage />{/if}
