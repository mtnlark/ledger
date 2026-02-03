import type { Transaction, Category } from '$lib/db';
import {
	addTransaction as storeAddTransaction,
	updateTransaction,
	deleteTransaction as storeDeleteTransaction,
	bulkDeleteTransactions,
	bulkUpdateCategory,
	splitTransaction as storeSplitTransaction,
	getTransactionsByMonth,
	getAllTransactions,
	getAvailableMonths
} from '$lib/stores/transactions';
import { cancelSubscription as storeCancelSubscription } from '$lib/stores/settings';
import { toast } from '$lib/stores/toast';
import { handleError } from '$lib/utils/error-handler';

/**
 * Data shape for adding a single transaction.
 * Compatible with both TransactionFormData and QuickAddData.
 */
export interface AddTransactionData {
	date: Date;
	merchant: string;
	amount: number;
	categoryId: number;
	isShared: boolean;
	isSettled: boolean;
	splitType: 'percentage' | 'fixed';
	splitValue: number;
	notes?: string;
	isEssential: boolean;
	isSubscription: boolean;
	subscriptionFrequency?: 'monthly' | 'annual';
}

/**
 * Data shape for adding multiple split transactions from the form.
 */
export interface SplitTransactionFormData {
	date: Date;
	merchant: string;
	isShared: boolean;
	isSettled: boolean;
	splitType: 'percentage' | 'fixed';
	splitValue: number;
	isEssential: boolean;
	isSubscription: boolean;
	subscriptionFrequency?: 'monthly' | 'annual';
	splits: { categoryId: number; amount: number }[];
}

/**
 * Data shape for updating an existing transaction.
 */
export interface TransactionUpdateData {
	date: Date;
	merchant: string;
	amount: number;
	categoryId: number;
	isShared: boolean;
	splitType: 'percentage' | 'fixed';
	splitValue: number;
	notes?: string;
	isEssential: boolean;
	isSubscription: boolean;
	subscriptionFrequency?: 'monthly' | 'annual';
}

/**
 * Context provided to the dashboard actions factory.
 * Uses accessor functions so state is read at call time, not setup time.
 */
export interface DashboardContext {
	getCurrentMonth: () => string;
	hasAllTransactions: () => boolean;
	reload: (data: {
		transactions: Transaction[];
		availableMonths: string[];
		allTransactions?: Transaction[];
	}) => void;
}

/**
 * Factory that creates all transaction operation handlers for the Dashboard.
 *
 * Each handler follows the pattern:
 *   try { call store -> reloadAfterMutation() -> toast.success }
 *   catch { handleError(...) }
 *
 * The factory receives accessors for current state and a reload callback,
 * so it doesn't own any state itself.
 */
