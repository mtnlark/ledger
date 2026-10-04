import { describe, expect, it } from 'vitest';
import { calculateForecast, getScheduleOccurrences, matchCommitments, projectGoals, calculateGoalProjections, plannedSavingsByAccount } from './forecast';
import { emptyPlanning, type ExpenseSchedule } from './types';
import type { Transaction, SavingsAccount } from '$lib/db';

const now = new Date(2026, 9, 3);
const tx = (id: number, date: Date, amount: number, extra: Partial<Transaction> = {}): Transaction => ({ id, date, merchant: 'Store', amount, categoryId: 1, isShared: false, splitType: 'percentage', splitValue: .5, partnerShare: 0, isSettled: false, isEssential: false, isSubscription: false, createdAt: now, updatedAt: now, ...extra });
const rent: ExpenseSchedule = { id: 'rent', merchant: 'Rent', amount: 2000, amountType: 'fixed', date: '2026-01-01', frequency: 'monthly', categoryId: 1, isShared: false, splitType: 'percentage', splitValue: .5, active: true };
const forecast = (transactions: Transaction[], schedules: ExpenseSchedule[] = [rent]) => calculateForecast({ month: '2026-10', now, transactions, income: 5000, contributions: [], planning: { ...emptyPlanning(), schedules } });

