import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkAppOpenNotifications } from './app-open-checks';
import type { Settings } from '$lib/db/constants';
import { DEFAULT_SETTINGS } from '$lib/db/constants';

// Mock sendNotification
vi.mock('./tauri-notifications', () => ({
	sendNotification: vi.fn()
}));

import { sendNotification } from './tauri-notifications';

const mockSend = vi.mocked(sendNotification);

// localStorage key constants (must match scheduler.ts / app-open-checks.ts)
const WEEKLY_KEY = 'ledger-notif-weekly-last-fired';
const MONTHLY_KEY = 'ledger-notif-monthly-last-fired';

function makeSettings(overrides: Partial<Settings> = {}): Settings {
	return {
		...DEFAULT_SETTINGS,
		notificationsEnabled: true,
		...overrides
	};
}

describe('App-Open Notification Checks', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mockSend.mockClear();
		localStorage.clear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// ── Weekly ──────────────────────────────────────────────────────

	describe('weekly review on app open', () => {
		it('fires on Monday if not yet fired this week', () => {
			// Monday Feb 2, 2026 at 07:00 (before 9am — scheduler wouldn't fire yet)
			vi.setSystemTime(new Date(2026, 1, 2, 7, 0));
			const settings = makeSettings({ monthlyBudgetSetupEnabled: false });

			checkAppOpenNotifications(settings);

			expect(mockSend).toHaveBeenCalledWith(
				'Ledger',
				expect.stringContaining('week')
			);
		});

		it('does not fire on non-Monday', () => {
			// Tuesday Feb 3, 2026
			vi.setSystemTime(new Date(2026, 1, 3, 10, 0));
			const settings = makeSettings({ monthlyBudgetSetupEnabled: false });

			checkAppOpenNotifications(settings);

			expect(mockSend).not.toHaveBeenCalled();
		});

		it('does not fire if already fired this week', () => {
			// Monday Feb 2, 2026
			vi.setSystemTime(new Date(2026, 1, 2, 10, 0));
			localStorage.setItem(WEEKLY_KEY, '2026-02-02');
			const settings = makeSettings({ monthlyBudgetSetupEnabled: false });

			checkAppOpenNotifications(settings);

			expect(mockSend).not.toHaveBeenCalled();
		});

		it('does not fire when weeklyReviewEnabled is false', () => {
			vi.setSystemTime(new Date(2026, 1, 2, 10, 0));
			const settings = makeSettings({
				weeklyReviewEnabled: false,
				monthlyBudgetSetupEnabled: false
			});

			checkAppOpenNotifications(settings);

			expect(mockSend).not.toHaveBeenCalled();
		});
	});

	// ── Monthly ─────────────────────────────────────────────────────

	describe('monthly budget setup on app open', () => {
		it('fires if this month has not had its notification', () => {
			// Feb 5, 2026
			vi.setSystemTime(new Date(2026, 1, 5, 10, 0));
			const settings = makeSettings({ weeklyReviewEnabled: false });

			checkAppOpenNotifications(settings);

			expect(mockSend).toHaveBeenCalledWith(
				'Ledger',
				expect.stringContaining('budget')
			);
		});

		it('does not fire if already fired this month', () => {
			vi.setSystemTime(new Date(2026, 1, 5, 10, 0));
			localStorage.setItem(MONTHLY_KEY, '2026-02');
			const settings = makeSettings({ weeklyReviewEnabled: false });

			checkAppOpenNotifications(settings);

			expect(mockSend).not.toHaveBeenCalled();
		});

		it('does not fire when monthlyBudgetSetupEnabled is false', () => {
			vi.setSystemTime(new Date(2026, 1, 5, 10, 0));
			const settings = makeSettings({
				monthlyBudgetSetupEnabled: false,
				weeklyReviewEnabled: false
			});

			checkAppOpenNotifications(settings);

			expect(mockSend).not.toHaveBeenCalled();
		});
	});

	// ── Combined ────────────────────────────────────────────────────

	describe('combined checks', () => {
		it('fires both weekly and monthly if both are due', () => {
			// Monday Feb 2, 2026
			vi.setSystemTime(new Date(2026, 1, 2, 10, 0));
			const settings = makeSettings();

			checkAppOpenNotifications(settings);

			const weeklyCall = mockSend.mock.calls.find(
				(c) => typeof c[1] === 'string' && c[1].includes('week')
			);
			const monthlyCall = mockSend.mock.calls.find(
				(c) => typeof c[1] === 'string' && c[1].includes('budget')
			);
			expect(weeklyCall).toBeDefined();
			expect(monthlyCall).toBeDefined();
		});

		it('does not fire daily reminder (daily is schedule-only)', () => {
			// Feb 4, 2026 at 21:00 — past daily reminder time
			vi.setSystemTime(new Date(2026, 1, 4, 21, 0));
			const settings = makeSettings({
				dailyReminderTime: '20:00',
				weeklyReviewEnabled: false,
				monthlyBudgetSetupEnabled: false
			});

			checkAppOpenNotifications(settings);

			expect(mockSend).not.toHaveBeenCalled();
		});
	});
});
