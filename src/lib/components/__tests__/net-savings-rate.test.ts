import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import SavingsInsights from '../insights/SavingsInsights.svelte';
import SavingsRateTrendChart from '../insights/SavingsRateTrendChart.svelte';
import type { ChartConfiguration } from 'chart.js/auto';
const charts = vi.hoisted(() => [] as ChartConfiguration[]);
vi.mock('chart.js/auto', () => ({ Chart: class {
	static register() {}
	constructor(_canvas: unknown, config: ChartConfiguration) { charts.push(config); }
	update() {}
	destroy() {}
} }));
afterEach(() => { cleanup(); charts.length = 0; });
const event = (amount: number, month = 0) => ({ id: month + 1, accountId: 1, amount, kind: 'withdrawal' as const, source: 'bank_transfer' as const, date: new Date(2026, month, 1), createdAt: new Date(), updatedAt: new Date() });
it('renders negative net savings alongside additions and withdrawals and omits a rate without income', async () => {
	const props = { currentMonth: '2026-01', contributions: [event(-500)], accounts: [], budget: { month: '2026-01', income: 1000, savedAmount: 0 }, allContributions: [], allBudgets: [] };
	const view = render(SavingsInsights, props);
	expect(screen.getByText('-50%')).toBeInTheDocument();
	expect(screen.getByText(/Net saved · 1 savings event/)).toBeInTheDocument();
	expect(screen.getByText('Used from savings').parentElement).toHaveTextContent('$500.00');
	expect(screen.getByText('Added to savings').parentElement).toHaveTextContent('$0.00');
	await view.rerender({ budget: { ...props.budget, income: 0 } });
	expect(screen.queryByText('-50%')).not.toBeInTheDocument();
});
it('keeps negative rates visible in chart data and the chart axis', async () => {
	render(SavingsRateTrendChart, { contributions: [event(-500), event(-200, 1)], budgets: [0, 1].map(month => ({ month: `2026-0${month + 1}`, income: 1000, savedAmount: 0 })) });
	await waitFor(() => expect(charts).toHaveLength(1));
	expect(charts[0].data.datasets[0].data).toEqual([-50, -20]);
	expect(charts[0].options?.scales?.y?.min).toBeLessThan(-50);
});