describe('commitment-aware budget estimate', () => {
	it('does not extrapolate early rent, and excludes a payment already recorded', () => {
		const result = forecast([tx(1, new Date(2026, 9, 1), 2000, { merchant: 'Rent' }), tx(2, new Date(2026, 8, 1), 2000, { merchant: 'Rent' }), tx(3, new Date(2026, 8, 15), 300)]);
		expect(result.recorded).toBe(2000);
		expect(result.upcoming).toBe(0);
		expect(result.variable).toBe(300);
		expect(result.remainder).toBe(2700);
	});
	it('reserves variable bills once when their actual amount differs', () => {
		const bill = { ...rent, id: 'bill', merchant: 'Power', date: '2026-01-15', amount: 100, amountType: 'variable' as const };
		const result = forecast([tx(1, new Date(2026, 9, 16), 135, { merchant: 'Power' })], [bill]);
		expect(result.recorded).toBe(0);
		expect(result.upcoming).toBe(135);
		expect(result.commitments[0].matchedIds).toEqual([1]);
	});
	it('never matches the same purchase to two commitments', () => {
		const rows = getScheduleOccurrences([rent, { ...rent, id: 'other' }], '2026-10');
		const result = matchCommitments(rows, [tx(1, new Date(2026, 9, 1), 2000, { merchant: 'Rent' })]);
		expect(result.filter(c => c.matchedIds.length)).toHaveLength(1);
	});
	it('keeps unmatched overdue bills reserved', () => expect(forecast([]).upcoming).toBe(2000));
	it('clamps an anchor on the 31st without drifting in following months', () => {
		const schedule = { ...rent, date: '2026-01-31' };
		expect(getScheduleOccurrences([schedule], '2026-02')[0].date).toBe('2026-02-28');
		expect(getScheduleOccurrences([schedule], '2026-03')[0].date).toBe('2026-03-31');
	});
	it('reserves future contributions and only the unfunded part of a savings plan', () => {
		const result = calculateForecast({ month: '2026-10', now, transactions: [], income: 3000, planning: { ...emptyPlanning(), savingsPlans: [{ id: 'p', accountId: 1, amount: 500, startMonth: '2026-10' }] }, contributions: [{ id: 1, date: new Date(2026, 9, 20), accountId: 1, amount: 200, source: 'bank_transfer', createdAt: now, updatedAt: now }] });
		expect(result.savings).toBe(500);
		expect(result.remainder).toBe(2500);
	});
	it('retains one-offs and refunds in totals while excluding them from the baseline', () => {
		const result = forecast([tx(1, new Date(2026, 8, 15), 1000, { isExpectedOneOff: true }), tx(2, new Date(2026, 9, 1), -50, { refundOfTransactionId: 1 })], []);
		expect(result.recorded).toBe(-50);
		expect(result.variable).toBe(0);
	});
	it('returns no estimated range when there is no historical baseline', () => expect(forecast([]).range).toBeNull());
	it('uses a single funding pool for competing goals', () => {
		const accounts = [1, 2].map(id => ({ id, name: `Goal ${id}`, accountType: 'savings', sortOrder: id, currentBalance: 0, targetAmount: 1000, createdAt: now, updatedAt: now } as SavingsAccount));
		const goals = projectGoals(accounts, 100, new Map([[1, 100], [2, 100]]), now);
		expect(goals.map(g => g.fundedMonthly)).toEqual([50, 50]);
		expect(goals[0].completion?.getFullYear()).toBe(2028);
	});
	it('previews are pure and leave source data unchanged', () => {
		const transactions = [tx(1, new Date(2026, 9, 1), 100)];
		const before = JSON.stringify(transactions);
		forecast(transactions);
		expect(JSON.stringify(transactions)).toBe(before);
	});
	it('uses recent completed history when previewing a distant future month', () => {
		const result = calculateForecast({ month: '2027-10', now, transactions: [tx(1, new Date(2026, 8, 15), 300)], contributions: [], planning: emptyPlanning(), income: 3000 });
		expect(result.variable).toBe(300);
	});
	it('honors an explicit cross-month payment link without reserving the bill again', () => {
		const result = forecast([tx(1, new Date(2026, 8, 30), 2000, { merchant: 'Rent', scheduleId: 'rent', scheduleDate: '2026-10-01' })]);
		expect(result.upcoming).toBe(0);
	});
	it('keeps preview purchases separate from nearby recorded purchases', () => {
		const result = forecast([tx(1, new Date(2026, 9, 1), 2000, { merchant: 'Rent' })], [{ ...rent, autoMatch: false }]);
		expect(result.upcoming).toBe(2000);
	});
	it('restores the original savings plan after a temporary monthly override', () => {
		const p = { ...emptyPlanning(), savingsPlans: [{ id: 'base', accountId: 1, amount: 500, startMonth: '2026-01' }, { id: 'temporary', accountId: 1, amount: 100, startMonth: '2026-11', endMonth: '2026-11' }] };
		expect(plannedSavingsByAccount(p, '2026-11').get(1)).toBe(100);
		expect(plannedSavingsByAccount(p, '2026-12').get(1)).toBe(500);
	});
	it('includes a future contribution in goal dates once and shares one pool', () => {
		const accounts = [1, 2].map(id => ({ id, name: `Goal ${id}`, accountType: 'savings', sortOrder: id, currentBalance: 0, targetAmount: 100, createdAt: now, updatedAt: now } as SavingsAccount));
		const goals = calculateGoalProjections({ accounts, now, income: 100, transactions: [], planning: { ...emptyPlanning(), savingsPlans: [{ id: 'p', accountId: 2, amount: 100, startMonth: '2026-10' }] }, contributions: [{ accountId: 1, amount: 100, source: 'bank_transfer', date: new Date(2026, 9, 20), createdAt: now, updatedAt: now }] });
		expect(goals[0].completion).toBeNull(); // Its only $100 reservation receives $50.
		expect(goals[1].completion?.getMonth()).toBe(10);
	});
	it('shows a later goal date for a temporary savings reduction, then resumes the base plan', () => {
		const accounts = [{ id: 1, name: 'Goal', accountType: 'savings', sortOrder: 1, currentBalance: 0, targetAmount: 1000, createdAt: now, updatedAt: now } as SavingsAccount];
		const planning = { ...emptyPlanning(), savingsPlans: [{ id: 'p', accountId: 1, amount: 500, startMonth: '2026-10' }] };
		const baseline = calculateGoalProjections({ accounts, now, income: 1500, transactions: [], contributions: [], planning });
		const changed = calculateGoalProjections({ accounts, now, income: 1500, transactions: [], contributions: [], planning: { ...planning, savingsPlans: [...planning.savingsPlans, { id: 'temporary', accountId: 1, amount: 0, startMonth: '2026-11', endMonth: '2026-11' }] } });
		expect(baseline[0].completion?.getMonth()).toBe(10);
		expect(changed[0].completion?.getMonth()).toBe(11);
	});
});
