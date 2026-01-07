import { db, type Settings, DEFAULT_SETTINGS } from '$lib/db';
import { liveQuery } from 'dexie';

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
}

// Update partner name
export async function updatePartnerName(name: string): Promise<void> {
	await db.settings.update(1, { partnerName: name });
}

// Update default split settings
export async function updateDefaultSplit(
	splitType: 'percentage' | 'fixed',
	splitValue: number
): Promise<void> {
	await db.settings.update(1, { defaultSplitType: splitType, defaultSplitValue: splitValue });
}

// Update theme
export async function updateTheme(theme: 'light' | 'dark' | 'system'): Promise<void> {
	await db.settings.update(1, { theme });
}
