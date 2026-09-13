import { invoke } from '@tauri-apps/api/core';
import { roundCurrency } from '$lib/utils/currency';
import { getAllLinkedAccounts, applyBalanceSync, type BalanceSyncUpdate } from '$lib/stores/linkedAccounts';
import { assertCanMutate } from '$lib/storage';

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
	if (typeof raw.balance !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(raw.balance) || !Number.isFinite(Number(raw.balance))) throw new Error('Invalid bank balance');
	if (!Number.isFinite(raw['balance-date']) || raw['balance-date'] <= 0 || !Number.isFinite(new Date(raw['balance-date'] * 1000).getTime())) throw new Error('Invalid balance timestamp');
	return {
		simplefinId: raw.id,
		name: raw.name,
		institution: raw.org?.name ?? raw.org?.domain ?? '',
		balance: roundCurrency(Number(raw.balance)),
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
let activeSync: Promise<SyncResult> | null = null;
export function syncBalances(): Promise<SyncResult> {
	if (activeSync) return activeSync;
	activeSync = performSync().finally(() => { activeSync = null; });
	return activeSync;
}
async function performSync(): Promise<SyncResult> {
	assertCanMutate();
	const targets = (await getAllLinkedAccounts()).filter((a) => a.source === 'simplefin' && a.simplefinId);
	if (!targets.length) return { synced: 0, failed: 0, skipped: true };
	let upstream: SimplefinAccountsResponse = { accounts: [], errors: [] };
	let fetchStatus: 'error' | 'stale' = 'stale';
	try {
		if (await isLinked()) upstream = await fetchAccounts();
	} catch { fetchStatus = 'error'; }
	const now = new Date();
	const updates: BalanceSyncUpdate[] = targets.map((account) => {
		const raw = upstream.accounts.find((a) => a.id === account.simplefinId);
		if (!raw) return { accountId: account.id!, status: fetchStatus };
		try {
			const mapped = mapSimplefinAccount(raw);
			if (account.upstreamBalanceAt && mapped.balanceDate < new Date(account.upstreamBalanceAt)) throw new Error('Balance timestamp regressed');
			return {
				accountId: account.id!,
				balance: account.accountClass === 'liability' ? Math.abs(mapped.balance) : mapped.balance,
				upstreamBalanceAt: mapped.balanceDate,
				status: now.getTime() - mapped.balanceDate.getTime() > 72 * 3600000 ? 'stale' : 'ok'
			};
		} catch { return { accountId: account.id!, status: 'error' }; }
	});
	await applyBalanceSync(updates, now);
	const synced = updates.filter((u) => u.balance !== undefined).length;
	return { synced, failed: targets.length - synced, skipped: false };
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
