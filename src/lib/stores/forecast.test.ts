import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, DEFAULT_SETTINGS, type Transaction } from '$lib/db';
import { getForecastPlanning } from './forecast';
import { calculateForecast } from '$lib/planning/forecast';
vi.mock('$lib/stores/recurringCache', () => ({ getCachedRecurring: () => null, setCachedRecurring: vi.fn(), invalidateRecurringCache: vi.fn() }));
const now = new Date(2026, 9, 10);
const tx = (id: number, month: number, day: number, merchant: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({ id, date: new Date(2026, month, day), merchant, amount, categoryId: 1, isShared: false, splitType: 'percentage', splitValue: .5, partnerShare: 0, isSettled: false, isEssential: false, isSubscription: false, createdAt: now, updatedAt: now, ...extra });
beforeEach(async () => { await db.delete(); await db.open(); await db.settings.put(DEFAULT_SETTINGS); });
async function estimate(transactions: Transaction[]) {
	const planning = await getForecastPlanning('2026-10', transactions);
	return calculateForecast({ month: '2026-10', now, transactions, planning, income: 5000, contributions: [] });
}
describe('forecast using existing recurring records', () => {
	it('recognizes rent already paid and does not extrapolate it as everyday spending', async () => {
		const result = await estimate([tx(1, 7, 1, 'Rent', 2000), tx(2, 8, 1, 'Rent', 2000), tx(3, 9, 1, 'Rent', 2000), tx(4, 8, 20, 'Groceries', 300), tx(5, 7, 20, 'Market', 300)]);
		expect(result.recorded).toBe(2000); expect(result.upcoming).toBe(0); expect(result.variable).toBe(300);
	});
	it('uses variable bill history, respects the existing amount override, and counts future payments once', async () => {
		const history = [tx(1, 7, 15, 'Power', 100), tx(2, 8, 15, 'Power', 140)];
		await db.settings.update(1, { fixedRecurringAmounts: [{ merchant: 'power', amount: 125 }] });
		expect((await estimate(history)).upcoming).toBe(125);
		const paid = await estimate([...history, tx(3, 9, 16, 'Power', 135)]);
		expect(paid.upcoming).toBe(135); expect(paid.variable).toBe(0);
		const late = await estimate([...history, tx(3, 9, 28, 'Power', 135)]);
		expect(late.upcoming).toBe(135); expect(late.variable).toBe(0);
	});
	it('omits cancelled subscriptions and does not create saved plans or expenses', async () => {
		const rows = [tx(1, 8, 20, 'Netflix', 20, { isSubscription: true })];
		await db.settings.update(1, { cancelledSubscriptions: [{ merchant: 'netflix', cancelledDate: '2026-10-01' }] });
		expect((await estimate(rows)).upcoming).toBe(0);
		expect((await db.settings.get(1))?.planning).toBeUndefined(); expect(await db.transactions.count()).toBe(0);
	});
	it('excludes stale monthly subscriptions unless explicitly confirmed active', async () => {
		const rows = [tx(1, 5, 20, 'Netflix', 20, { isSubscription: true })];
		expect((await estimate(rows)).upcoming).toBe(0);
		await db.settings.update(1, { confirmedActiveSubscriptions: ['netflix'] });
		expect((await estimate(rows)).upcoming).toBe(20);
	});
	it('keeps a paid annual bill in this month’s bill baseline', async () => {
		const result = await estimate([tx(1, 9, 5, 'Annual insurance', 1200, { isSubscription: true, subscriptionFrequency: 'annual' })]);
		expect(result.recorded).toBe(1200); expect(result.upcoming).toBe(0); expect(result.variable).toBe(0);
	});
});
