import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, db } from '$lib/db';
import { startScheduler, stopScheduler, hasVisibleTransactionsForDay } from './scheduler';
const send = vi.hoisted(() => vi.fn());
vi.mock('./tauri-notifications', () => ({ sendNotification: send }));
const settings = { ...DEFAULT_SETTINGS, dailyReminderEnabled: true, dailyReminderTime: '20:00', weeklyReviewEnabled: false, monthlyBudgetSetupEnabled: false };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 2, 19, 59)); localStorage.clear(); send.mockClear(); });
afterEach(() => { stopScheduler(); vi.useRealTimers(); });
it('checks current eligibility only when due and suppresses a reminder after logging', async () => {
	let logged = false; const query = vi.fn(async () => logged);
	startScheduler(settings, query);
	expect(query).not.toHaveBeenCalled(); logged = true;
	await vi.advanceTimersByTimeAsync(60000);
	expect(query).toHaveBeenCalledOnce(); expect(send).not.toHaveBeenCalled();
	expect(localStorage.getItem('ledger-notif-daily-last-fired')).toBe('2026-10-02');
});
it('deleting the last visible expense before the reminder restores eligibility', async () => {
	let logged = true; const query = vi.fn(async () => logged);
	startScheduler(settings, query); logged = false;
	await vi.advanceTimersByTimeAsync(60000);
	expect(send).toHaveBeenCalledOnce();
});
it('does not overlap eligibility queries or accept results from a stopped scheduler', async () => {
	let resolve!: (logged: boolean) => void;
	const query = vi.fn(() => new Promise<boolean>((r) => { resolve = r; }));
	vi.setSystemTime(new Date(2026, 9, 2, 20)); startScheduler(settings, query);
	await vi.advanceTimersByTimeAsync(180000);
	expect(query).toHaveBeenCalledOnce(); stopScheduler(); resolve(false); await Promise.resolve();
	expect(send).not.toHaveBeenCalled(); expect(localStorage.getItem('ledger-notif-daily-last-fired')).toBeNull();
});
it('retries a failed query and resets eligibility on the next calendar day', async () => {
	const query = vi.fn().mockRejectedValueOnce(new Error('DB unavailable')).mockResolvedValue(false);
	vi.setSystemTime(new Date(2026, 9, 2, 20)); startScheduler(settings, query); await Promise.resolve();
	expect(localStorage.getItem('ledger-notif-daily-last-fired')).toBeNull();
	await vi.advanceTimersByTimeAsync(60000); expect(send).toHaveBeenCalledOnce();
	vi.setSystemTime(new Date(2026, 9, 3, 20)); await vi.advanceTimersByTimeAsync(60000);
	expect(send).toHaveBeenCalledTimes(2);
});

it('counts only visible transactions on the queried local day', async () => {
	vi.useRealTimers(); await db.delete(); await db.open();
	const row = { merchant: 'Store', amount: 10, categoryId: 1, date: new Date(2026, 9, 2), isShared: false, splitType: 'percentage' as const, splitValue: 0.5, partnerShare: 0, isSettled: false, isEssential: false, isSubscription: false, createdAt: new Date(), updatedAt: new Date() };
	await db.transactions.bulkPut([{ ...row, id: 1, isSplitParent: true }, { ...row, id: 2, isDeleted: true }, { ...row, id: 3, date: new Date(2026, 9, 3) }]);
	expect(await hasVisibleTransactionsForDay(new Date(2026, 9, 2))).toBe(false);
	await db.transactions.put({ ...row, id: 4 });
	expect(await hasVisibleTransactionsForDay(new Date(2026, 9, 2))).toBe(true);
});
it('discards results from a replaced scheduler and from the prior calendar day', async () => {
	let resolve!: (logged: boolean) => void;
	vi.setSystemTime(new Date(2026, 9, 2, 23, 59));
	startScheduler(settings, () => new Promise((r) => { resolve = r; }));
	vi.setSystemTime(new Date(2026, 9, 3, 0, 0)); resolve(false); await Promise.resolve();
	expect(send).not.toHaveBeenCalled(); expect(localStorage.getItem('ledger-notif-daily-last-fired')).toBeNull();
	vi.setSystemTime(new Date(2026, 9, 3, 20));
	startScheduler(settings, () => new Promise((r) => { resolve = r; }));
	startScheduler(settings, async () => true); resolve(false); await Promise.resolve();
	expect(send).not.toHaveBeenCalled(); expect(localStorage.getItem('ledger-notif-daily-last-fired')).toBe('2026-10-03');
});
