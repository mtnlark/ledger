import { db, type Settings, DEFAULT_SETTINGS } from '$lib/db';
import { liveQuery } from 'dexie';
import { persistData } from '$lib/storage';
import { invalidateRecurringCache } from './recurringCache';
import { normalizeMerchant } from '$lib/utils/string-helpers';

// Re-export subscription functions for backward compatibility
export {
	cancelSubscription,
	reactivateSubscription,
	confirmSubscriptionActive,
	getCancelledSubscriptions,
	getConfirmedActiveSubscriptions,
	isSubscriptionCancelled,
	isSubscriptionConfirmedActive
} from './subscriptionSettings';

// Reactive settings
export const settings = liveQuery(() => db.settings.get(1));

// Get current settings
export async function getSettings(): Promise<Settings> {
	const s = await db.settings.get(1);
	return s ?? DEFAULT_SETTINGS;
}

// Update settings
export async function updateSettings(updates: Partial<Omit<Settings, 'id'>>): Promise<void> {
	await db.settings.update(1, updates);
	await persistData();
}

// Update partner name
export async function updatePartnerName(name: string): Promise<void> {
	await db.settings.update(1, { partnerName: name });
	await persistData();
}

// Update default split settings
export async function updateDefaultSplit(
	splitType: 'percentage' | 'fixed',
	splitValue: number
): Promise<void> {
	await db.settings.update(1, { defaultSplitType: splitType, defaultSplitValue: splitValue });
	await persistData();
}

// Update theme
export async function updateTheme(theme: 'light' | 'dark' | 'system'): Promise<void> {
	await db.settings.update(1, { theme });
	// Sync to localStorage for flash prevention on page load
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem('ledger-theme', theme);
	}
	await persistData();
}

// Dismiss a recurring expense (hide from detection)
export async function dismissRecurring(merchant: string): Promise<void> {
	const settings = await getSettings();
	const normalized = normalizeMerchant(merchant);
	const dismissed = settings.dismissedRecurring ?? [];
	if (!dismissed.includes(normalized)) {
		await db.settings.update(1, { dismissedRecurring: [...dismissed, normalized] });
		invalidateRecurringCache();
		await persistData();
	}
}

// Restore a dismissed recurring expense
export async function restoreRecurring(merchant: string): Promise<void> {
	const settings = await getSettings();
	const normalized = normalizeMerchant(merchant);
	const dismissed = settings.dismissedRecurring ?? [];
	await db.settings.update(1, {
		dismissedRecurring: dismissed.filter((m) => m !== normalized)
	});
	invalidateRecurringCache();
	await persistData();
}

// Get list of dismissed recurring merchants
export async function getDismissedRecurring(): Promise<string[]> {
	const settings = await getSettings();
	return settings.dismissedRecurring ?? [];
}

// Set a fixed amount for a detected recurring expense
export async function setFixedRecurringAmount(merchant: string, amount: number): Promise<void> {
	const settings = await getSettings();
	const normalized = normalizeMerchant(merchant);
	const existing = settings.fixedRecurringAmounts ?? [];

	// Remove any existing entry for this merchant
	const filtered = existing.filter((f) => f.merchant !== normalized);

	// Add the new fixed amount
	await db.settings.update(1, {
		fixedRecurringAmounts: [...filtered, { merchant: normalized, amount }]
	});
	invalidateRecurringCache();
	await persistData();
}

// Remove a fixed amount override (revert to auto-detected)
export async function removeFixedRecurringAmount(merchant: string): Promise<void> {
	const settings = await getSettings();
	const normalized = normalizeMerchant(merchant);
	const existing = settings.fixedRecurringAmounts ?? [];

	await db.settings.update(1, {
		fixedRecurringAmounts: existing.filter((f) => f.merchant !== normalized)
	});
	invalidateRecurringCache();
	await persistData();
}

// Get fixed amount for a merchant (if set)
export async function getFixedRecurringAmount(merchant: string): Promise<number | null> {
	const settings = await getSettings();
	const normalized = normalizeMerchant(merchant);
	const found = (settings.fixedRecurringAmounts ?? []).find((f) => f.merchant === normalized);
	return found?.amount ?? null;
}

// Get all fixed recurring amounts
export async function getFixedRecurringAmounts(): Promise<Map<string, number>> {
	const settings = await getSettings();
	const map = new Map<string, number>();
	for (const { merchant, amount } of settings.fixedRecurringAmounts ?? []) {
		map.set(merchant, amount);
	}
	return map;
}

// Update notification master toggle
export async function updateNotifications(enabled: boolean): Promise<void> {
	await db.settings.update(1, { notificationsEnabled: enabled });
	await persistData();
}

// Update iCloud backup setting
export async function updateICloudBackup(enabled: boolean): Promise<void> {
	await db.settings.update(1, { iCloudBackupEnabled: enabled });
	await persistData();
}

// Dismiss recurring suggestions for the current month
export async function dismissRecurringSuggestionsForMonth(month: string): Promise<void> {
	await db.settings.update(1, { lastAutoSuggestedMonth: month });
	await persistData();
}

// Reset recurring suggestions dismissal (for testing/debugging)
export async function resetRecurringSuggestionsDismissal(): Promise<void> {
	await db.settings.update(1, { lastAutoSuggestedMonth: undefined });
	await persistData();
}
