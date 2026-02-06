import { describe, it, expect } from 'vitest';
import {
	normalizeMerchant,
	subscriptionKey,
	merchantFromSubscriptionKey,
	findSupersededSubscriptionKeys
} from '$lib/utils/string-helpers';

describe('normalizeMerchant', () => {
	it('lowercases and trims', () => {
		expect(normalizeMerchant('  Netflix  ')).toBe('netflix');
	});
});

describe('subscriptionKey', () => {
	it('creates merchant|amount composite key', () => {
		expect(subscriptionKey('Apple', 2.99)).toBe('apple|2.99');
	});

	it('normalizes merchant name', () => {
		expect(subscriptionKey('  APPLE  ', 2.99)).toBe('apple|2.99');
	});

	it('rounds amount to 2 decimal places', () => {
		expect(subscriptionKey('Apple', 2.999)).toBe('apple|3');
		expect(subscriptionKey('Apple', 15.994)).toBe('apple|15.99');
	});

	it('different amounts produce different keys', () => {
		const key1 = subscriptionKey('Apple', 2.99);
		const key2 = subscriptionKey('Apple', 2.16);
		expect(key1).not.toBe(key2);
	});

	it('same merchant and amount produce same key regardless of casing', () => {
		expect(subscriptionKey('Apple', 2.99)).toBe(subscriptionKey('apple', 2.99));
	});
});

describe('merchantFromSubscriptionKey', () => {
	it('extracts merchant from composite key', () => {
		expect(merchantFromSubscriptionKey('apple|2.99')).toBe('apple');
	});

	it('handles merchant names without pipe (legacy keys)', () => {
		expect(merchantFromSubscriptionKey('netflix')).toBe('netflix');
	});

	it('handles merchant names that could contain numbers', () => {
		expect(merchantFromSubscriptionKey('7-eleven|5.99')).toBe('7-eleven');
	});
});

