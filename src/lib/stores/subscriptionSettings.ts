/**
 * Subscription Settings Store
 *
 * Manages subscription lifecycle - cancellations, reactivations, and confirmed active subscriptions.
 * Separated from core settings for better maintainability.
 *
 * Supports composite keys (merchant|amount) for per-subscription targeting.
 * Legacy entries without amount act as merchant-wide cancellations.
 */

import { db, type Settings, type CancelledSubscription, DEFAULT_SETTINGS } from '$lib/db';
import { persistData } from '$lib/storage';
import { normalizeMerchant } from '$lib/utils/string-helpers';
import { roundCurrency, currencyEquals } from '$lib/utils/currency';

/**
 * Get current settings (internal helper)
 */
async function getSettings(): Promise<Settings> {
	const s = await db.settings.get(1);
	return s ?? DEFAULT_SETTINGS;
}

/**
 * Check if a CancelledSubscription record matches a merchant + optional amount.
 *
 * Matching rules:
 * - Record has no amount (legacy) → matches ANY subscription from that merchant
 * - Record has amount + query has amount → matches only if amounts are equal (within tolerance)
 * - Record has amount + query has no amount → matches (merchant-wide query)
 */
function cancelledRecordMatches(
	record: CancelledSubscription,
	normalizedMerchant: string,
	amount?: number
): boolean {
	if (record.merchant !== normalizedMerchant) return false;
	// Legacy record (no amount) matches all subscriptions from this merchant
	if (record.amount == null) return true;
	// Targeted record: if caller specifies amount, must match
	if (amount != null) return currencyEquals(record.amount, amount);
	// Targeted record but caller didn't specify amount: match (merchant-wide query)
	return true;
}

/**
 * Cancel a subscription (marks it as no longer active)
 *
 * @param merchant - The merchant name to cancel
 * @param amount - Optional amount for targeted cancellation of a specific subscription
 */
export async function cancelSubscription(merchant: string, amount?: number): Promise<void> {
	const settings = await getSettings();
	const normalized = normalizeMerchant(merchant);
	const cancelled = settings.cancelledSubscriptions ?? [];
	const confirmedActive = settings.confirmedActiveSubscriptions ?? [];

	// Check if already cancelled (exact match)
	if (cancelled.some((c) => cancelledRecordMatches(c, normalized, amount))) {
		return;
	}

	const newCancelled: CancelledSubscription = {
		merchant: normalized,
		cancelledDate: new Date().toISOString(),
		...(amount != null ? { amount: roundCurrency(amount) } : {})
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
 * @param amount - Optional amount to reactivate a specific subscription only
 */
export async function reactivateSubscription(merchant: string, amount?: number): Promise<void> {
	const settings = await getSettings();
	const normalized = normalizeMerchant(merchant);
	const cancelled = settings.cancelledSubscriptions ?? [];

	await db.settings.update(1, {
		cancelledSubscriptions: cancelled.filter(
			(c) => !cancelledRecordMatches(c, normalized, amount)
		)
	});
	await persistData();
}

/**
 * Confirm a subscription is still active (override staleness detection)
 * This is merchant-wide — confirming active overrides staleness for ALL subscriptions from this merchant.
 *
 * @param merchant - The merchant name to confirm as active
 */
export async function confirmSubscriptionActive(merchant: string): Promise<void> {
	const settings = await getSettings();
	const normalized = normalizeMerchant(merchant);
	const confirmedActive = settings.confirmedActiveSubscriptions ?? [];
	const cancelled = settings.cancelledSubscriptions ?? [];

	const updates: Partial<Settings> = {};

	if (!confirmedActive.includes(normalized)) {
		updates.confirmedActiveSubscriptions = [...confirmedActive, normalized];
	}

	// Also clear cancellation if present (confirming active = resubscription)
	if (cancelled.some((c) => c.merchant === normalized)) {
		updates.cancelledSubscriptions = cancelled.filter((c) => c.merchant !== normalized);
	}

	if (Object.keys(updates).length > 0) {
		await db.settings.update(1, updates);
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
 * @param amount - Optional amount for targeted check
 * @returns True if the subscription is cancelled
 */
export async function isSubscriptionCancelled(merchant: string, amount?: number): Promise<boolean> {
	const settings = await getSettings();
	const normalized = normalizeMerchant(merchant);
	const cancelled = settings.cancelledSubscriptions ?? [];
	return cancelled.some((c) => cancelledRecordMatches(c, normalized, amount));
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
