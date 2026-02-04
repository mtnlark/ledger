/**
 * Timer-based notification scheduler.
 *
 * Ticks every 60 seconds and checks whether daily, weekly, or monthly
 * notifications should fire. Uses localStorage for "last fired" tracking
 * (ephemeral scheduling state, not user preferences — avoids persistData writes).
 */

import { config } from '$lib/config';
import type { Settings } from '$lib/db/constants';
import { sendNotification } from './tauri-notifications';

// localStorage keys for last-fired tracking
const DAILY_KEY = 'ledger-notif-daily-last-fired';
const WEEKLY_KEY = 'ledger-notif-weekly-last-fired';
const MONTHLY_KEY = 'ledger-notif-monthly-last-fired';

let intervalId: ReturnType<typeof setInterval> | null = null;

// Current state captured from the most recent startScheduler call
let currentSettings: Settings | null = null;
let currentHasTodayTransactions = false;

/**
 * Format a date as "YYYY-MM-DD".
 */
function toDateString(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/**
 * Format a date as "YYYY-MM".
 */
function toMonthString(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	return `${y}-${m}`;
}

/**
 * Parse an "HH:MM" string into hours and minutes.
 */
function parseTime(time: string): { hours: number; minutes: number } {
	const [h, m] = time.split(':').map(Number);
	return { hours: h, minutes: m };
}

/**
 * Check and possibly fire the daily reminder.
 */
function tickDaily(now: Date): void {
	if (!currentSettings?.dailyReminderEnabled) return;

	const today = toDateString(now);
	const lastFired = localStorage.getItem(DAILY_KEY);
	if (lastFired === today) return;

	const { hours, minutes } = parseTime(currentSettings.dailyReminderTime);
	if (now.getHours() < hours || (now.getHours() === hours && now.getMinutes() < minutes)) {
		return;
	}

	// Mark as fired first (even if we skip sending — the day is "handled")
	localStorage.setItem(DAILY_KEY, today);

	if (currentHasTodayTransactions) return;

	sendNotification('Ledger', "Don't forget to log today's expenses!");
}

/**
 * Check and possibly fire the weekly review prompt.
 */
function tickWeekly(now: Date): void {
	if (!currentSettings?.weeklyReviewEnabled) return;

	if (now.getDay() !== config.notifications.weeklyReviewDay) return;

	const today = toDateString(now);
	const lastFired = localStorage.getItem(WEEKLY_KEY);
	if (lastFired === today) return;

	const { hours, minutes } = parseTime(config.notifications.defaultWeeklyTime);
	if (now.getHours() < hours || (now.getHours() === hours && now.getMinutes() < minutes)) {
		return;
	}

	localStorage.setItem(WEEKLY_KEY, today);
	sendNotification('Ledger', 'Time for your weekly spending review.');
}

/**
 * Check and possibly fire the monthly budget setup prompt.
 */
function tickMonthly(now: Date): void {
	if (!currentSettings?.monthlyBudgetSetupEnabled) return;

	const thisMonth = toMonthString(now);
	const lastFired = localStorage.getItem(MONTHLY_KEY);
	if (lastFired === thisMonth) return;

	const dayOfMonth = now.getDate();

	if (dayOfMonth === 1) {
		const { hours, minutes } = parseTime(config.notifications.defaultMonthlyTime);
		if (now.getHours() < hours || (now.getHours() === hours && now.getMinutes() < minutes)) {
			return;
		}
	}
	// dayOfMonth >= 2: catch-up — fire immediately

	localStorage.setItem(MONTHLY_KEY, thisMonth);
	sendNotification('Ledger', "New month! Time to set up your budget.");
}

/**
 * Run one tick of all notification checks.
 */
function tick(): void {
	if (!currentSettings) return;
	const now = new Date();
	tickDaily(now);
	tickWeekly(now);
	tickMonthly(now);
}

/**
 * Start the notification scheduler.
 *
 * Runs an immediate tick, then sets up a recurring interval.
 * Calling this again will stop the previous scheduler first.
 */
export function startScheduler(settings: Settings, hasTodayTransactions: boolean): void {
	stopScheduler();
	currentSettings = settings;
	currentHasTodayTransactions = hasTodayTransactions;

	// Immediate tick
	tick();

	// Recurring tick
	intervalId = setInterval(tick, config.notifications.checkIntervalMs);
}

/**
 * Stop the notification scheduler.
 */
export function stopScheduler(): void {
	if (intervalId !== null) {
		clearInterval(intervalId);
		intervalId = null;
	}
	currentSettings = null;
}

/**
 * Reset scheduler state for testing. Not for production use.
 */
export function _resetForTesting(): void {
	stopScheduler();
	currentHasTodayTransactions = false;
}