describe('findSupersededSubscriptionKeys', () => {
	it('marks older amount as superseded when price changed (sequential)', () => {
		// Anthropic: $21.68/mo through Sep, then $108.42/mo from Oct
		const entries = [
			{ key: 'anthropic|21.68', merchant: 'Anthropic', amount: 21.68, latestDate: new Date('2025-09-15') },
			{ key: 'anthropic|108.42', merchant: 'Anthropic', amount: 108.42, latestDate: new Date('2026-01-15') }
		];
		const allTxns = [
			{ merchant: 'Anthropic', amount: 21.68, date: new Date('2025-07-15') },
			{ merchant: 'Anthropic', amount: 21.68, date: new Date('2025-08-15') },
			{ merchant: 'Anthropic', amount: 21.68, date: new Date('2025-09-15') },
			{ merchant: 'Anthropic', amount: 108.42, date: new Date('2025-10-15') },
			{ merchant: 'Anthropic', amount: 108.42, date: new Date('2025-11-15') },
			{ merchant: 'Anthropic', amount: 108.42, date: new Date('2026-01-15') }
		];

		const superseded = findSupersededSubscriptionKeys(entries, allTxns);
		expect(superseded.has('anthropic|21.68')).toBe(true);
		expect(superseded.has('anthropic|108.42')).toBe(false);
	});

	it('keeps both when subscriptions are concurrent (different products)', () => {
		// Apple iCloud $2.99 and Apple Music $2.16 — both charged every month
		const entries = [
			{ key: 'apple|2.99', merchant: 'Apple', amount: 2.99, latestDate: new Date('2026-01-15') },
			{ key: 'apple|2.16', merchant: 'Apple', amount: 2.16, latestDate: new Date('2026-01-10') }
		];
		const allTxns = [
			{ merchant: 'Apple', amount: 2.99, date: new Date('2025-11-15') },
			{ merchant: 'Apple', amount: 2.16, date: new Date('2025-11-10') },
			{ merchant: 'Apple', amount: 2.99, date: new Date('2025-12-15') },
			{ merchant: 'Apple', amount: 2.16, date: new Date('2025-12-10') },
			{ merchant: 'Apple', amount: 2.99, date: new Date('2026-01-15') },
			{ merchant: 'Apple', amount: 2.16, date: new Date('2026-01-10') }
		];

		const superseded = findSupersededSubscriptionKeys(entries, allTxns);
		expect(superseded.size).toBe(0);
	});

	it('does nothing for single-amount merchants', () => {
		const entries = [
			{ key: 'netflix|15.99', merchant: 'Netflix', amount: 15.99, latestDate: new Date('2026-01-15') }
		];
		const allTxns = [
			{ merchant: 'Netflix', amount: 15.99, date: new Date('2026-01-15') }
		];

		const superseded = findSupersededSubscriptionKeys(entries, allTxns);
		expect(superseded.size).toBe(0);
	});

	it('handles chain of price increases (3+ amounts)', () => {
		// Spotify: $9.99 → $14.99 → $18.99
		const entries = [
			{ key: 'spotify|9.99', merchant: 'Spotify', amount: 9.99, latestDate: new Date('2025-03-15') },
			{ key: 'spotify|14.99', merchant: 'Spotify', amount: 14.99, latestDate: new Date('2025-09-15') },
			{ key: 'spotify|18.99', merchant: 'Spotify', amount: 18.99, latestDate: new Date('2026-01-15') }
		];
		const allTxns = [
			{ merchant: 'Spotify', amount: 9.99, date: new Date('2025-01-15') },
			{ merchant: 'Spotify', amount: 9.99, date: new Date('2025-03-15') },
			{ merchant: 'Spotify', amount: 14.99, date: new Date('2025-04-15') },
			{ merchant: 'Spotify', amount: 14.99, date: new Date('2025-09-15') },
			{ merchant: 'Spotify', amount: 18.99, date: new Date('2025-10-15') },
			{ merchant: 'Spotify', amount: 18.99, date: new Date('2026-01-15') }
		];

		const superseded = findSupersededSubscriptionKeys(entries, allTxns);
		expect(superseded.has('spotify|9.99')).toBe(true);
		expect(superseded.has('spotify|14.99')).toBe(true);
		expect(superseded.has('spotify|18.99')).toBe(false);
	});

	it('keeps concurrent subscription even when another amount is superseded', () => {
		// Merchant has: $10 (ongoing concurrent), $15 (old, superseded), $20 (current)
		const entries = [
			{ key: 'svc|10', merchant: 'Svc', amount: 10, latestDate: new Date('2026-01-15') },
			{ key: 'svc|15', merchant: 'Svc', amount: 15, latestDate: new Date('2025-06-15') },
			{ key: 'svc|20', merchant: 'Svc', amount: 20, latestDate: new Date('2026-01-15') }
		];
		const allTxns = [
			// $10 concurrent — charges every month including after $20 started
			{ merchant: 'Svc', amount: 10, date: new Date('2025-01-15') },
			{ merchant: 'Svc', amount: 10, date: new Date('2025-07-15') },
			{ merchant: 'Svc', amount: 10, date: new Date('2026-01-15') },
			// $15 was a temporary thing, stopped before $20 started
			{ merchant: 'Svc', amount: 15, date: new Date('2025-04-15') },
			{ merchant: 'Svc', amount: 15, date: new Date('2025-06-15') },
			// $20 started in July
			{ merchant: 'Svc', amount: 20, date: new Date('2025-07-15') },
			{ merchant: 'Svc', amount: 20, date: new Date('2026-01-15') }
		];

		const superseded = findSupersededSubscriptionKeys(entries, allTxns);
		expect(superseded.has('svc|10')).toBe(false); // concurrent, still active
		expect(superseded.has('svc|15')).toBe(true);  // superseded by $20
		expect(superseded.has('svc|20')).toBe(false);  // current
	});

	it('does not cross merchants', () => {
		const entries = [
			{ key: 'netflix|15.99', merchant: 'Netflix', amount: 15.99, latestDate: new Date('2026-01-15') },
			{ key: 'spotify|9.99', merchant: 'Spotify', amount: 9.99, latestDate: new Date('2025-06-15') }
		];
		const allTxns = [
			{ merchant: 'Netflix', amount: 15.99, date: new Date('2026-01-15') },
			{ merchant: 'Spotify', amount: 9.99, date: new Date('2025-06-15') }
		];

		const superseded = findSupersededSubscriptionKeys(entries, allTxns);
		expect(superseded.size).toBe(0);
	});
});
