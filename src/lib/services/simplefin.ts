import { invoke } from '@tauri-apps/api/core';
import { roundCurrency } from '$lib/utils/currency';
import {
	getAllLinkedAccounts,
	recordBalance,
	setSyncStatus
} from '$lib/stores/linkedAccounts';

/**
 * SimpleFIN sync (balances only, read-only). The access URL credential lives
 * exclusively in the macOS Keychain on the Rust side — these wrappers never
 * see it. Sync must only run in the main window (single-writer rule).
 */

export interface SimplefinRawAccount {
	id: string;
	name: string;
	currency?: string | null;
	/** Decimal string per the SimpleFIN protocol. */
	balance: string;
	'available-balance'?: string | null;
	/** Unix seconds. */
	'balance-date': number;
	org?: { name?: string | null; domain?: string | null } | null;
}

export interface SimplefinAccountsResponse {
	errors: string[];
	accounts: SimplefinRawAccount[];
}

export interface MappedSimplefinAccount {
	simplefinId: string;
	name: string;
	institution: string;
	balance: number;
	balanceDate: Date;
}

export function mapSimplefinAccount(raw: SimplefinRawAccount): MappedSimplefinAccount {
	return {
		simplefinId: raw.id,
		name: raw.name,
		institution: raw.org?.name ?? raw.org?.domain ?? '',
		balance: roundCurrency(parseFloat(raw.balance) || 0),
		balanceDate: new Date(raw['balance-date'] * 1000)
	};
}

export function isLinked(): Promise<boolean> {
	return invoke<boolean>('simplefin_is_linked');
}

/** Accepts a SimpleFIN setup token, or a raw access URL (demo flow). */
export function link(setupToken: string): Promise<SimplefinAccountsResponse> {
	return invoke<SimplefinAccountsResponse>('simplefin_link', { setupToken });
}

export function unlink(): Promise<void> {
	return invoke<void>('simplefin_unlink');
}

export function fetchAccounts(): Promise<SimplefinAccountsResponse> {
	return invoke<SimplefinAccountsResponse>('simplefin_fetch_accounts');
}

export interface SyncResult {
	synced: number;
	failed: number;
	/** True when there was nothing to sync (no simplefin-sourced accounts). */
	skipped: boolean;
}

/**
 * Pull balances for all simplefin-sourced accounts. Per-account failures mark
 * that account 'error'/'stale' and keep its last balance — one flaky
 * institution must never block the others. Never throws.
 */
export async function syncBalances(): Promise<SyncResult> {
	const accounts = await getAllLinkedAccounts();
	const targets = accounts.filter((a) => a.source === 'simplefin' && a.simplefinId);
	if (targets.length === 0) return { synced: 0, failed: 0, skipped: true };

	let upstream: SimplefinAccountsResponse;
	try {
		if (!(await isLinked())) {
			for (const account of targets) await setSyncStatus(account.id!, 'stale');
			return { synced: 0, failed: targets.length, skipped: false };
		}
		upstream = await fetchAccounts();
	} catch (error) {
		console.error('SimpleFIN fetch failed:', error);
		for (const account of targets) {
			try {
				await setSyncStatus(account.id!, 'error');
			} catch {
				/* keep going */
			}
		}
		return { synced: 0, failed: targets.length, skipped: false };
	}

	const byId = new Map(upstream.accounts.map((raw) => [raw.id, mapSimplefinAccount(raw)]));
	let synced = 0;
	let failed = 0;

	for (const account of targets) {
		try {
			const mapped = byId.get(account.simplefinId!);
			if (!mapped) {
				// Upstream no longer reports this account
				await setSyncStatus(account.id!, 'stale');
				failed++;
				continue;
			}
			await recordBalance(account.id!, mapped.balance, 'simplefin');
			await setSyncStatus(account.id!, 'ok', new Date());
			synced++;
		} catch (error) {
			console.error(`SimpleFIN sync failed for ${account.name}:`, error);
			try {
				await setSyncStatus(account.id!, 'error');
			} catch {
				/* keep going */
			}
			failed++;
		}
	}

	return { synced, failed, skipped: false };
}

const LAST_SYNC_KEY = 'ledger-simplefin-last-sync';

/** App-open sync, at most once per calendar day. Returns true if a sync ran. */
export async function maybeSyncOnLaunch(): Promise<boolean> {
	const today = new Date().toISOString().slice(0, 10);
	if (localStorage.getItem(LAST_SYNC_KEY) === today) return false;
	const result = await syncBalances();
	if (result.skipped) return false;
	localStorage.setItem(LAST_SYNC_KEY, today);
	return true;
}
