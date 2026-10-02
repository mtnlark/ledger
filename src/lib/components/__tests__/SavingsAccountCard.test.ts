import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import SavingsAccountCard from '../SavingsAccountCard.svelte';
import { db, type SavingsAccount } from '$lib/db';
import { resetStorageState } from '$lib/storage';
import { updateSavingsAccount } from '$lib/stores/savingsAccounts';
import { toast } from '$lib/stores/toast';

const account: SavingsAccount = {
	id: 1, name: 'Car Fund', accountType: 'savings', currentBalance: 500,
	sortOrder: 1, createdAt: new Date(2026, 9, 2), updatedAt: new Date(2026, 9, 2)
};

function cardProps() {
	return {
		account, contributions: [], onAddContribution: vi.fn(),
		onEditContribution: vi.fn(), onEditAccount: vi.fn(), onAccountUpdated: vi.fn()
	};
}

beforeEach(async () => {
	resetStorageState();
	await db.delete();
	await db.open();
	await db.savingsAccounts.bulkPut([account, { ...account, id: 2, name: 'Vacation Fund' }]);
});

afterEach(async () => {
	cleanup();
	vi.restoreAllMocks();
	resetStorageState();
	await db.delete();
});

it('dismisses the suggestion for one account and keeps Edit Account accessible after remount', async () => {
	const props = cardProps();
	const card = render(SavingsAccountCard, props);
	props.onAccountUpdated.mockImplementation(async () => {
		await card.rerender({ account: (await db.savingsAccounts.get(1))! });
	});
	expect(screen.getByRole('button', { name: /Set a goal/ })).toBeInTheDocument();
	await fireEvent.click(screen.getByRole('button', { name: 'Dismiss goal suggestion' }));
	await waitFor(() => expect(screen.queryByRole('button', { name: /Set a goal/ })).not.toBeInTheDocument());
	expect(props.onAccountUpdated).toHaveBeenCalledOnce();
	expect(await db.savingsAccounts.get(1)).toMatchObject({ isGoalPromptDismissed: true, currentBalance: 500 });
	expect((await db.savingsAccounts.get(2))?.isGoalPromptDismissed).toBeUndefined();

	cleanup();
	render(SavingsAccountCard, { ...props, account: (await db.savingsAccounts.get(1))! });
	expect(screen.queryByRole('button', { name: /Set a goal/ })).not.toBeInTheDocument();
	await fireEvent.click(screen.getByRole('button', { name: 'More options' }));
	await fireEvent.click(screen.getByRole('button', { name: 'Edit Account' }));
	expect(props.onEditAccount).toHaveBeenCalledOnce();

	cleanup();
	render(SavingsAccountCard, { ...cardProps(), account: (await db.savingsAccounts.get(2))! });
	expect(screen.getByRole('button', { name: /Set a goal/ })).toBeInTheDocument();
});

it('shows a goal added through editing even when its suggestion was dismissed', async () => {
	await updateSavingsAccount(1, { isGoalPromptDismissed: true, targetAmount: 10000 });
	render(SavingsAccountCard, { ...cardProps(), account: (await db.savingsAccounts.get(1))! });
	expect(screen.getByText('Goal')).toBeInTheDocument();
	expect(screen.getByText('$10,000.00')).toBeInTheDocument();
	await screen.findByText('Start saving to track progress');
	expect(screen.queryByRole('button', { name: /Set a goal/ })).not.toBeInTheDocument();
});

it('keeps the suggestion visible if dismissal cannot be saved', async () => {
	vi.spyOn(db.savingsAccounts, 'update').mockRejectedValueOnce(new Error('Database unavailable'));
	vi.spyOn(console, 'error').mockImplementation(() => {});
	const errorToast = vi.spyOn(toast, 'error').mockReturnValue('error-toast');
	const props = cardProps();
	render(SavingsAccountCard, props);
	await fireEvent.click(screen.getByRole('button', { name: 'Dismiss goal suggestion' }));
	await waitFor(() => expect(errorToast).toHaveBeenCalledWith('Failed to dismiss goal suggestion'));
	expect(screen.getByRole('button', { name: /Set a goal/ })).toBeInTheDocument();
	expect(screen.getByRole('button', { name: 'Dismiss goal suggestion' })).toBeEnabled();
	expect(props.onAccountUpdated).not.toHaveBeenCalled();
	expect((await db.savingsAccounts.get(1))?.isGoalPromptDismissed).toBeUndefined();
});
