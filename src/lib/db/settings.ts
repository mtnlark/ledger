import { db, DEFAULT_SETTINGS, type Settings } from './index';

/** Shared singleton write used inside the caller's settings transaction. */
export async function writeSettings(updates: Partial<Omit<Settings, 'id'>>): Promise<void> {
	await db.settings.put({ ...DEFAULT_SETTINGS, ...await db.settings.get(1), ...updates, id: 1 });
}
