import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import DataReview from '../settings/DataReview.svelte';
import SaveStatusBanner from '../SaveStatusBanner.svelte';
import EditSplitModal from '../EditSplitModal.svelte';
import { db, DEFAULT_SETTINGS } from '$lib/db';
import { saveStatus, resetStorageState } from '$lib/storage';
import { dehydrateAll } from '$lib/storage/serialization';
import { addSplitTransaction } from '$lib/stores/transactions';
const retry = vi.hoisted(() => vi.fn());
vi.mock('$lib/storage', async (importOriginal) => ({ ...await importOriginal<typeof import('$lib/storage')>(), retryPersistence: retry }));
vi.mock('$lib/utils/import', async (importOriginal) => ({ ...await importOriginal<typeof import('$lib/utils/import')>(), readExcelFile: async () => [
	['Date', 'Merchant', 'Amount', 'Category'], ['2026-06-01', 'Test import', '$12.30', 'Unknown'], ['2026-06-02', 'Invalid', 'bad', 'Food'], []
] }));
beforeEach(async () => {
	resetStorageState(); await db.delete(); await db.open(); retry.mockReset();
	await db.categories.put({ id: 1, name: 'Food', isActive: true, isEssential: true, sortOrder: 1 });
	await db.settings.put(DEFAULT_SETTINGS);
});
afterEach(() => { cleanup(); resetStorageState(); });
it('renders a restore preview and cancel leaves the database untouched', async () => {
	render(DataReview);
	const data = await dehydrateAll(); data.categories = [];
	const text = JSON.stringify(data);
	const file = new File([text], 'backup.json', { type: 'application/json' });
	Object.defineProperty(file, 'text', { value: async () => text });
	await fireEvent.change(screen.getByLabelText('Preview backup restore'), { target: { files: [file] } });
	await screen.findByText('Restore preview');
	expect(screen.getByText('categories: 0')).toBeInTheDocument();
	expect(await db.categories.count()).toBe(1);
	await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
	expect(screen.queryByText('Restore preview')).not.toBeInTheDocument();
	expect(await db.categories.count()).toBe(1);
});
it('requires spreadsheet mapping, shows row diagnostics and commits only on approval', async () => {
	render(DataReview);
	await fireEvent.change(screen.getByLabelText('Preview Excel import'), { target: { files: [new File([], 'expenses.xlsx')] } });
	await screen.findByText('Spreadsheet preview');
	expect(screen.getByText('1 accepted · 0 duplicates · 1 invalid · 1 blank rows')).toBeInTheDocument();
	expect(screen.getByText(/Row 3: Invalid US currency/)).toBeInTheDocument();
	const approve = screen.getByRole('button', { name: 'Import approved rows' });
	expect(approve).toBeDisabled(); expect(await db.transactions.count()).toBe(0);
	await fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });
	expect(approve).toBeEnabled();
	await fireEvent.click(approve);
	await screen.findByText(/Imported 1 transactions/);
	expect((await db.transactions.toArray())[0]).toMatchObject({ merchant: 'Test import', amount: 12.3, categoryId: 1 });
});
it('requires explicit selection before applying a historical correction', async () => {
	const ids = await addSplitTransaction({ merchant: 'Old purchase', date: new Date(2026, 5, 1), amount: 100, categoryId: 1, isShared: true, splitType: 'fixed', splitValue: 30, isSettled: false, isEssential: false, isSubscription: false }, [{ categoryId: 1, amount: 60 }, { categoryId: 1, amount: 40 }]);
	for (const id of ids) await db.transactions.update(id, { partnerShare: 30, splitValue: 30 });
	render(DataReview);
	await fireEvent.click(screen.getByRole('button', { name: 'Review historical fixed shares' }));
	const approve = await screen.findByRole('button', { name: 'Back up and apply selected corrections' });
	expect(approve).toBeDisabled();
	await fireEvent.click(screen.getByRole('checkbox'));
	expect(approve).toBeEnabled();
	await fireEvent.click(approve);
	await screen.findByText('Selected corrections saved');
	expect((await db.transactions.get(ids[0]))?.partnerShare).toBe(18);
});
it('seeds group editing from the parent fixed share', async () => {
	const ids = await addSplitTransaction({ merchant: 'Purchase', date: new Date(2026, 5, 1), amount: 100, categoryId: 1, isShared: true, splitType: 'fixed', splitValue: 30, isSettled: false, isEssential: false, isSubscription: false }, [{ categoryId: 1, amount: 60 }, { categoryId: 1, amount: 40 }]);
	const children = await db.transactions.where('id').anyOf(ids).toArray();
	render(EditSplitModal, { isOpen: true, parentId: children[0].parentTransactionId!, children, categories: await db.categories.toArray(), settings: DEFAULT_SETTINGS, onSave: vi.fn(), onClose: vi.fn() });
	expect(await screen.findByDisplayValue('30')).toBeInTheDocument();
});
it('keeps the disk failure banner until retry succeeds', async () => {
	saveStatus.set('unsaved'); render(SaveStatusBanner);
	expect(screen.getByRole('alert')).toHaveTextContent('Changes not saved to disk');
	expect(screen.getByRole('button', { name: 'Export Backup' })).toBeInTheDocument();
	retry.mockRejectedValueOnce(new Error('Still full'));
	await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
	await screen.findByText('Error: Still full');
	expect(screen.getByRole('alert')).toBeInTheDocument();
	retry.mockImplementationOnce(async () => { saveStatus.set('saved'); });
	await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
	await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});
