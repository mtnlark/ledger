/**
 * Notification system public API.
 *
 * Call initNotifications() from the app layout to start the scheduler
 * and run one-shot app-open checks. Call cleanupNotifications() on teardown.
 */

import type { Settings } from '$lib/db/constants';
import { startScheduler, stopScheduler } from './scheduler';
import { checkAppOpenNotifications } from './app-open-checks';
import { isNotificationPermissionGranted, registerNotificationClickHandler } from './tauri-notifications';

export { requestNotificationPermission, isNotificationPermissionGranted } from './tauri-notifications';

// Track the click handler unlisten function so we only register once
let unlistenClickHandler: (() => void) | null = null;

/**
 * Initialize the notification system.
 *
 * - Verifies OS permission is still granted (silently returns false if revoked)
 * - Starts the scheduler with the current settings
 * - Runs one-shot app-open catch-up checks
 *
 * @returns true if notifications were initialized, false if permission was revoked
 */
export async function initNotifications(
	settings: Settings,
	hasTodayTransactions: boolean
): Promise<boolean> {
	// If OS permission was revoked, don't start anything
	const granted = await isNotificationPermissionGranted();
	if (!granted) {
		stopScheduler();
		return false;
	}

	startScheduler(settings, hasTodayTransactions);
	checkAppOpenNotifications(settings);

	// Register click handler once (brings app to front when notification is clicked)
	if (!unlistenClickHandler) {
		unlistenClickHandler = await registerNotificationClickHandler();
	}

	return true;
}

/**
 * Stop the notification scheduler. Safe to call multiple times.
 */
export function cleanupNotifications(): void {
	stopScheduler();
	if (unlistenClickHandler) {
		unlistenClickHandler();
		unlistenClickHandler = null;
	}
}