export function setupDashboardActions(ctx: DashboardContext) {
	/**
	 * Reload transactions and available months after a mutation.
	 * Also reloads allTransactions if they were previously loaded.
	 */
	async function reloadAfterMutation(): Promise<void> {
		const month = ctx.getCurrentMonth();
		const [transactions, availableMonths] = await Promise.all([
			getTransactionsByMonth(month),
			getAvailableMonths()
		]);
		const data: {
			transactions: Transaction[];
			availableMonths: string[];
			allTransactions?: Transaction[];
		} = { transactions, availableMonths };
		if (ctx.hasAllTransactions()) {
			data.allTransactions = await getAllTransactions();
		}
		ctx.reload(data);
	}

	return {
		/**
		 * Add a single transaction.
		 * Used by both the inline form and QuickAddFAB.
		 */
		async addTransaction(data: AddTransactionData): Promise<void> {
			try {
				await storeAddTransaction({
					...data,
					isSettled: data.isSettled
				});
				await reloadAfterMutation();
				toast.success('Transaction added');
			} catch (error) {
				handleError(error, {
					context: 'addTransaction',
					userMessage: 'Failed to add transaction'
				});
			}
		},

		/**
		 * Add multiple split transactions from the form.
		 * Creates each split as a separate transaction.
		 * Uses Promise.allSettled to handle partial success gracefully.
		 */
		async addSplitTransactions(data: SplitTransactionFormData): Promise<void> {
			const promises = data.splits.map((split) =>
				storeAddTransaction({
					date: data.date,
					merchant: data.merchant,
					amount: split.amount,
					categoryId: split.categoryId,
					isShared: data.isShared,
					isSettled: data.isSettled,
					splitType: data.splitType,
					splitValue: data.splitValue,
					isEssential: data.isEssential,
					isSubscription: data.isSubscription,
					subscriptionFrequency: data.subscriptionFrequency
				})
			);

			const results = await Promise.allSettled(promises);
			const succeeded = results.filter((r) => r.status === 'fulfilled').length;
			const failed = results.filter((r) => r.status === 'rejected').length;

			// Always reload to reflect any successful additions
			await reloadAfterMutation();

			if (failed === 0) {
				toast.success(`${succeeded} transactions added`);
			} else if (succeeded === 0) {
				// All failed - get first error for context
				const firstError = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
				handleError(firstError.reason, {
					context: 'addSplitTransactions',
					userMessage: 'Failed to add transactions'
				});
			} else {
				// Partial success
				toast.warning(`${succeeded} of ${data.splits.length} transactions added. ${failed} failed.`);
				// Log the failures for debugging
				results.forEach((r, i) => {
					if (r.status === 'rejected') {
						console.error(`Split transaction ${i + 1} failed:`, r.reason);
					}
				});
			}
		},

		/**
		 * Save edits to an existing transaction.
		 * @param currentSettled - the isSettled value from the transaction being edited
		 * @returns true on success, false on error
		 */
		async saveEdit(
			id: number,
			data: TransactionUpdateData,
			currentSettled: boolean
		): Promise<boolean> {
			try {
				await updateTransaction(id, {
					...data,
					isSettled: currentSettled
				});
				await reloadAfterMutation();
				toast.success('Transaction updated');
				return true;
			} catch (error) {
				handleError(error, {
					context: 'saveEdit',
					userMessage: 'Failed to update transaction'
				});
				return false;
			}
		},

		/**
		 * Delete a single transaction.
		 * Note: the confirm dialog is managed by the page, not here.
		 */
		async deleteTransaction(id: number): Promise<void> {
			try {
				await storeDeleteTransaction(id);
				await reloadAfterMutation();
				toast.success('Transaction deleted');
			} catch (error) {
				handleError(error, {
					context: 'deleteTransaction',
					userMessage: 'Failed to delete transaction'
				});
			}
		},

		/**
		 * Delete multiple transactions at once.
		 * Note: the confirm dialog is managed by the page, not here.
		 */
		async bulkDelete(ids: number[]): Promise<void> {
			try {
				await bulkDeleteTransactions(ids);
				await reloadAfterMutation();
				toast.success(
					ids.length === 1
						? 'Transaction deleted'
						: `${ids.length} transactions deleted`
				);
			} catch (error) {
				handleError(error, {
					context: 'bulkDelete',
					userMessage: 'Failed to delete transactions'
				});
			}
		},

		/**
		 * Change the category for multiple transactions.
		 * @param categories - full category list for looking up the name for the toast
		 */
		async bulkCategoryChange(
			ids: number[],
			categoryId: number,
			categories: Category[]
		): Promise<void> {
			try {
				await bulkUpdateCategory(ids, categoryId);
				await reloadAfterMutation();
				const category = categories.find((c) => c.id === categoryId);
				const categoryName = category?.name || 'selected category';
				toast.success(
					ids.length === 1
						? `Category changed to ${categoryName}`
						: `${ids.length} transactions moved to ${categoryName}`
				);
			} catch (error) {
				handleError(error, {
					context: 'bulkCategoryChange',
					userMessage: 'Failed to update categories'
				});
			}
		},

		/**
		 * Split a transaction into multiple category-based parts.
		 * Preserves error.message for split validation errors.
		 * @returns true on success, false on error
		 */
		async splitTransaction(
			id: number,
			splits: { categoryId: number; amount: number }[]
		): Promise<boolean> {
			try {
				await storeSplitTransaction(id, splits);
				await reloadAfterMutation();
				toast.success(`Transaction split into ${splits.length} parts`);
				return true;
			} catch (error) {
				handleError(error, {
					context: 'splitTransaction',
					userMessage:
						error instanceof Error
							? error.message
							: 'Failed to split transaction'
				});
				return false;
			}
		},

		/**
		 * Cancel a subscription. This is a settings update, not a transaction mutation,
		 * so it does NOT call reloadAfterMutation.
		 */
		async cancelSubscription(merchant: string): Promise<void> {
			try {
				await storeCancelSubscription(merchant);
				toast.success(`${merchant} marked as cancelled`);
			} catch (error) {
				handleError(error, {
					context: 'cancelSubscription',
					userMessage: 'Failed to cancel subscription'
				});
			}
		}
	};
}
