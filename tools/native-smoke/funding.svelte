<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { db, getMonthKey } from '$lib/db';
	import { initializeStorage } from '$lib/storage';
	import { addSavingsAccount } from '$lib/stores/savingsAccounts';
	import { saveBudget } from '$lib/stores/budget';
	import { saveCategoryBudget, getEffectiveBudgetsForMonth } from '$lib/stores/categoryBudget';
	import { setSelectedMonth } from '$lib/stores/selectedMonth';
	import { loadDashboardData } from '$lib/stores/dashboard';
	import { parseBackup } from '$lib/storage/backup';
	import { appDataDir, join } from '@tauri-apps/api/path';
	import { exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
	import Savings from '../savings/+page.svelte';
	import Budget from '../budget/+page.svelte';
	import Settings from '../settings/+page.svelte';
	let view = $state('');
	let replacementCount = $state(0);
	let status = $state('Checking savings funding in an isolated native app');
	const checks: string[] = [];
	function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
	async function until(check: () => boolean | Promise<boolean>, message: string) { for (let i = 0; i < 400; i++) { if (await check()) return; await new Promise(r => setTimeout(r, 25)); } throw new Error(message); }
	function button(name: string) { const result = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === name); assert(result, `Missing button: ${name}`); return result; }
	function field(name: string) { const label = [...document.querySelectorAll('label')].find(l => l.firstChild?.textContent?.trim() === name); assert(label, `Missing field: ${name}`); const input = label.querySelector<HTMLInputElement | HTMLSelectElement>('input,select'); assert(input, `Missing input: ${name}`); return input; }
	function fill(name: string, value: string) { const input = field(name); input.value = value; input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }
	onMount(() => {
		const refresh = () => { replacementCount++; };
		window.addEventListener('ledger:data-replaced', refresh);
		void run();
		return () => window.removeEventListener('ledger:data-replaced', refresh);
	});
	async function run() {
		const directory = await appDataDir(), resultPath = await join(directory, 'funding-result.json');
		try {
			window.addEventListener('error', event => { void writeTextFile(resultPath, JSON.stringify({ ok: false, error: event.message })); });
			window.addEventListener('unhandledrejection', event => { void writeTextFile(resultPath, JSON.stringify({ ok: false, error: String(event.reason) })); });
			await initializeStorage();
			const restarted = await exists(resultPath);
			const now = new Date(), month = getMonthKey(now);
			setSelectedMonth(month);
			if (!restarted) {
				await saveBudget(month, { income: 9113.54, savedAmount: 0 });
				await addSavingsAccount({ name: 'Synthetic spending fund', accountType: 'savings', currentBalance: 500, sortOrder: 100 });
				await addSavingsAccount({ name: 'Synthetic adjusted fund', accountType: 'savings', currentBalance: 0, sortOrder: 101 });
			}
			const funds = await db.savingsAccounts.toArray();
			const spendingFund = funds.find(a => a.name === 'Synthetic spending fund')!, adjustedFund = funds.find(a => a.name === 'Synthetic adjusted fund')!;
			const category = (await db.categories.toArray())[0];
			assert(spendingFund && adjustedFund && category, 'Fixture missing');
			if (!restarted) await saveCategoryBudget(category.id!, month, 200);
			await writeTextFile(await join(directory, 'progress.json'), JSON.stringify({ step: 'mount savings' }));
			view = 'savings'; await tick();
			await writeTextFile(await join(directory, 'progress.json'), JSON.stringify({ step: 'savings mounted', body: document.body.textContent }));
			await until(() => document.body.textContent?.includes('Net saved') ?? false, 'Savings summary did not render');
			if (!restarted) {
				button('Use savings').click(); await tick();
				assert(document.querySelector('[role="dialog"]')?.contains(document.activeElement), 'Use savings modal did not receive keyboard focus');
				fill('Fund', String(spendingFund.id)); fill('Amount', '100');
				await until(() => [...field('Add to category budget').querySelectorAll('option')].some(o => o.value === String(category.id)), 'Categories not loaded');
				assert(field('Add to category budget').value === '', 'Category funding did not default to unallocated');
				fill('Add to category budget', String(category.id)); await tick();
				await until(() => document.body.textContent?.includes('Category allowance after: $300.00') ?? false, 'Category preview incorrect');
				const modal = document.querySelector<HTMLElement>('[role="dialog"]')!;
				const colors: string[] = [];
				for (const dark of [false, true]) {
					document.documentElement.classList.toggle('dark', dark); await tick(); colors.push(getComputedStyle(modal).backgroundColor);
					assert(modal.scrollWidth <= modal.clientWidth + 1, 'Modal horizontal overflow');
				}
				document.documentElement.classList.remove('dark');
				assert(colors[0] !== colors[1], 'Modal theme tokens did not change');
				modal.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
				await until(() => !document.querySelector('[role="dialog"]'), 'Withdrawal form did not close after save');
				const disk = await parseBackup(await readTextFile(await join(directory, 'data.json')));
				assert(disk.data.savingsContributions?.some(c => c.accountId === spendingFund.id && c.amount === -100 && c.budgetCategoryId === category.id), 'Withdrawal acknowledged before durable save');
				checks.push('actual Savings entry; unallocated default; category and fund preview; keyboard focus; both themes; durable acknowledgment');
			}
			view = 'budget'; await tick();
			await until(() => document.body.textContent?.includes('Budget Funding') ?? false, 'Budget Funding did not render');
			assert(document.body.textContent?.includes('from savings') && document.body.textContent?.includes('/ $300'), 'Budget category allowance missing savings funding');
			checks.push('actual Budget allowance and funding summary');
			if (!restarted) {
				const before = await loadDashboardData(month);
				localStorage.setItem('ledger-settings-section', 'data');
				view = 'correction'; await tick();
				await until(() => [...document.querySelectorAll('button')].some(b => b.textContent?.trim() === 'Correct savings counted as income'), 'Settings did not load on mount');
				button('Correct savings counted as income').click();
				await until(() => document.querySelector('form') !== null, 'Correction form missing');
				fill('Fund', String(adjustedFund.id)); fill('Amount', '1500');
				fill('Actual date', `${month}-01`); fill('Note (optional)', 'Synthetic planned holiday gifts correction');
				const checkbox = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
				assert(!checkbox.checked, 'Already-adjusted balance option defaulted on'); checkbox.click(); await tick();
				button('Preview income correction').click();
				await until(() => document.body.textContent?.includes('Savings income correction preview') ?? false, 'Correction preview missing');
				assert(document.body.textContent?.includes('$9,113.54 → $7,613.54') && document.body.textContent?.includes('Fund balance: $0.00 → $0.00'), 'Correction preview differs');
				const beforeReplacement = replacementCount;
				button('Preserve original and apply income correction').click();
				await until(() => replacementCount > beforeReplacement && !document.querySelector('.animate-spin') && [...document.querySelectorAll('button')].some(b => b.textContent?.trim() === 'Correct savings counted as income'), 'Settings remained loading after correction remount');
				const after = await loadDashboardData(month);
				assert(after.budget?.income === 7613.54 && after.fromSavings === before.fromSavings + 1500 && after.budget.income - after.savedFromContributions === before.budget!.income - before.savedFromContributions, 'Correction changed available cash');
				assert(after.forecast.remainder === before.forecast.remainder && after.forecast.recorded === before.forecast.recorded && after.forecast.variable === before.forecast.variable, 'Correction changed forecast');
				checks.push('actual Settings correction and page remount; verified original; adjusted balance preserved; available cash and forecast unchanged');
			}
			const disk = await parseBackup(await readTextFile(await join(directory, 'data.json')));
			assert(disk.data.savingsAccounts?.find(a => a.id === adjustedFund.id)?.currentBalance === 0, 'Adjusted balance changed');
			assert(disk.data.savingsContributions?.filter(c => c.accountId === adjustedFund.id).length === 1, 'Correction missing or duplicated');
			assert(disk.data.monthlyBudgets.find(b => b.month === month)?.income === 7613.54, 'Income correction missing');
			assert((await getEffectiveBudgetsForMonth(month)).byCategory.get(category.id!)?.effective === 300, 'Allowance changed');
			checks.push('strict disk validation; corrected income, one event, fund balance and allowance survive relaunch');
			await writeTextFile(resultPath, JSON.stringify({ ok: true, restarted, checks }));
			status = restarted ? 'Savings native checks and restart passed' : 'Savings native checks passed';
		} catch (error) { status = error instanceof Error ? error.message + '\n' + error.stack : String(error); await writeTextFile(resultPath, JSON.stringify({ ok: false, checks, error: status })); }
	}
</script>
<p>{status}</p>
{#if view === 'savings'}<Savings />{:else if view === 'budget'}<Budget />{:else if view === 'correction'}{#key replacementCount}<Settings />{/key}{/if}
