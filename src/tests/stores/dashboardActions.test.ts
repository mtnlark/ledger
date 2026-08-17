import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all store dependencies before importing the module under test
vi.mock('$lib/stores/transactions', () => {
	// Mock transaction for soft delete return value - defined inside factory to avoid hoisting issues
	const mockDeletedTransaction = {
		id: 1,
		date: new Date('2026-01-15'),
		merchant: 'Test Store',
		amount: 42.5,
		categoryId: 1,
		isShared: false,
		isSettled: false,
		splitType: 'percentage' as const,
		splitValue: 0.5,
		partnerShare: 0,
		isEssential: false,
		isSubscription: false,
		createdAt: new Date(),
		updatedAt: new Date()
	};

	return {
		addTransaction: vi.fn().mockResolvedValue(1),
		updateTransaction: vi.fn().mockResolvedValue(undefined),
		deleteTransaction: vi.fn().mockResolvedValue(undefined),
		bulkDeleteTransactions: vi.fn().mockResolvedValue(undefined),
		bulkUpdateCategory: vi.fn().mockResolvedValue(undefined),
		splitTransaction: vi.fn().mockResolvedValue([2, 3]),
		getTransactionsByMonth: vi.fn().mockResolvedValue([]),
		getAllTransactions: vi.fn().mockResolvedValue([]),
		getAvailableMonths: vi.fn().mockResolvedValue(['2026-01']),
		softDeleteTransaction: vi.fn().mockResolvedValue(mockDeletedTransaction),
		softDeleteTransactions: vi.fn().mockResolvedValue([mockDeletedTransaction])
	};
});

vi.mock('$lib/stores/settings', () => ({
	cancelSubscription: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/stores/toast', () => ({
	toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
}));

vi.mock('$lib/stores/undo', () => ({
	undoStore: { capture: vi.fn() }
}));

vi.mock('$lib/utils/error-handler', () => ({
	handleError: vi.fn()
}));

import { setupDashboardActions, type DashboardContext } from '$lib/stores/dashboardActions';
import {
	addTransaction,
	updateTransaction,
	bulkUpdateCategory,
	splitTransaction,
	getTransactionsByMonth,
	getAllTransactions,
	getAvailableMonths,
	softDeleteTransaction,
	softDeleteTransactions
} from '$lib/stores/transactions';
import { cancelSubscription } from '$lib/stores/settings';
import { toast } from '$lib/stores/toast';
import { undoStore } from '$lib/stores/undo';
import { handleError } from '$lib/utils/error-handler';

