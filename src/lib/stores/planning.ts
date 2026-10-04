import { db, type SavingsAccount, type Transaction } from '$lib/db';
import { runMutation } from '$lib/storage/mutation';
import { getSettings, updateSettings } from './settings';
import { emptyPlanning, type EntryTemplate, type ExpenseSchedule, type PlanningData, type SavingsPlan, type SettlementPayment } from '$lib/planning/types';
import { validatePlanningData } from '$lib/planning/validation';
import { formatDateForInput } from '$lib/utils/date-helpers';
import { roundCurrency, sumCurrency } from '$lib/utils/currency';
import { getAllTransactions, updateTransaction } from './transactions';

export async function getPlanning(): Promise<PlanningData> { return (await getSettings()).planning ?? emptyPlanning(); }

export async function changePlanning(change: (current: PlanningData) => PlanningData): Promise<void> {
	return runMutation(['settings', 'categories', 'savingsAccounts', 'transactions'], async () => {
		const next = change(await getPlanning());
		validatePlanningData(next);
		for (const schedule of next.schedules) {
			for (const id of [schedule.categoryId, ...(schedule.allocations ?? []).map(a => a.categoryId)]) if (!(await db.categories.get(id))) throw new Error('Missing schedule category');
		}
		for (const plan of next.savingsPlans) if (!(await db.savingsAccounts.get(plan.accountId))) throw new Error('Missing savings account');
		for (const template of next.templates) for (const id of [template.entry.categoryId, ...(template.splits ?? []).map(s => s.categoryId)]) if (!(await db.categories.get(id))) throw new Error('Missing template category');
		await updateSettings({ planning: next });
	});
}

export async function saveSchedule(schedule: ExpenseSchedule): Promise<void> {
	await changePlanning(p => ({ ...p, schedules: [...p.schedules.filter(s => s.id !== schedule.id), schedule] }));
}
export async function removeSchedule(id: string): Promise<void> {
	await changePlanning(p => ({ ...p, schedules: p.schedules.filter(s => s.id !== id) }));
}
export async function saveSavingsPlan(plan: SavingsPlan): Promise<void> {
	await changePlanning(p => ({ ...p, savingsPlans: [...p.savingsPlans.filter(s => s.id !== plan.id), plan] }));
}
export async function confirmCompleteThrough(date: string): Promise<void> {
	if (date > formatDateForInput(new Date())) throw new Error('Completeness date cannot be in the future');
	await changePlanning(p => ({ ...p, completeThrough: date }));
}

export function templateFromTransactions(rows: Transaction[], name: string): EntryTemplate {
	const first = rows[0];
	if (!first || rows.some(t => t.amount <= 0 || t.isDeleted || t.isSplitParent)) throw new Error('Choose a recorded purchase');
	const amount = sumCurrency(rows.map(t => t.amount));
	const partner = sumCurrency(rows.map(t => t.partnerShare));
	return { id: crypto.randomUUID(), name, entry: { merchant: first.merchant, amount, categoryId: first.categoryId, isShared: first.isShared, splitType: first.splitType, splitValue: first.splitType === 'fixed' ? partner : first.splitValue, isEssential: first.isEssential, isSubscription: first.isSubscription, subscriptionFrequency: first.subscriptionFrequency, isExpectedOneOff: first.isExpectedOneOff, notes: rows.length > 1 ? undefined : first.notes }, splits: rows.length > 1 ? rows.map(t => ({ categoryId: t.categoryId, amount: t.amount, notes: t.notes })) : undefined };
}
export async function saveTemplate(template: EntryTemplate): Promise<void> {
	await changePlanning(p => ({ ...p, templates: [...p.templates.filter(t => t.id !== template.id), template] }));
}

