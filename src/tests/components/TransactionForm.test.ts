/**
 * Rendered component tests for TransactionForm — the single entry point for
 * adding transactions (main window and menu-bar quick add).
 * Covers submit payloads, shared-split values, and validation gating.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import TransactionForm from '$lib/components/TransactionForm.svelte';
import type { TransactionFormData } from '$lib/components/TransactionForm.svelte';
import { DEFAULT_SETTINGS, type Category, type Settings } from '$lib/db';

const categories: Category[] = [
	{ id: 1, name: 'Groceries', isActive: true, sortOrder: 0, isEssential: true },
	{ id: 2, name: 'Restaurants', isActive: true, sortOrder: 1, isEssential: false },
	{ id: 3, name: 'Old Category', isActive: false, sortOrder: 2, isEssential: false }
];

const settings: Settings = { ...DEFAULT_SETTINGS };

function setup(overrides: { onSubmit?: (d: TransactionFormData) => void } = {}) {
	const onSubmit = vi.fn(overrides.onSubmit);
	const utils = render(TransactionForm, {
		props: { categories, settings, onSubmit }
	});
	return { onSubmit, ...utils };
}

function categoryBox() {
	return screen.getByPlaceholderText('Type to search categories...');
}

function merchantBox() {
	return screen.getByPlaceholderText(/shell, amazon/i);
}

async function pickCategory(name: string) {
	await fireEvent.input(categoryBox(), { target: { value: name } });
	const option = await screen.findByRole('option', { name: new RegExp(name, 'i') });
	// CategoryCombobox selects on mousedown (to beat the input's blur handler)
	await fireEvent.mouseDown(option);
}

async function fillBaseFields(merchant = 'Trader Joes', amount = '52.30') {
	await fireEvent.input(merchantBox(), { target: { value: merchant } });
	await fireEvent.input(screen.getByLabelText('Amount'), { target: { value: amount } });
	await pickCategory('Groceries');
}

describe('TransactionForm', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('submits a basic transaction with parsed amount and category', async () => {
		const { onSubmit } = setup();
		await fillBaseFields();

		await fireEvent.click(screen.getByRole('button', { name: /add transaction/i }));

		await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
		const data = onSubmit.mock.calls[0][0] as TransactionFormData;
		expect(data.merchant).toBe('Trader Joes');
		expect(data.amount).toBe(52.3);
		expect(data.categoryId).toBe(1);
		expect(data.isShared).toBe(false);
		expect(data.date).toBeInstanceOf(Date);
	});

	it('does not submit when merchant is empty', async () => {
		const { onSubmit } = setup();
		await fireEvent.input(screen.getByLabelText('Amount'), { target: { value: '10' } });
		await pickCategory('Groceries');

		await fireEvent.click(screen.getByRole('button', { name: /add transaction/i }));

		// Give any submit handling a tick, then confirm it was blocked
		await new Promise((r) => setTimeout(r, 10));
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it('does not submit when no category is selected', async () => {
		const { onSubmit } = setup();
		await fireEvent.input(merchantBox(), { target: { value: 'Store' } });
		await fireEvent.input(screen.getByLabelText('Amount'), { target: { value: '10' } });

		await fireEvent.click(screen.getByRole('button', { name: /add transaction/i }));

		await new Promise((r) => setTimeout(r, 10));
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it('submits shared transaction with default split settings', async () => {
		const { onSubmit } = setup();
		await fillBaseFields('Dinner Place', '100');

		await fireEvent.click(screen.getByLabelText(/shared/i));
		await fireEvent.click(screen.getByRole('button', { name: /add transaction/i }));

		await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
		const data = onSubmit.mock.calls[0][0] as TransactionFormData;
		expect(data.isShared).toBe(true);
		expect(data.splitType).toBe(DEFAULT_SETTINGS.defaultSplitType);
		expect(data.splitValue).toBe(DEFAULT_SETTINGS.defaultSplitValue);
	});

	it('only offers active categories in the picker', async () => {
		setup();
		await fireEvent.input(categoryBox(), { target: { value: 'Old' } });

		expect(screen.queryByRole('option', { name: /old category/i })).toBeNull();
	});
});
