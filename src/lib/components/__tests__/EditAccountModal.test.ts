import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import EditAccountModal from '../EditAccountModal.svelte';
import SavingsAccountCard from '../SavingsAccountCard.svelte';
import SavingsInsights from '../insights/SavingsInsights.svelte';
import { db, DEFAULT_SETTINGS, type SavingsAccount } from '$lib/db';
import { resetStorageState } from '$lib/storage';

const account: SavingsAccount = {
	id: 1,
	name: 'Car Fund',
	accountType: 'savings',
	currentBalance: 500,
	targetAmount: 10000,
	targetDate: new Date(2026, 11, 31),
	sortOrder: 1,
	createdAt: new Date(2026, 9, 2),
	updatedAt: new Date(2026, 9, 2)
};

async function openEditor() {
	const callbacks = { onSave: vi.fn(), onDelete: vi.fn(), onClose: vi.fn() };
	render(EditAccountModal, { isOpen: true, account: await db.savingsAccounts.get(1) ?? null, ...callbacks });
	await screen.findByLabelText('Target Amount');
	return callbacks;
}

async function enterPartialDate(input: HTMLInputElement) {
	// jsdom cannot model native date segments. A partial date has an empty value,
	// remains invalid, and clears its native editing state when value is assigned.
	const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
	Object.defineProperty(input, 'value', {
		configurable: true,
		get: () => nativeValue.get!.call(input),
		set: (value: string) => {
			nativeValue.set!.call(input, value);
			input.setCustomValidity('');
		}
	});
	nativeValue.set!.call(input, '');
	input.setCustomValidity('Enter a complete date');
	await fireEvent.input(input);
}

beforeEach(async () => {
	resetStorageState();
	await db.delete();
	await db.open();
	await db.settings.put({
		...DEFAULT_SETTINGS,
		completedGoals: [{ accountName: 'Previous Fund', targetAmount: 100, completedDate: '2026-01-01T00:00:00.000Z' }]
	});
	await db.savingsAccounts.put(account);
	await db.savingsContributions.put({
		id: 1,
		accountId: 1,
		amount: 50,
		source: 'bank_transfer',
		date: new Date(2026, 9, 2),
		createdAt: new Date(2026, 9, 2),
		updatedAt: new Date(2026, 9, 2)
	});
});

afterEach(async () => {
	cleanup();
	resetStorageState();
	await db.delete();
});

describe('savings goal editing', () => {
	it('clears an invalid native date and saves goal removal without deleting account data', async () => {
		const settings = await db.settings.get(1);
		const contributions = await db.savingsContributions.toArray();
		const insights = render(SavingsInsights, {
			currentMonth: '2026-10', accounts: [account], contributions,
			budget: null, allContributions: contributions, allBudgets: []
		});
		await screen.findByRole('heading', { name: 'Goal Progress' });
		const { onSave } = await openEditor();
		const date = screen.getByLabelText('Target Date') as HTMLInputElement;
		await enterPartialDate(date);
		expect(date.value).toBe('');
		expect(date.validity.valid).toBe(false);

		await fireEvent.click(screen.getByRole('button', { name: 'Remove Goal' }));
		expect(date.validity.valid).toBe(true);
		expect(date).toBeDisabled();
		expect(screen.getByLabelText('Target Amount')).toHaveValue('');
		expect((await db.savingsAccounts.get(1))?.targetAmount).toBe(10000);

		await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
		await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
		const saved = await db.savingsAccounts.get(1);
		expect(saved).toMatchObject({ id: 1, name: 'Car Fund', currentBalance: 500, createdAt: account.createdAt });
		expect(saved?.targetAmount).toBeUndefined();
		expect(saved?.targetDate).toBeUndefined();
		expect(await db.savingsContributions.toArray()).toEqual(contributions);
		expect(await db.settings.get(1)).toEqual(settings);
		await insights.rerender({ accounts: [saved!] });
		await waitFor(() => expect(screen.queryByRole('heading', { name: 'Goal Progress' })).not.toBeInTheDocument());
		render(SavingsAccountCard, {
			account: saved!, contributions,
			onAddContribution: vi.fn(), onEditContribution: vi.fn(),
			onEditAccount: vi.fn(), onAccountUpdated: vi.fn()
		});
		expect(screen.getByRole('button', { name: /Set a goal/ })).toBeInTheDocument();
	});

	it('keeps removal available with empty draft fields', async () => {
		const { onSave } = await openEditor();
		const date = screen.getByLabelText('Target Date') as HTMLInputElement;
		await enterPartialDate(date);
		await fireEvent.input(screen.getByLabelText('Target Amount'), { target: { value: '' } });
		expect(date).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Remove Goal' })).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
		await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
		const saved = await db.savingsAccounts.get(1);
		expect(saved?.targetAmount).toBeUndefined();
		expect(saved?.targetDate).toBeUndefined();
	});

	it('clears the persisted deadline when only the target amount is cleared', async () => {
		const { onSave } = await openEditor();
		await fireEvent.input(screen.getByLabelText('Target Amount'), { target: { value: '' } });
		expect(screen.getByLabelText('Target Date')).toHaveValue('2026-12-31');
		await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
		await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
		const saved = await db.savingsAccounts.get(1);
		expect(saved?.targetAmount).toBeUndefined();
		expect(saved?.targetDate).toBeUndefined();
	});

	it('does not save staged goal removal when cancelled', async () => {
		const { onSave, onClose } = await openEditor();
		await fireEvent.click(screen.getByRole('button', { name: 'Remove Goal' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(onClose).toHaveBeenCalledOnce();
		expect(onSave).not.toHaveBeenCalled();
		expect(await db.savingsAccounts.get(1)).toEqual(account);
	});

	it.each(['2027-06-30', ''])('saves a goal with optional deadline "%s"', async (deadline) => {
		const { onSave } = await openEditor();
		await fireEvent.input(screen.getByLabelText('Target Amount'), { target: { value: '20000' } });
		await fireEvent.input(screen.getByLabelText('Target Date'), { target: { value: deadline } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
		await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
		const saved = await db.savingsAccounts.get(1);
		expect(saved?.targetAmount).toBe(20000);
		expect(saved?.targetDate).toEqual(deadline ? new Date(`${deadline}T00:00:00`) : undefined);
	});

	it('blocks saving a malformed deadline while a target amount is present', async () => {
		const { onSave } = await openEditor();
		const date = screen.getByLabelText('Target Date') as HTMLInputElement;
		await enterPartialDate(date);
		expect(date).toBeEnabled();
		expect(date.checkValidity()).toBe(false);
		await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
		expect(onSave).not.toHaveBeenCalled();
		expect(await db.savingsAccounts.get(1)).toEqual(account);
	});

	it('restores the deadline after temporarily clearing and replacing the amount', async () => {
		const { onSave } = await openEditor();
		await fireEvent.input(screen.getByLabelText('Target Amount'), { target: { value: '' } });
		await fireEvent.input(screen.getByLabelText('Target Amount'), { target: { value: '20000' } });
		expect(screen.getByLabelText('Target Date')).toBeEnabled();
		await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
		await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
		expect(await db.savingsAccounts.get(1)).toMatchObject({ targetAmount: 20000, targetDate: account.targetDate });
	});
});
