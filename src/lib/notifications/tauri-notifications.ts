/**
 * Thin wrapper around Tauri's notification plugin.
 *
 * Uses isTauri() guards and dynamic imports so the rest of the notification
 * system works in test/non-Tauri environments (all calls no-op).
 */

function isTauri(): boolean {
	return typeof window !== 'undefined' && '__TAURI__' in window;
}

/**
 * Check if the OS has granted notification permission.
 */
export async function isNotificationPermissionGranted(): Promise<boolean> {
	if (!isTauri()) return false;

	try {
		const { isPermissionGranted } = await import('@tauri-apps/plugin-notification');
		return await isPermissionGranted();
	} catch {
		return false;
	}
}

/**
 * Request notification permission from the OS.
 * Returns 'granted', 'denied', or 'default'.
 */
export async function requestNotificationPermission(): Promise<'granted' | 'denied' | 'default'> {
	if (!isTauri()) return 'denied';

	try {
		const { requestPermission } = await import('@tauri-apps/plugin-notification');
		return await requestPermission();
	} catch {
		return 'denied';
	}
}

/**
 * Send a native notification. No-ops if not in Tauri or permission not granted.
 */
export async function sendNotification(title: string, body: string): Promise<void> {
	if (!isTauri()) return;

	try {
		const granted = await isNotificationPermissionGranted();
		if (!granted) return;

		const { sendNotification: tauriSend } = await import('@tauri-apps/plugin-notification');
		tauriSend({ title, body });
	} catch (error) {
		console.error('Failed to send notification:', error);
	}
}

/**
 * Register a listener for notification click events.
 *
 * NOTE: The Tauri notification plugin's `onAction` API is mobile-only.
 * On macOS, notification clicks are handled at the Rust level via RunEvent::Resumed,
 * which brings the window to front when the app is activated (see src-tauri/src/lib.rs).
 *
 * This function is kept as a no-op for API compatibility, but the actual click
 * handling happens in the Rust backend.
 */
export async function registerNotificationClickHandler(): Promise<(() => void) | null> {
	// On desktop (macOS), notification clicks activate the app which triggers
	// RunEvent::Resumed in the Rust backend, showing and focusing the window.
	// The onAction listener below only works on mobile platforms.
	if (!isTauri()) return null;

	try {
		const { onAction } = await import('@tauri-apps/plugin-notification');
		const { getCurrentWindow } = await import('@tauri-apps/api/window');

		// This listener fires on mobile when notification actions are clicked.
		// On desktop, it won't fire - the Rust backend handles window activation.
		const unlisten = await onAction(() => {
			const appWindow = getCurrentWindow();
			appWindow.show();
			appWindow.setFocus();
		});

		return () => unlisten();
	} catch (error) {
		console.error('Failed to register notification click handler:', error);
		return null;
	}
}
