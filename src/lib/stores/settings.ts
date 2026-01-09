import { db, type Settings, type CancelledSubscription, DEFAULT_SETTINGS } from '$lib/db';
import { liveQuery } from 'dexie';
import { persistData } from '$lib/storage';
import { invalidateRecurringCache } from './recurring';
import { normalizeMerchant } from '$lib/utils/string-helpers';

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

// --- Subscription Lifecycle Management ---

// Cancel a subscription (marks it as no longer active)
export async function cancelSubscription(merchant: string): Promise<void> {
	const settings = await getSettings();
	const normalized = normalizeMerchant(merchant);
	const cancelled = settings.cancelledSubscriptions ?? [];
	const confirmedActive = settings.confirmedActiveSubscriptions ?? [];

	// Check if already cancelled
	if (cancelled.some((c) => c.merchant === normalized)) {
		return;
	}

	const newCancelled: CancelledSubscription = {
		merchant: normalized,
		cancelledDate: new Date().toISOString()
	};

	await db.settings.update(1, {
		cancelledSubscriptions: [...cancelled, newCancelled],
		// Remove from confirmed active if it was there
		confirmedActiveSubscriptions: confirmedActive.filter((m) => m !== normalized)
	});
	await persistData();
}

// Reactivate a cancelled subscription
export async function reactivateSubscription(merchant: string): Promise<void> {
	const settings = await getSettings();
	const normalized = normalizeMerchant(merchant);
	const cancelled = settings.cancelledSubscriptions ?? [];

	await db.settings.update(1, {
		cancelledSubscriptions: cancelled.filter((c) => c.merchant !== normalized)
	});
	await persistData();
}

// Confirm a subscription is still active (override staleness detection)
export async function confirmSubscriptionActive(merchant: string): Promise<void> {
	const settings = await getSettings();
	const normalized = normalizeMerchant(merchant);
	const confirmedActive = settings.confirmedActiveSubscriptions ?? [];

	if (!confirmedActive.includes(normalized)) {
		await db.settings.update(1, {
			confirmedActiveSubscriptions: [...confirmedActive, normalized]
		});
		await persistData();
	}
}

// Get cancelled subscriptions
export async function getCancelledSubscriptions(): Promise<CancelledSubscription[]> {
	const settings = await getSettings();
	return settings.cancelledSubscriptions ?? [];
}

// Get confirmed active subscriptions (overrides staleness)
export async function getConfirmedActiveSubscriptions(): Promise<string[]> {
	const settings = await getSettings();
	return settings.confirmedActiveSubscriptions ?? [];
}

// Check if a subscription is cancelled
export async function isSubscriptionCancelled(merchant: string): Promise<boolean> {
	const settings = await getSettings();
	const normalized = normalizeMerchant(merchant);
	const cancelled = settings.cancelledSubscriptions ?? [];
	return cancelled.some((c) => c.merchant === normalized);
}

// Check if a subscription is confirmed active (staleness override)
export async function isSubscriptionConfirmedActive(merchant: string): Promise<boolean> {
	const settings = await getSettings();
	const normalized = normalizeMerchant(merchant);
	const confirmedActive = settings.confirmedActiveSubscriptions ?? [];
	return confirmedActive.includes(normalized);
}