export async function linkSavingsAllocation(accountId: number, linkedAccountId: number | undefined, allocatedBalance: number): Promise<void> {
	await runMutation(['savingsAccounts', 'savingsContributions', 'linkedAccounts'], async () => {
		const account = await db.savingsAccounts.get(accountId);
		if (!account || account.accountType !== 'savings' || !Number.isFinite(allocatedBalance) || allocatedBalance < 0) throw new Error('Invalid savings allocation');
		if (linkedAccountId !== undefined) {
			const bank = await db.linkedAccounts.get(linkedAccountId);
			if (!bank?.isActive || bank.accountClass !== 'asset' || bank.accountType !== 'savings') throw new Error('Choose an active savings bank account');
			const others = (await db.savingsAccounts.toArray()).filter(a => a.id !== accountId && a.linkedAccountId === linkedAccountId);
			const total = sumCurrency([allocatedBalance, ...others.map(a => a.currentBalance ?? 0)]);
			if (total > bank.currentBalance) throw new Error('Allocations exceed the latest bank balance. Review the balance or reduce an allocation.');
		}
		await db.savingsAccounts.update(accountId, { linkedAccountId, currentBalance: roundCurrency(allocatedBalance), updatedAt: new Date() });
	});
}

export function outstandingForTransaction(t: Transaction): number {
	return t.isSettled ? 0 : roundCurrency(t.partnerShare - Math.sign(t.partnerShare) * (t.settledAmount ?? 0));
}
export async function recordSettlement(payment: Omit<SettlementPayment, 'id'>): Promise<void> {
	await runMutation(['settings', 'transactions', 'categories'], async () => {
		const event: SettlementPayment = { ...payment, id: crypto.randomUUID() };
		const current = await getPlanning();
		const next = { ...current, settlements: [...current.settlements, event] };
		validatePlanningData(next);
		if (payment.date > formatDateForInput(new Date())) throw new Error('Record payments only after they occur');
		for (const allocation of payment.allocations) {
			const t = await db.transactions.get(allocation.transactionId);
			if (payment.direction === 'sent') {
				if (!t?.isShared || !t.refundOfTransactionId || t.isDeleted || t.isSettled || t.partnerShare >= 0 || allocation.amount > -outstandingForTransaction(t)) throw new Error('Choose an unpaid refund credit');
				const original = await db.transactions.get(t.refundOfTransactionId);
				const credits = await db.transactions.filter(r => r.refundOfTransactionId === original?.id && !r.isDeleted && !r.isSettled).toArray();
				const netCredit = -sumCurrency([original ? outstandingForTransaction(original) : 0, ...credits.map(outstandingForTransaction)]);
				if (allocation.amount > netCredit) throw new Error('Payment exceeds the net credit owed to your partner');
				const settledAmount = sumCurrency([t.settledAmount ?? 0, allocation.amount]);
				await updateTransaction(t.id!, { settledAmount, isSettled: settledAmount >= -t.partnerShare, settledDate: new Date(payment.date + 'T12:00:00') });
				continue;
			}
			const refunds = await db.transactions.filter(r => r.refundOfTransactionId === t?.id && !r.isDeleted && !r.isSettled).toArray();
			const refundCredit = sumCurrency(refunds.map(r => -r.partnerShare));
			if (!t?.isShared || t.refundOfTransactionId || t.isDeleted || t.isSplitParent || allocation.amount > roundCurrency(outstandingForTransaction(t) - refundCredit)) throw new Error('Payment exceeds the outstanding share');
			const settledAmount = sumCurrency([t.settledAmount ?? 0, allocation.amount]);
			const isSettled = sumCurrency([settledAmount, refundCredit]) >= t.partnerShare;
			await updateTransaction(t.id!, { settledAmount, isSettled, settledDate: isSettled ? new Date(payment.date + 'T12:00:00') : undefined });
			if (isSettled) for (const refund of refunds) await updateTransaction(refund.id!, { isSettled: true, settledDate: new Date(payment.date + 'T12:00:00') });
		}
		await updateSettings({ planning: next });
	});
}

export async function getPurchaseRows(transaction: Transaction): Promise<Transaction[]> {
	if (!transaction.parentTransactionId) return [transaction];
	return (await getAllTransactions()).filter(t => t.parentTransactionId === transaction.parentTransactionId);
}

/** Remove future contribution reservations from goal balances for as-of projections. */
export async function getRecordedGoalBalances(accounts: SavingsAccount[]): Promise<SavingsAccount[]> {
	const today = formatDateForInput(new Date());
	const future = (await db.savingsContributions.toArray()).filter(c => formatDateForInput(new Date(c.date)) > today);
	return accounts.map(a => ({ ...a, currentBalance: sumCurrency([a.currentBalance ?? 0, ...future.filter(c => c.accountId === a.id).map(c => -c.amount)]) }));
}
