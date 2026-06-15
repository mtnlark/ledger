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

export const settings = liveQuery(() => db.settings.get(1));

export async function getSettings(): Promise<Settings> {
	const s = await db.settings.get(1);
	return s ?? DEFAULT_SETTINGS;
}

export async function updateSettings(updates: Partial<Omit<Settings, 'id'>>): Promise<void> {
	await db.settings.update(1, updates);
	await persistData();
}

export async function updatePartnerName(name: string): Promise<void> {
	await db.settings.update(1, { partnerName: name });
	await persistData();
}

export async function updateDefaultSplit(
	splitType: 'percentage' | 'fixed',
	splitValue: number
): Promise<void> {
	await db.settings.update(1, { defaultSplitType: splitType, defaultSplitValue: splitValue });
	await persistData();
}

export async function updateTheme(theme: 'light' | 'dark' | 'system'): Promise<void> {
	await db.settings.update(1, { theme });
	// Sync to localStorage for flash prevention on page load
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem('ledger-theme', theme);
	}
	await persistData();
}

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

export async function getDismissedRecurring(): Promise<string[]> {
	const settings = await getSettings();
	return settings.dismissedRecurring ?? [];
}

export async function setFixedRecurringAmount(merchant: string, amount: number): Promise<void> {
	const settings = await getSettings();
	const normalized = normalizeMerchant(merchant);
	const existing = settings.fixedRecurringAmounts ?? [];

	const filtered = existing.filter((f) => f.merchant !== normalized);

	await db.settings.update(1, {
		fixedRecurringAmounts: [...filtered, { merchant: normalized, amount }]
	});
	invalidateRecurringCache();
	await persistData();
}

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

export async function updateNotifications(enabled: boolean): Promise<void> {
	await db.settings.update(1, { notificationsEnabled: enabled });
	await persistData();
}

export async function updateICloudBackup(enabled: boolean): Promise<void> {
	await db.settings.update(1, { iCloudBackupEnabled: enabled });
	await persistData();
}

export async function dismissRecurringSuggestionsForMonth(month: string): Promise<void> {
	await db.settings.update(1, { lastAutoSuggestedMonth: month });
	await persistData();
}
