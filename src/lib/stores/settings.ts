import { db, type Settings, DEFAULT_SETTINGS } from '$lib/db';
import { liveQuery } from 'dexie';
import { runMutation } from '$lib/storage/mutation';
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
	return runMutation(['settings'], async () => {
		await db.settings.put({ ...DEFAULT_SETTINGS, ...await db.settings.get(1), ...updates, id: 1 });
	});
}

export async function updatePartnerName(name: string): Promise<void> {
	return runMutation(['settings'], async () => {
		await updateSettings({ partnerName: name });
	});
}

export async function updateDefaultSplit(
	splitType: 'percentage' | 'fixed',
	splitValue: number
): Promise<void> {
	return runMutation(['settings'], async () => {
		await updateSettings({ defaultSplitType: splitType, defaultSplitValue: splitValue });
	});
}

export async function updateTheme(theme: 'light' | 'dark' | 'system'): Promise<void> {
	return runMutation(['settings'], async () => {
		await updateSettings({ theme });
		// Sync to localStorage for flash prevention on page load
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('ledger-theme', theme);
		}
	});
}

export async function dismissRecurring(merchant: string): Promise<void> {
	return runMutation(['settings'], async () => {
		const settings = await getSettings();
		const normalized = normalizeMerchant(merchant);
		const dismissed = settings.dismissedRecurring ?? [];
		if (!dismissed.includes(normalized)) {
			await updateSettings({ dismissedRecurring: [...dismissed, normalized] });
			invalidateRecurringCache();
		}
	});
}

export async function restoreRecurring(merchant: string): Promise<void> {
	return runMutation(['settings'], async () => {
		const settings = await getSettings();
		const normalized = normalizeMerchant(merchant);
		const dismissed = settings.dismissedRecurring ?? [];
		await updateSettings({
			dismissedRecurring: dismissed.filter((m) => m !== normalized)
		});
		invalidateRecurringCache();
	});
}

export async function getDismissedRecurring(): Promise<string[]> {
	const settings = await getSettings();
	return settings.dismissedRecurring ?? [];
}

export async function setFixedRecurringAmount(merchant: string, amount: number): Promise<void> {
	return runMutation(['settings'], async () => {
		const settings = await getSettings();
		const normalized = normalizeMerchant(merchant);
		const existing = settings.fixedRecurringAmounts ?? [];

		const filtered = existing.filter((f) => f.merchant !== normalized);

		await updateSettings({
			fixedRecurringAmounts: [...filtered, { merchant: normalized, amount }]
		});
		invalidateRecurringCache();
	});
}

export async function removeFixedRecurringAmount(merchant: string): Promise<void> {
	return runMutation(['settings'], async () => {
		const settings = await getSettings();
		const normalized = normalizeMerchant(merchant);
		const existing = settings.fixedRecurringAmounts ?? [];

		await updateSettings({
			fixedRecurringAmounts: existing.filter((f) => f.merchant !== normalized)
		});
		invalidateRecurringCache();
	});
}

export async function updateNotifications(enabled: boolean): Promise<void> {
	return runMutation(['settings'], async () => {
		await updateSettings({ notificationsEnabled: enabled });
	});
}

export async function updateICloudBackup(enabled: boolean): Promise<void> {
	return runMutation(['settings'], async () => {
		await updateSettings({ iCloudBackupEnabled: enabled });
	});
}

export async function dismissRecurringSuggestionsForMonth(month: string): Promise<void> {
	return runMutation(['settings'], async () => {
		await updateSettings({ lastAutoSuggestedMonth: month });
	});
}
