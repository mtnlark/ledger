import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { db } from '$lib/db';
import { toast } from '$lib/stores/toast';
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

it.each(['remove', 'keep'] as const)('unlinks with %s mode, preserving manual accounts and savings history', async (mode) => {
	await db.linkedAccounts.update(7, { source: 'simplefin' });
	await db.linkedAccounts.put({ ...(await db.linkedAccounts.get(7))!, id: 8, source: 'manual', simplefinId: undefined });
	await db.savingsAccounts.put({ id: 1, name: 'Savings intent', accountType: 'savings', currentBalance: 55, linkedAccountId: 7, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() });
	await db.savingsContributions.put({ id: 1, accountId: 1, amount: 55, source: 'other', date: new Date(), createdAt: new Date(), updatedAt: new Date() });
	render(ConnectedAccountsSection);
	await fireEvent.click(await screen.findByRole('button', { name: 'Load accounts' }));
	await screen.findByText('Connected', { exact: true });
	await fireEvent.click(screen.getByRole('button', { name: 'Unlink' }));
	await fireEvent.click(screen.getByRole('radio', { name: mode === 'remove' ? /Remove the synced/ : /Keep the synced/ }));
	await fireEvent.click(screen.getAllByRole('button', { name: 'Unlink' }).at(-1)!);
	await screen.findByLabelText('Setup token');
	expect(invoke).toHaveBeenCalledWith('simplefin_unlink');
	expect(await db.linkedAccounts.get(8)).toMatchObject({ source: 'manual' });
	expect(await db.savingsAccounts.get(1)).toMatchObject({ currentBalance: 55 });
	expect(await db.savingsContributions.get(1)).toMatchObject({ amount: 55 });
	if (mode === 'remove') {
		expect(await db.linkedAccounts.get(7)).toBeUndefined();
		expect(await db.balanceSnapshots.where('accountId').equals(7).count()).toBe(0);
		expect((await db.savingsAccounts.get(1))?.linkedAccountId).toBeUndefined();
	} else {
		expect(await db.linkedAccounts.get(7)).toMatchObject({ source: 'manual', simplefinId: 'external', currentBalance: 100 });
		expect(await db.balanceSnapshots.get(1)).toMatchObject({ accountId: 7, balance: 100 });
		expect((await db.savingsAccounts.get(1))?.linkedAccountId).toBe(7);
	}
});

it('rolls back account deletion, snapshots and savings cleanup together on failure', async () => {
	await db.linkedAccounts.update(7, { source: 'simplefin' });
	await db.savingsAccounts.put({ id: 1, name: 'Linked intent', accountType: 'savings', currentBalance: 55, linkedAccountId: 7, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() });
	const before = await Promise.all([db.linkedAccounts.toArray(), db.balanceSnapshots.toArray(), db.savingsAccounts.toArray()]);
	const failure = vi.spyOn(db.linkedAccounts, 'delete').mockRejectedValueOnce(new Error('synthetic delete failure'));
	const errors = vi.spyOn(toast, 'error');
	render(ConnectedAccountsSection);
	await fireEvent.click(await screen.findByRole('button', { name: 'Load accounts' }));
	await screen.findByText('Connected', { exact: true });
	await fireEvent.click(screen.getByRole('button', { name: 'Unlink' }));
	await fireEvent.click(screen.getByRole('radio', { name: /Remove the synced/ }));
	await fireEvent.click(screen.getAllByRole('button', { name: 'Unlink' }).at(-1)!);
	await waitFor(() => expect(errors).toHaveBeenCalledWith(expect.stringContaining('synthetic delete failure')));
	expect(await Promise.all([db.linkedAccounts.toArray(), db.balanceSnapshots.toArray(), db.savingsAccounts.toArray()])).toEqual(before);
	failure.mockRestore(); errors.mockRestore(); toast.clear();
});
