import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startScheduler, stopScheduler, _resetForTesting } from './scheduler';
import type { Settings } from '$lib/db/constants';
import { DEFAULT_SETTINGS } from '$lib/db/constants';

// Mock sendNotification
vi.mock('./tauri-notifications', () => ({
	sendNotification: vi.fn()
}));

import { sendNotification } from './tauri-notifications';

const mockSend = vi.mocked(sendNotification);

function makeSettings(overrides: Partial<Settings> = {}): Settings {
	return {
		...DEFAULT_SETTINGS,
		notificationsEnabled: true,
		...overrides
	};
}

// localStorage key constants (must match scheduler.ts)
const DAILY_KEY = 'ledger-notif-daily-last-fired';

describe('Notification Scheduler', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mockSend.mockClear();
		localStorage.clear();
		_resetForTesting();
	});

	afterEach(() => {
		stopScheduler();
		vi.useRealTimers();
	});

	// ── Daily reminder ──────────────────────────────────────────────

	describe('daily reminder', () => {
		// Disable monthly/weekly to isolate daily tests
		const dailyOnly = { weeklyReviewEnabled: false, monthlyBudgetSetupEnabled: false };

		it('fires at configured time when no transactions today', () => {
			// Tuesday Feb 4, 2026 at 20:00
			vi.setSystemTime(new Date(2026, 1, 4, 20, 0));
			const settings = makeSettings({ dailyReminderTime: '20:00', ...dailyOnly });

			startScheduler(settings, false);

			expect(mockSend).toHaveBeenCalledTimes(1);
			expect(mockSend).toHaveBeenCalledWith(
				'Ledger',
				expect.stringContaining('expense')
			);
		});

		it('does not fire before configured time', () => {
			// Tuesday Feb 4, 2026 at 19:59
			vi.setSystemTime(new Date(2026, 1, 4, 19, 59));
			const settings = makeSettings({ dailyReminderTime: '20:00', ...dailyOnly });

			startScheduler(settings, false);

			expect(mockSend).not.toHaveBeenCalled();
		});

		it('does not fire if transactions exist today', () => {
			vi.setSystemTime(new Date(2026, 1, 4, 20, 0));
			const settings = makeSettings({ dailyReminderTime: '20:00', ...dailyOnly });

			startScheduler(settings, true); // has transactions

			expect(mockSend).not.toHaveBeenCalled();
			// Should still mark as fired (skip notification but record the day)
			expect(localStorage.getItem(DAILY_KEY)).toBe('2026-02-04');
		});

		it('does not double-fire on subsequent ticks', () => {
			vi.setSystemTime(new Date(2026, 1, 4, 20, 0));
			const settings = makeSettings({ dailyReminderTime: '20:00', ...dailyOnly });

			startScheduler(settings, false);
			expect(mockSend).toHaveBeenCalledTimes(1);

			// Advance 60s (next tick)
			vi.advanceTimersByTime(60_000);
			expect(mockSend).toHaveBeenCalledTimes(1);
		});

		it('does not fire when dailyReminderEnabled is false', () => {
			vi.setSystemTime(new Date(2026, 1, 4, 20, 0));
			const settings = makeSettings({
				dailyReminderTime: '20:00',
				dailyReminderEnabled: false,
				...dailyOnly
			});

			startScheduler(settings, false);
			expect(mockSend).not.toHaveBeenCalled();
		});

		it('fires again the next day', () => {
			// Day 1
			vi.setSystemTime(new Date(2026, 1, 4, 20, 0));
			const settings = makeSettings({ dailyReminderTime: '20:00', ...dailyOnly });

			startScheduler(settings, false);
			expect(mockSend).toHaveBeenCalledTimes(1);

			// Day 2 — update system time and tick
			vi.setSystemTime(new Date(2026, 1, 5, 20, 0));
			vi.advanceTimersByTime(60_000);
			expect(mockSend).toHaveBeenCalledTimes(2);
		});
	});

	// ── Weekly review ───────────────────────────────────────────────

	describe('weekly review', () => {
		// Disable daily/monthly to isolate weekly tests
		const weeklyOnly = { dailyReminderEnabled: false, monthlyBudgetSetupEnabled: false };

		it('fires on Monday at 9am', () => {
			// Monday Feb 2, 2026 at 09:00
			vi.setSystemTime(new Date(2026, 1, 2, 9, 0));
			const settings = makeSettings(weeklyOnly);

			startScheduler(settings, false);

			expect(mockSend).toHaveBeenCalledTimes(1);
			expect(mockSend).toHaveBeenCalledWith(
				'Ledger',
				expect.stringContaining('week')
			);
		});

		it('does not fire on Tuesday', () => {
			// Tuesday Feb 3, 2026 at 09:00
			vi.setSystemTime(new Date(2026, 1, 3, 9, 0));
			const settings = makeSettings(weeklyOnly);

			startScheduler(settings, false);

			expect(mockSend).not.toHaveBeenCalled();
		});

		it('does not fire before 9am on Monday', () => {
			// Monday Feb 2, 2026 at 08:59
			vi.setSystemTime(new Date(2026, 1, 2, 8, 59));
			const settings = makeSettings(weeklyOnly);

			startScheduler(settings, false);

			expect(mockSend).not.toHaveBeenCalled();
		});

		it('does not double-fire on subsequent ticks', () => {
			vi.setSystemTime(new Date(2026, 1, 2, 9, 0));
			const settings = makeSettings(weeklyOnly);

			startScheduler(settings, false);
			expect(mockSend).toHaveBeenCalledTimes(1);

			vi.advanceTimersByTime(60_000);
			expect(mockSend).toHaveBeenCalledTimes(1);
		});

		it('does not fire when weeklyReviewEnabled is false', () => {
			vi.setSystemTime(new Date(2026, 1, 2, 9, 0));
			const settings = makeSettings({
				weeklyReviewEnabled: false,
				...weeklyOnly
			});

			startScheduler(settings, false);
			expect(mockSend).not.toHaveBeenCalled();
		});
	});

	// ── Monthly budget setup ────────────────────────────────────────

	describe('monthly budget setup', () => {
		it('fires on the 1st at 9am', () => {
			// Sunday Feb 1, 2026 at 09:00
			vi.setSystemTime(new Date(2026, 1, 1, 9, 0));
			const settings = makeSettings({ dailyReminderEnabled: false });

			startScheduler(settings, false);

			expect(mockSend).toHaveBeenCalledWith(
				'Ledger',
				expect.stringContaining('budget')
			);
		});

		it('does not fire before 9am on the 1st', () => {
			vi.setSystemTime(new Date(2026, 1, 1, 8, 59));
			const settings = makeSettings({
				dailyReminderEnabled: false,
				weeklyReviewEnabled: false
			});

			startScheduler(settings, false);

			expect(mockSend).not.toHaveBeenCalled();
		});

		it('catches up on 2nd+ if not yet fired this month', () => {
			// Feb 3, 2026 at 10:00 — hasn't fired yet for February
			vi.setSystemTime(new Date(2026, 1, 3, 10, 0));
			const settings = makeSettings({
				dailyReminderEnabled: false,
				weeklyReviewEnabled: false
			});

			startScheduler(settings, false);

			expect(mockSend).toHaveBeenCalledWith(
				'Ledger',
				expect.stringContaining('budget')
			);
		});

		it('does not double-fire within same month', () => {
			vi.setSystemTime(new Date(2026, 1, 1, 9, 0));
			const settings = makeSettings({
				dailyReminderEnabled: false,
				weeklyReviewEnabled: false
			});

			startScheduler(settings, false);
			expect(mockSend).toHaveBeenCalledTimes(1);

			// Move to Feb 5 and tick
			vi.setSystemTime(new Date(2026, 1, 5, 9, 0));
			vi.advanceTimersByTime(60_000);
			expect(mockSend).toHaveBeenCalledTimes(1);
		});

		it('does not fire when monthlyBudgetSetupEnabled is false', () => {
			vi.setSystemTime(new Date(2026, 1, 1, 9, 0));
			const settings = makeSettings({
				monthlyBudgetSetupEnabled: false,
				dailyReminderEnabled: false,
				weeklyReviewEnabled: false
			});

			startScheduler(settings, false);
			expect(mockSend).not.toHaveBeenCalled();
		});
	});

	// ── Scheduler lifecycle ─────────────────────────────────────────

	describe('lifecycle', () => {
		// Isolate to daily only for lifecycle tests
		const dailyOnly = { weeklyReviewEnabled: false, monthlyBudgetSetupEnabled: false };

		it('stopScheduler clears the interval', () => {
			vi.setSystemTime(new Date(2026, 1, 4, 19, 0));
			const settings = makeSettings({ dailyReminderTime: '20:00', ...dailyOnly });

			startScheduler(settings, false);
			stopScheduler();

			// Move to 20:00 and tick — should NOT fire because scheduler was stopped
			vi.setSystemTime(new Date(2026, 1, 4, 20, 0));
			vi.advanceTimersByTime(60_000);
			expect(mockSend).not.toHaveBeenCalled();
		});

		it('restarting the scheduler works', () => {
			vi.setSystemTime(new Date(2026, 1, 4, 20, 0));
			const settings = makeSettings({ dailyReminderTime: '20:00', ...dailyOnly });

			startScheduler(settings, false);
			expect(mockSend).toHaveBeenCalledTimes(1);

			stopScheduler();

			// Restart for next day
			mockSend.mockClear();
			vi.setSystemTime(new Date(2026, 1, 5, 20, 0));
			startScheduler(settings, false);
			expect(mockSend).toHaveBeenCalledTimes(1);
		});
	});
});
