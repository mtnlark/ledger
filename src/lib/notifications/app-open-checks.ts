/**
 * One-shot notification checks that run on app initialization.
 *
 * Handles catch-up for weekly and monthly notifications when the app
 * wasn't running at the scheduled time. Daily is intentionally excluded
 * (it only makes sense as a timed reminder, not a catch-up).
 *
 * Uses the same localStorage keys as the scheduler to prevent double-firing.
 */

import { config } from '$lib/config';
import type { Settings } from '$lib/db/constants';
import { sendNotification } from './tauri-notifications';

// Must match scheduler.ts
const WEEKLY_KEY = 'ledger-notif-weekly-last-fired';
const MONTHLY_KEY = 'ledger-notif-monthly-last-fired';

function toDateString(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

function toMonthString(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	return `${y}-${m}`;
}

/**
 * Run one-shot app-open notification checks.
 *
 * Call this once during app initialization. It fires any weekly/monthly
 * notifications that are due but haven't fired yet (e.g., the app wasn't
 * open at the scheduled time).
 */
export function checkAppOpenNotifications(settings: Settings): void {
	const now = new Date();

	// Weekly: fire on Monday if not yet fired this week
	if (settings.weeklyReviewEnabled) {
		if (now.getDay() === config.notifications.weeklyReviewDay) {
			const today = toDateString(now);
			const lastFired = localStorage.getItem(WEEKLY_KEY);
			if (lastFired !== today) {
				localStorage.setItem(WEEKLY_KEY, today);
				sendNotification('Ledger', 'Time for your weekly spending review.');
			}
		}
	}

	// Monthly: fire if this month hasn't had its notification yet
	if (settings.monthlyBudgetSetupEnabled) {
		const thisMonth = toMonthString(now);
		const lastFired = localStorage.getItem(MONTHLY_KEY);
		if (lastFired !== thisMonth) {
			localStorage.setItem(MONTHLY_KEY, thisMonth);
			sendNotification('Ledger', "New month! Time to set up your budget.");
		}
	}
}
