import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { db } from '$lib/db';
import { resetStorageState } from '$lib/storage';
import ConnectedAccountsSection from '../settings/ConnectedAccountsSection.svelte';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
beforeEach(async () => {
	resetStorageState(); await db.delete(); await db.open();
	invoke.mockImplementation(async (command) => command === 'simplefin_is_linked' ? true : { errors: [], accounts: [{ id: 'external', name: 'Bank account', balance: '120', 'balance-date': Math.floor(Date.now() / 1000) }] });
	await db.linkedAccounts.put({ id: 7, name: 'Retained account', institution: 'Bank', accountClass: 'asset', accountType: 'checking', currentBalance: 100, source: 'manual', simplefinId: 'external', lastSyncStatus: 'ok', isActive: true, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() });
	await db.balanceSnapshots.put({ id: 1, accountId: 7, balance: 100, source: 'manual', capturedAt: new Date(2026, 0, 1) });
});
it('offers explicit reconnection of retained manual accounts and keeps IDs and history', async () => {
	render(ConnectedAccountsSection);
	await fireEvent.click(await screen.findByRole('button', { name: 'Load accounts' }));
	expect(await screen.findByRole('option', { name: /Retained account/ })).toBeInTheDocument();
	expect(screen.queryByText('Connected')).toBeNull();
	await fireEvent.change(screen.getByRole('combobox'), { target: { value: '7' } });
	await fireEvent.click(screen.getByRole('button', { name: /Reconnect|Add/ }));
	await waitFor(async () => expect((await db.linkedAccounts.get(7))?.source).toBe('simplefin'));
	expect(await db.linkedAccounts.count()).toBe(1);
	expect(await db.balanceSnapshots.get(1)).toMatchObject({ accountId: 7, balance: 100 });
});
it('settles the loading UI after a timeout and permits another attempt', async () => {
	render(ConnectedAccountsSection);
	await screen.findByRole('button', { name: 'Load accounts' });
	invoke.mockRejectedValueOnce(new Error('request timed out'));
	await fireEvent.click(screen.getByRole('button', { name: 'Load accounts' }));
	await waitFor(() => expect(screen.getByRole('button', { name: 'Load accounts' })).toBeEnabled());
	await fireEvent.click(screen.getByRole('button', { name: 'Load accounts' }));
	expect(await screen.findByText('Bank account')).toBeInTheDocument();
});
