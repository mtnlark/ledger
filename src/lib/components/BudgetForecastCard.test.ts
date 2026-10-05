import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import BudgetForecastCard from './BudgetForecastCard.svelte';
import { calculateForecast } from '$lib/planning/forecast';
import { emptyPlanning } from '$lib/planning/types';
afterEach(cleanup);
describe('spending forecast', () => {
	it('shows spending separately from savings and leaves the explanation collapsed', () => {
		const forecast = calculateForecast({ month: '2026-10', now: new Date(2026, 9, 5), income: 5000, transactions: [], contributions: [], planning: { ...emptyPlanning(), savingsPlans: [{ id: 'p', accountId: 1, amount: 500, startMonth: '2026-10' }], schedules: [{ id: 'rent', merchant: 'Rent', amount: 2000, amountType: 'fixed', date: '2026-01-01', frequency: 'monthly', categoryId: 1, isShared: false, splitType: 'percentage', splitValue: .5, active: true }] } });
		render(BudgetForecastCard, { forecast, income: 5000 });
		expect(screen.getByLabelText('Projected spending')).toHaveTextContent('$2,000.00');
		expect(screen.getByText('Reserved savings').nextElementSibling).toHaveTextContent('$500.00');
		expect(screen.getByText('Expected remainder').nextElementSibling).toHaveTextContent('$2,500.00');
		expect(document.querySelector('details')?.open).toBe(false);
		expect(document.querySelector('a[href="/planning"]')).toBeNull();
	});
	it('can show an estimate before income is set without implying a complete forecast', () => {
		render(BudgetForecastCard, { forecast: calculateForecast({ month: '2026-10', now: new Date(2026, 9, 5), income: null, transactions: [], contributions: [], planning: emptyPlanning() }) });
		expect(screen.getByLabelText('Projected spending')).toHaveTextContent('$0.00');
		expect(screen.getByText(/With limited history/)).toBeInTheDocument();
		expect(screen.queryByText('Expected remainder')).toBeNull();
	});
});
