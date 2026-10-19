import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import EditSplitModal from '$lib/components/EditSplitModal.svelte';
import { db, DEFAULT_SETTINGS, type Category, type Transaction } from '$lib/db';
import { tagIndex } from '$lib/stores/tags.svelte';

vi.mock('svelte/transition', async (original) => ({
	...await original<typeof import('svelte/transition')>(),
	fade: () => ({ duration: 0 }),
	scale: () => ({ duration: 0 })
}));

const categories: Category[] = [
	{ id: 1, name: 'Groceries', isActive: true, sortOrder: 0, isEssential: true },
	{ id: 2, name: 'Household', isActive: true, sortOrder: 1, isEssential: true }
];

const parent: Transaction = {
	id: 1,
	date: new Date(2026, 8, 1),
	merchant: 'Test Store',
	amount: 100,
	categoryId: 1,
	isShared: false,
	splitType: 'percentage',
	splitValue: 0.5,
	partnerShare: 0,
	isSettled: false,
	isEssential: true,
	isSubscription: false,
	isSplitParent: true,
	createdAt: new Date(2026, 8, 1),
	updatedAt: new Date(2026, 8, 1)
};

const children: Transaction[] = [
	{ ...parent, id: 2, isSplitParent: false, parentTransactionId: 1, amount: 60, notes: 'Food #weekly' },
	{ ...parent, id: 3, isSplitParent: false, parentTransactionId: 1, categoryId: 2, amount: 40, notes: 'Supplies #work-expenses' }
];

async function openEditor() {
	const callbacks = { onSave: vi.fn(), onClose: vi.fn() };
	render(EditSplitModal, {
		isOpen: true,
		parentId: parent.id!,
		children,
		categories,
		settings: { ...DEFAULT_SETTINGS },
		...callbacks
	});
	await screen.findByDisplayValue(children[0].notes!);
	return {
		...callbacks,
		notes: screen.getAllByPlaceholderText('Notes / #tags (optional)') as HTMLInputElement[]
	};
}

beforeEach(async () => {
	await db.transactions.clear();
	await db.transactions.bulkPut([parent, ...children]);
	tagIndex.rebuild([...children, { ...parent, id: 4, isSplitParent: false, notes: '#travel' }]);
});

afterEach(async () => {
	cleanup();
	tagIndex.rebuild([]);
	await db.transactions.clear();
});

describe('EditSplitModal tag autocomplete', () => {
	it('completes a tag by mouse and saves only the edited line with surrounding notes intact', async () => {
		const { notes, onSave } = await openEditor();
		const draft = 'Food #tr for the trip';
		notes[0].value = draft;
		notes[0].setSelectionRange(8, 8);
		await fireEvent.input(notes[0]);

		await fireEvent.click(await screen.findByRole('button', { name: '#travel' }));
		expect(notes[0]).toHaveValue('Food #travel for the trip');
		expect(notes[1]).toHaveValue(children[1].notes);
		expect(onSave).not.toHaveBeenCalled();
		await waitFor(() => expect(notes[0]).toHaveFocus());
		expect(notes[0].selectionStart).toBe('Food #travel '.length);

		await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
		await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
		expect(onSave).toHaveBeenCalledWith(1, expect.objectContaining({ merchant: parent.merchant }), [
			{ categoryId: 1, amount: 60, notes: 'Food #travel for the trip' },
			{ categoryId: 2, amount: 40, notes: children[1].notes }
		]);
	});

	it('completes tags with the keyboard on another line without submitting the form', async () => {
		const { notes, onSave } = await openEditor();
		await fireEvent.input(notes[1], { target: { value: 'Supplies #wo' } });
		await screen.findByRole('button', { name: '#work-expenses' });
		await fireEvent.keyDown(notes[1], { key: 'ArrowDown' });
		const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
		await fireEvent(notes[1], enter);

		expect(enter.defaultPrevented).toBe(true);
		expect(notes[1]).toHaveValue('Supplies #work-expenses ');
		expect(notes[0]).toHaveValue(children[0].notes);
		expect(screen.queryByRole('button', { name: '#work-expenses' })).not.toBeInTheDocument();
		expect(onSave).not.toHaveBeenCalled();
		await waitFor(() => expect(notes[1]).toHaveFocus());

		await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
		await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
		expect(onSave.mock.calls[0][2]).toEqual([
			{ categoryId: 1, amount: 60, notes: children[0].notes },
			{ categoryId: 2, amount: 40, notes: 'Supplies #work-expenses' }
		]);
	});

	it('supports autocomplete on an added line and keeps it attached when an earlier line is removed', async () => {
		const { onSave } = await openEditor();
		await fireEvent.click(screen.getByRole('button', { name: 'Add Line' }));
		const notes = screen.getAllByPlaceholderText('Notes / #tags (optional)');
		await fireEvent.input(notes[2], { target: { value: 'Extra #tr' } });
		await fireEvent.click(await screen.findByRole('button', { name: '#travel' }));
		await fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: '2' } });
		await fireEvent.input(screen.getAllByRole('spinbutton')[2], { target: { value: '10' } });
		await fireEvent.click(screen.getAllByRole('button', { name: 'Remove line' })[0]);

		const remainingNotes = screen.getAllByPlaceholderText('Notes / #tags (optional)');
		expect(remainingNotes[0]).toHaveValue(children[1].notes);
		expect(remainingNotes[1]).toHaveValue('Extra #travel ');
		await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
		await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
		expect(onSave.mock.calls[0][2]).toEqual([
			{ categoryId: 2, amount: 40, notes: children[1].notes },
			{ categoryId: 2, amount: 10, notes: 'Extra #travel' }
		]);
	});
});
