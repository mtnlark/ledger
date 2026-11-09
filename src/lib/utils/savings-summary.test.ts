import { expect, it } from 'vitest';
import { summarizeSavings } from './savings-summary';
import { calculateForecast } from '$lib/planning/forecast';
import { emptyPlanning } from '$lib/planning/types';

it('separates cash and external savings sources and retains negative net savings', () => {
	const events = [
		{ source: 'bank_transfer', amount: 100 }, { source: 'other', amount: 50 },
		{ source: 'bank_transfer', amount: -500 }, { source: 'payroll_deduction', amount: 60 },
		{ source: 'interest', amount: 10 }, { source: 'employer_match', amount: 40 }
	];
	expect(summarizeSavings(events)).toEqual({ added: 260, withdrawals: 500, cashContributions: 150, netSaved: -240, netCashSaved: -350 });
	expect(summarizeSavings([]).withdrawals).toBe(0);
});
it.each([null, 0, 1000])('preserves signed forecast savings with income %s and future reservations', income => {
	const date = new Date(2026, 0, 25);
	const contributions = [
		{ id: 1, accountId: 1, amount: 100, source: 'other' as const, date, createdAt: date, updatedAt: date },
		{ id: 2, accountId: 1, amount: -400, kind: 'withdrawal' as const, source: 'bank_transfer' as const, date: new Date(2026, 0, 1), createdAt: date, updatedAt: date },
		{ id: 3, accountId: 1, amount: 1000, source: 'payroll_deduction' as const, date, createdAt: date, updatedAt: date }
	];
	const result = calculateForecast({ month: '2026-01', income, contributions, transactions: [], planning: emptyPlanning(), now: new Date(2026, 0, 5) });
	expect(result).toMatchObject({ savings: -300, fromSavings: 400, cashContributions: 100, remaining: income === null ? null : income + 300 });
});
