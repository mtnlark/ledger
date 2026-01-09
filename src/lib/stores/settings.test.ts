import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, initializeDatabase, DEFAULT_SETTINGS } from '$lib/db';
import {
	getSettings,
	updateSettings,
	updatePartnerName,
	updateDefaultSplit,
	updateTheme,
	dismissRecurring,
	restoreRecurring,
	getDismissedRecurring
} from './settings';

describe('Settings Operations', () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
		await initializeDatabase();
	});

	afterEach(async () => {
		await db.delete();
	});

	describe('getSettings', () => {
		it('returns default settings after initialization', async () => {
			const settings = await getSettings();

			expect(settings.partnerName).toBe('Partner');
			expect(settings.defaultSplitType).toBe('percentage');
			expect(settings.defaultSplitValue).toBe(0.5);
			expect(settings.currency).toBe('USD');
			expect(settings.theme).toBe('system');
		});

		it('returns DEFAULT_SETTINGS if settings missing', async () => {
			// Delete all settings
			await db.settings.clear();

			const settings = await getSettings();
			expect(settings).toEqual(DEFAULT_SETTINGS);
		});
	});

	describe('updateSettings', () => {
		it('updates single setting', async () => {
			await updateSettings({ partnerName: 'John' });

			const settings = await getSettings();
			expect(settings.partnerName).toBe('John');
		});

		it('updates multiple settings at once', async () => {
			await updateSettings({
				partnerName: 'Jane',
				currency: 'EUR',
				theme: 'dark'
			});

			const settings = await getSettings();
			expect(settings.partnerName).toBe('Jane');
			expect(settings.currency).toBe('EUR');
			expect(settings.theme).toBe('dark');
		});

		it('preserves unmodified settings', async () => {
			await updateSettings({ partnerName: 'Updated' });

			const settings = await getSettings();
			expect(settings.partnerName).toBe('Updated');
			expect(settings.defaultSplitType).toBe('percentage'); // Unchanged
			expect(settings.defaultSplitValue).toBe(0.5); // Unchanged
		});
	});

	describe('updatePartnerName', () => {
		it('updates partner name', async () => {
			await updatePartnerName('Alice');

			const settings = await getSettings();
			expect(settings.partnerName).toBe('Alice');
		});

		it('handles special characters', async () => {
			await updatePartnerName("O'Brien");

			const settings = await getSettings();
			expect(settings.partnerName).toBe("O'Brien");
		});

		it('handles empty string', async () => {
			await updatePartnerName('');

			const settings = await getSettings();
			expect(settings.partnerName).toBe('');
		});
	});

	describe('updateDefaultSplit', () => {
		it('updates to percentage split', async () => {
			await updateDefaultSplit('percentage', 0.6);

			const settings = await getSettings();
			expect(settings.defaultSplitType).toBe('percentage');
			expect(settings.defaultSplitValue).toBe(0.6);
		});

		it('updates to fixed split', async () => {
			await updateDefaultSplit('fixed', 25);

			const settings = await getSettings();
			expect(settings.defaultSplitType).toBe('fixed');
			expect(settings.defaultSplitValue).toBe(25);
		});

		it('handles edge case percentages', async () => {
			await updateDefaultSplit('percentage', 0);
			expect((await getSettings()).defaultSplitValue).toBe(0);

			await updateDefaultSplit('percentage', 1);
			expect((await getSettings()).defaultSplitValue).toBe(1);
		});
	});

	describe('updateTheme', () => {
		it('updates to light theme', async () => {
			await updateTheme('light');

			const settings = await getSettings();
			expect(settings.theme).toBe('light');
		});

		it('updates to dark theme', async () => {
			await updateTheme('dark');

			const settings = await getSettings();
			expect(settings.theme).toBe('dark');
		});

		it('updates to system theme', async () => {
			// First change to something else
			await updateTheme('dark');
			// Then back to system
			await updateTheme('system');

			const settings = await getSettings();
			expect(settings.theme).toBe('system');
		});
	});

	describe('dismissRecurring', () => {
		it('adds merchant to dismissed list', async () => {
			await dismissRecurring('Netflix');

			const dismissed = await getDismissedRecurring();
			expect(dismissed).toContain('netflix'); // Normalized to lowercase
		});

		it('normalizes merchant name', async () => {
			await dismissRecurring('  SPOTIFY  ');

			const dismissed = await getDismissedRecurring();
			expect(dismissed).toContain('spotify');
		});

		it('does not add duplicates', async () => {
			await dismissRecurring('Netflix');
			await dismissRecurring('NETFLIX');
			await dismissRecurring('netflix');

			const dismissed = await getDismissedRecurring();
			expect(dismissed.filter((m) => m === 'netflix')).toHaveLength(1);
		});

		it('preserves existing dismissed items', async () => {
			await dismissRecurring('Netflix');
			await dismissRecurring('Spotify');

			const dismissed = await getDismissedRecurring();
			expect(dismissed).toContain('netflix');
			expect(dismissed).toContain('spotify');
		});
	});

	describe('restoreRecurring', () => {
		it('removes merchant from dismissed list', async () => {
			await dismissRecurring('Netflix');
			await dismissRecurring('Spotify');

			await restoreRecurring('Netflix');

			const dismissed = await getDismissedRecurring();
			expect(dismissed).not.toContain('netflix');
			expect(dismissed).toContain('spotify');
		});

		it('normalizes merchant name for removal', async () => {
			await dismissRecurring('netflix');

			await restoreRecurring('  NETFLIX  ');

			const dismissed = await getDismissedRecurring();
			expect(dismissed).not.toContain('netflix');
		});

		it('handles restoring non-dismissed merchant gracefully', async () => {
			await dismissRecurring('Netflix');

			// This should not throw
			await restoreRecurring('NonExistent');

			const dismissed = await getDismissedRecurring();
			expect(dismissed).toContain('netflix');
		});
	});

	describe('getDismissedRecurring', () => {
		it('returns empty array initially', async () => {
			const dismissed = await getDismissedRecurring();
			expect(dismissed).toEqual([]);
		});

		it('returns dismissed merchants', async () => {
			await dismissRecurring('Netflix');
			await dismissRecurring('Hulu');

			const dismissed = await getDismissedRecurring();
			expect(dismissed).toHaveLength(2);
			expect(dismissed).toContain('netflix');
			expect(dismissed).toContain('hulu');
		});
	});
});