describe('dashboardActions', () => {
	let actions: ReturnType<typeof setupDashboardActions>;
	let reloadFn: ReturnType<typeof vi.fn<DashboardContext['reload']>>;

	beforeEach(() => {
		vi.clearAllMocks();
		reloadFn = vi.fn<DashboardContext['reload']>();
		actions = setupDashboardActions({
			getCurrentMonth: () => '2026-01',
			hasAllTransactions: () => false,
			reload: reloadFn
		});
	});

	// ─── addTransaction ────────────────────────────────────────────────

	describe('addTransaction', () => {
		const txnData = {
			date: new Date('2026-01-15'),
			merchant: 'Test Store',
			amount: 42.5,
			categoryId: 1,
			isShared: false,
			isSettled: false,
			splitType: 'percentage' as const,
			splitValue: 0.5,
			isEssential: false,
			isSubscription: false
		};

		it('calls store addTransaction with the data including isSettled', async () => {
			await actions.addTransaction(txnData);

			expect(addTransaction).toHaveBeenCalledWith({
				...txnData,
				isSettled: false
			});
		});

		it('reloads transactions and available months', async () => {
			await actions.addTransaction(txnData);

			expect(getTransactionsByMonth).toHaveBeenCalledWith('2026-01');
			expect(getAvailableMonths).toHaveBeenCalled();
			expect(reloadFn).toHaveBeenCalled();
		});

		it('toasts success on completion', async () => {
			await actions.addTransaction(txnData);

			expect(toast.success).toHaveBeenCalledWith('Transaction added');
		});

		it('does NOT load allTransactions when hasAllTransactions is false', async () => {
			await actions.addTransaction(txnData);

			expect(getAllTransactions).not.toHaveBeenCalled();
		});

		it('loads allTransactions when hasAllTransactions is true', async () => {
			const actionsWithAll = setupDashboardActions({
				getCurrentMonth: () => '2026-01',
				hasAllTransactions: () => true,
				reload: reloadFn
			});

			await actionsWithAll.addTransaction(txnData);

			expect(getAllTransactions).toHaveBeenCalled();
		});

		it('passes allTransactions in reload data when hasAllTransactions is true', async () => {
			const mockAllTxns = [{ id: 1 }, { id: 2 }];
			vi.mocked(getAllTransactions).mockResolvedValueOnce(mockAllTxns as any);

			const actionsWithAll = setupDashboardActions({
				getCurrentMonth: () => '2026-01',
				hasAllTransactions: () => true,
				reload: reloadFn
			});

			await actionsWithAll.addTransaction(txnData);

			expect(reloadFn).toHaveBeenCalledWith(
				expect.objectContaining({
					allTransactions: mockAllTxns
				})
			);
		});

		it('calls handleError on failure', async () => {
			const error = new Error('fail');
			vi.mocked(addTransaction).mockRejectedValueOnce(error);

			await actions.addTransaction(txnData);

			expect(handleError).toHaveBeenCalledWith(error, {
				context: 'addTransaction',
				userMessage: 'Failed to add transaction'
			});
			expect(toast.success).not.toHaveBeenCalled();
		});
	});

	// ─── addSplitTransactions ──────────────────────────────────────────

	describe('addSplitTransactions', () => {
		const splitData = {
			date: new Date('2026-01-15'),
			merchant: 'Split Store',
			isShared: false,
			isSettled: false,
			splitType: 'percentage' as const,
			splitValue: 0.5,
			isEssential: true,
			isSubscription: false,
			subscriptionFrequency: undefined as 'monthly' | 'semi-annual' | 'annual' | undefined,
			splits: [
				{ categoryId: 1, amount: 30 },
				{ categoryId: 2, amount: 20 }
			]
		};

		it('creates parent then splits into linked children', async () => {
			await actions.addSplitTransactions(splitData);

			// Creates one parent with the total amount
			expect(addTransaction).toHaveBeenCalledTimes(1);
			expect(addTransaction).toHaveBeenCalledWith(
				expect.objectContaining({
					date: splitData.date,
					merchant: 'Split Store',
					amount: 50, // total of splits
					categoryId: 1, // first split's category
					isShared: false,
					isSettled: false,
					splitType: 'percentage',
					splitValue: 0.5,
					isEssential: true,
					isSubscription: false
				})
			);

			// Then calls splitTransaction with parent ID and split lines
			expect(splitTransaction).toHaveBeenCalledTimes(1);
			expect(splitTransaction).toHaveBeenCalledWith(1, splitData.splits);
		});

		it('reloads data and toasts with count', async () => {
			await actions.addSplitTransactions(splitData);

			expect(getTransactionsByMonth).toHaveBeenCalledWith('2026-01');
			expect(getAvailableMonths).toHaveBeenCalled();
			expect(reloadFn).toHaveBeenCalled();
			expect(toast.success).toHaveBeenCalledWith('Transaction split across 2 categories');
		});

		it('calls handleError when parent creation fails', async () => {
			const error = new Error('add fail');
			vi.mocked(addTransaction).mockRejectedValueOnce(error);

			await actions.addSplitTransactions(splitData);

			expect(handleError).toHaveBeenCalledWith(error, {
				context: 'addSplitTransactions',
				userMessage: 'Failed to add split transaction'
			});
		});

		it('calls handleError when split fails', async () => {
			const error = new Error('split fail');
			vi.mocked(splitTransaction).mockRejectedValueOnce(error);

			await actions.addSplitTransactions(splitData);

			expect(handleError).toHaveBeenCalledWith(error, {
				context: 'addSplitTransactions',
				userMessage: 'Failed to add split transaction'
			});
		});
	});

	// ─── saveEdit ──────────────────────────────────────────────────────

	describe('saveEdit', () => {
		const updateData = {
			date: new Date('2026-01-16'),
			merchant: 'Updated Store',
			amount: 55,
			categoryId: 2,
			isShared: true,
			splitType: 'percentage' as const,
			splitValue: 0.5,
			isEssential: true,
			isSubscription: false
		};

		it('calls updateTransaction with id and data including isSettled from current transaction', async () => {
			await actions.saveEdit(42, updateData, true);

			expect(updateTransaction).toHaveBeenCalledWith(42, {
				...updateData,
				isSettled: true
			});
		});

		it('preserves isSettled=false when passed', async () => {
			await actions.saveEdit(42, updateData, false);

			expect(updateTransaction).toHaveBeenCalledWith(42, {
				...updateData,
				isSettled: false
			});
		});

		it('reloads transactions and available months', async () => {
			await actions.saveEdit(42, updateData, false);

			expect(getTransactionsByMonth).toHaveBeenCalledWith('2026-01');
			expect(getAvailableMonths).toHaveBeenCalled();
			expect(reloadFn).toHaveBeenCalled();
		});

		it('toasts success', async () => {
			await actions.saveEdit(42, updateData, false);

			expect(toast.success).toHaveBeenCalledWith('Transaction updated');
		});

		it('returns true on success', async () => {
			const result = await actions.saveEdit(42, updateData, false);

			expect(result).toBe(true);
		});

		it('returns false on failure', async () => {
			vi.mocked(updateTransaction).mockRejectedValueOnce(new Error('fail'));

			const result = await actions.saveEdit(42, updateData, false);

			expect(result).toBe(false);
		});

		it('calls handleError on failure', async () => {
			const error = new Error('update fail');
			vi.mocked(updateTransaction).mockRejectedValueOnce(error);

			await actions.saveEdit(42, updateData, false);

			expect(handleError).toHaveBeenCalledWith(error, {
				context: 'saveEdit',
				userMessage: 'Failed to update transaction'
			});
		});
	});

	// ─── deleteTransaction ─────────────────────────────────────────────

	describe('deleteTransaction', () => {
		it('calls softDeleteTransaction with the id', async () => {
			await actions.deleteTransaction(99);

			expect(softDeleteTransaction).toHaveBeenCalledWith(99);
		});

		it('reloads transactions and available months', async () => {
			await actions.deleteTransaction(99);

			expect(getTransactionsByMonth).toHaveBeenCalledWith('2026-01');
			expect(getAvailableMonths).toHaveBeenCalled();
			expect(reloadFn).toHaveBeenCalled();
		});

		it('captures deleted transaction for undo', async () => {
			await actions.deleteTransaction(99);

			expect(undoStore.capture).toHaveBeenCalled();
		});

		it('calls handleError on failure', async () => {
			const error = new Error('delete fail');
			vi.mocked(softDeleteTransaction).mockRejectedValueOnce(error);

			await actions.deleteTransaction(99);

			expect(handleError).toHaveBeenCalledWith(error, {
				context: 'deleteTransaction',
				userMessage: 'Failed to delete transaction'
			});
		});
	});

	// ─── bulkDelete ────────────────────────────────────────────────────

	describe('bulkDelete', () => {
		it('calls softDeleteTransactions with all ids', async () => {
			await actions.bulkDelete([1, 2, 3]);

			expect(softDeleteTransactions).toHaveBeenCalledWith([1, 2, 3]);
		});

		it('reloads data including allTransactions when available', async () => {
			const actionsWithAll = setupDashboardActions({
				getCurrentMonth: () => '2026-01',
				hasAllTransactions: () => true,
				reload: reloadFn
			});

			await actionsWithAll.bulkDelete([1, 2]);

			expect(getAllTransactions).toHaveBeenCalled();
		});

		it('captures deleted transactions for undo', async () => {
			await actions.bulkDelete([1, 2, 3]);

			expect(undoStore.capture).toHaveBeenCalled();
		});

		it('calls handleError on failure', async () => {
			const error = new Error('bulk delete fail');
			vi.mocked(softDeleteTransactions).mockRejectedValueOnce(error);

			await actions.bulkDelete([1, 2]);

			expect(handleError).toHaveBeenCalledWith(error, {
				context: 'bulkDelete',
				userMessage: 'Failed to delete transactions'
			});
		});
	});

	// ─── bulkCategoryChange ────────────────────────────────────────────

	describe('bulkCategoryChange', () => {
		const categories = [
			{ id: 1, name: 'Groceries', isActive: true, sortOrder: 0, isEssential: true },
			{ id: 2, name: 'Restaurants', isActive: true, sortOrder: 1, isEssential: false }
		] as any[];

		it('calls bulkUpdateCategory with ids and categoryId', async () => {
			await actions.bulkCategoryChange([10, 20], 2, categories);

			expect(bulkUpdateCategory).toHaveBeenCalledWith([10, 20], 2);
		});

		it('reloads transactions', async () => {
			await actions.bulkCategoryChange([10], 1, categories);

			expect(getTransactionsByMonth).toHaveBeenCalledWith('2026-01');
			expect(reloadFn).toHaveBeenCalled();
		});

		it('toasts singular message with category name for 1 item', async () => {
			await actions.bulkCategoryChange([10], 2, categories);

			expect(toast.success).toHaveBeenCalledWith('Category changed to Restaurants');
		});

		it('toasts plural message with category name for multiple items', async () => {
			await actions.bulkCategoryChange([10, 20, 30], 1, categories);

			expect(toast.success).toHaveBeenCalledWith('3 transactions moved to Groceries');
		});

		it('uses fallback category name when category not found', async () => {
			await actions.bulkCategoryChange([10], 999, categories);

			expect(toast.success).toHaveBeenCalledWith('Category changed to selected category');
		});

		it('loads allTransactions when hasAllTransactions is true', async () => {
			const actionsWithAll = setupDashboardActions({
				getCurrentMonth: () => '2026-01',
				hasAllTransactions: () => true,
				reload: reloadFn
			});

			await actionsWithAll.bulkCategoryChange([10], 1, categories);

			expect(getAllTransactions).toHaveBeenCalled();
		});

		it('calls handleError on failure', async () => {
			const error = new Error('bulk category fail');
			vi.mocked(bulkUpdateCategory).mockRejectedValueOnce(error);

			await actions.bulkCategoryChange([10], 1, categories);

			expect(handleError).toHaveBeenCalledWith(error, {
				context: 'bulkCategoryChange',
				userMessage: 'Failed to update categories'
			});
		});
	});

	// ─── splitTransaction ──────────────────────────────────────────────

	describe('splitTransaction', () => {
		const splits = [
			{ categoryId: 1, amount: 30 },
			{ categoryId: 2, amount: 20 }
		];

		it('calls store splitTransaction with id and splits', async () => {
			await actions.splitTransaction(42, splits);

			expect(splitTransaction).toHaveBeenCalledWith(42, splits);
		});

		it('reloads transactions', async () => {
			await actions.splitTransaction(42, splits);

			expect(getTransactionsByMonth).toHaveBeenCalledWith('2026-01');
			expect(reloadFn).toHaveBeenCalled();
		});

		it('loads allTransactions when hasAllTransactions is true', async () => {
			const actionsWithAll = setupDashboardActions({
				getCurrentMonth: () => '2026-01',
				hasAllTransactions: () => true,
				reload: reloadFn
			});

			await actionsWithAll.splitTransaction(42, splits);

			expect(getAllTransactions).toHaveBeenCalled();
		});

		it('toasts with split count', async () => {
			await actions.splitTransaction(42, splits);

			expect(toast.success).toHaveBeenCalledWith('Transaction split across 2 categories');
		});

		it('returns true on success', async () => {
			const result = await actions.splitTransaction(42, splits);

			expect(result).toBe(true);
		});

		it('returns false on failure', async () => {
			vi.mocked(splitTransaction).mockRejectedValueOnce(new Error('fail'));

			const result = await actions.splitTransaction(42, splits);

			expect(result).toBe(false);
		});

		it('uses error.message for user message on failure (for validation errors)', async () => {
			const error = new Error('Split amounts must equal original transaction amount');
			vi.mocked(splitTransaction).mockRejectedValueOnce(error);

			await actions.splitTransaction(42, splits);

			expect(handleError).toHaveBeenCalledWith(error, {
				context: 'splitTransaction',
				userMessage: 'Split amounts must equal original transaction amount'
			});
		});

		it('falls back to generic message for non-Error failures', async () => {
			vi.mocked(splitTransaction).mockRejectedValueOnce('string error');

			await actions.splitTransaction(42, splits);

			expect(handleError).toHaveBeenCalledWith('string error', {
				context: 'splitTransaction',
				userMessage: 'Failed to split transaction'
			});
		});
	});

	// ─── cancelSubscription ────────────────────────────────────────────

	describe('cancelSubscription', () => {
		it('calls settings cancelSubscription with merchant name', async () => {
			await actions.cancelSubscription('Netflix');

			expect(cancelSubscription).toHaveBeenCalledWith('Netflix', undefined);
		});

		it('calls settings cancelSubscription with merchant and amount', async () => {
			await actions.cancelSubscription('Apple', 2.99);

			expect(cancelSubscription).toHaveBeenCalledWith('Apple', 2.99);
		});

		it('toasts success with merchant name', async () => {
			await actions.cancelSubscription('Netflix');

			expect(toast.success).toHaveBeenCalledWith('Netflix marked as cancelled');
		});

		it('does NOT call reloadAfterMutation (no transaction reload)', async () => {
			await actions.cancelSubscription('Netflix');

			expect(getTransactionsByMonth).not.toHaveBeenCalled();
			expect(getAvailableMonths).not.toHaveBeenCalled();
			expect(reloadFn).not.toHaveBeenCalled();
		});

		it('calls handleError on failure', async () => {
			const error = new Error('cancel fail');
			vi.mocked(cancelSubscription).mockRejectedValueOnce(error);

			await actions.cancelSubscription('Netflix');

			expect(handleError).toHaveBeenCalledWith(error, {
				context: 'cancelSubscription',
				userMessage: 'Failed to cancel subscription'
			});
		});
	});

	// ─── reloadAfterMutation (indirect tests via context) ──────────────

	describe('context behavior', () => {
		it('uses getCurrentMonth() at call time, not setup time', async () => {
			let month = '2026-01';
			const dynamicActions = setupDashboardActions({
				getCurrentMonth: () => month,
				hasAllTransactions: () => false,
				reload: reloadFn
			});

			// Change month before calling
			month = '2026-02';

			await dynamicActions.addTransaction({
				date: new Date(),
				merchant: 'Test',
				amount: 10,
				categoryId: 1,
				isShared: false,
				isSettled: false,
				splitType: 'percentage',
				splitValue: 0.5,
				isEssential: false,
				isSubscription: false
			} as any);

			expect(getTransactionsByMonth).toHaveBeenCalledWith('2026-02');
		});

		it('reload receives transactions and availableMonths', async () => {
			const mockTxns = [{ id: 1, merchant: 'Test' }];
			const mockMonths = ['2026-01', '2025-12'];
			vi.mocked(getTransactionsByMonth).mockResolvedValueOnce(mockTxns as any);
			vi.mocked(getAvailableMonths).mockResolvedValueOnce(mockMonths);

			await actions.deleteTransaction(1);

			expect(reloadFn).toHaveBeenCalledWith({
				transactions: mockTxns,
				availableMonths: mockMonths
			});
		});
	});
});
