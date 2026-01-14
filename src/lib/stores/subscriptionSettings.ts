/**
 * Subscription Settings Store
 *
 * Manages subscription lifecycle - cancellations, reactivations, and confirmed active subscriptions.
 * Separated from core settings for better maintainability.
 */

import { db, type Settings, type CancelledSubscription, DEFAULT_SETTINGS } from '$lib/db';
import { persistData } from '$lib/storage';
import { normalizeMerchant } from '$lib/utils/string-helpers';

/**
 * Get current settings (internal helper)
 */
async function getSettings(): Promise<Settings> {
	const s = await db.settings.get(1);
	return s ?? DEFAULT_SETTINGS;
}

/**
 * Cancel a subscription (marks it as no longer active)
 *
 * @param merchant - The merchant name to cancel
 */
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

/**
 * Reactivate a cancelled subscription
 *
 * @param merchant - The merchant name to reactivate
 */
export async function reactivateSubscription(merchant: string): Promise<void> {
	const settings = await getSettings();
	const normalized = normalizeMerchant(merchant);
	const cancelled = settings.cancelledSubscriptions ?? [];

	await db.settings.update(1, {
		cancelledSubscriptions: cancelled.filter((c) => c.merchant !== normalized)
	});
	await persistData();
}

/**
 * Confirm a subscription is still active (override staleness detection)
 *
 * @param merchant - The merchant name to confirm as active
 */
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

/**
 * Get all cancelled subscriptions
 *
 * @returns Array of cancelled subscription records with dates
 */
export async function getCancelledSubscriptions(): Promise<CancelledSubscription[]> {
	const settings = await getSettings();
	return settings.cancelledSubscriptions ?? [];
}

/**
 * Get confirmed active subscriptions (overrides staleness detection)
 *
 * @returns Array of normalized merchant names
 */
export async function getConfirmedActiveSubscriptions(): Promise<string[]> {
	const settings = await getSettings();
	return settings.confirmedActiveSubscriptions ?? [];
}

/**
 * Check if a subscription is cancelled
 *
 * @param merchant - The merchant name to check
 * @returns True if the subscription is cancelled
 */
export async function isSubscriptionCancelled(merchant: string): Promise<boolean> {
	const settings = await getSettings();
	const normalized = normalizeMerchant(merchant);
	const cancelled = settings.cancelledSubscriptions ?? [];
	return cancelled.some((c) => c.merchant === normalized);
}

/**
 * Check if a subscription is confirmed active (staleness override)
 *
 * @param merchant - The merchant name to check
 * @returns True if the subscription is confirmed as still active
 */
export async function isSubscriptionConfirmedActive(merchant: string): Promise<boolean> {
	const settings = await getSettings();
	const normalized = normalizeMerchant(merchant);
	const confirmedActive = settings.confirmedActiveSubscriptions ?? [];
	return confirmedActive.includes(normalized);
}
