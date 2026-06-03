import type { Transaction, Category } from '$lib/db';
import {
	addTransaction as storeAddTransaction,
	updateTransaction,
	deleteTransaction as storeDeleteTransaction,
	bulkDeleteTransactions,
	bulkUpdateCategory,
	bulkAddTag as storeBulkAddTag,
	bulkRemoveTag as storeBulkRemoveTag,
	splitTransaction as storeSplitTransaction,
	updateSplitGroup as storeUpdateSplitGroup,
	type SplitGroupUpdate,
	getTransactionsByMonth,
	getAllTransactions,
	getAvailableMonths,
	softDeleteTransaction,
	softDeleteTransactions
} from '$lib/stores/transactions';
import { cancelSubscription as storeCancelSubscription } from '$lib/stores/settings';
import { toast } from '$lib/stores/toast';
import { handleError } from '$lib/utils/error-handler';
import { undoStore } from '$lib/stores/undo';

/**
 * Data shape for adding a single transaction.
 * Compatible with both TransactionFormData and QuickAddData.
 */
interface AddTransactionData {
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
	subscriptionFrequency?: 'monthly' | 'semi-annual' | 'annual';
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
	subscriptionFrequency?: 'monthly' | 'semi-annual' | 'annual';
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
	subscriptionFrequency?: 'monthly' | 'semi-annual' | 'annual';
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
		 * Add a split transaction from the form.
		 * Creates a parent (isSplitParent) then linked children via splitTransaction,
		 * so each child carries parentTransactionId for proper visit counting.
		 */
		async addSplitTransactions(data: SplitTransactionFormData): Promise<void> {
			try {
				const totalAmount = data.splits.reduce((sum, s) => sum + s.amount, 0);

				// Create the parent transaction with the total amount
				const parentId = await storeAddTransaction({
					date: data.date,
					merchant: data.merchant,
					amount: totalAmount,
					categoryId: data.splits[0].categoryId,
					isShared: data.isShared,
					isSettled: data.isSettled,
					splitType: data.splitType,
					splitValue: data.splitValue,
					isEssential: data.isEssential,
					isSubscription: data.isSubscription,
					subscriptionFrequency: data.subscriptionFrequency
				});

				// Split into linked children (marks parent as isSplitParent)
				await storeSplitTransaction(parentId, data.splits);

				await reloadAfterMutation();
				toast.success(`Transaction split into ${data.splits.length} parts`);
			} catch (error) {
				handleError(error, {
					context: 'addSplitTransactions',
					userMessage: 'Failed to add split transaction'
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
		 * Delete a single transaction with undo support.
		 * Uses soft delete so transaction can be restored within undo window.
		 * Note: the confirm dialog is managed by the page, not here.
		 */
		async deleteTransaction(id: number): Promise<void> {
			try {
				const deleted = await softDeleteTransaction(id);
				await reloadAfterMutation();
				if (deleted) {
					undoStore.capture([deleted]);
				}
				// Undo toast handles messaging - no toast.success() here
			} catch (error) {
				handleError(error, {
					context: 'deleteTransaction',
					userMessage: 'Failed to delete transaction'
				});
			}
		},

		/**
		 * Delete multiple transactions at once with undo support.
		 * Uses soft delete so transactions can be restored within undo window.
		 * Note: the confirm dialog is managed by the page, not here.
		 */
		async bulkDelete(ids: number[]): Promise<void> {
			try {
				const deleted = await softDeleteTransactions(ids);
				await reloadAfterMutation();
				if (deleted.length > 0) {
					undoStore.capture(deleted);
				}
				// Undo toast handles messaging - no toast.success() here
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
		 * Edit an existing split as a whole: update group-level fields and the
		 * category breakdown in one step.
		 * @returns true on success, false on error
		 */
		async updateSplitGroup(
			parentId: number,
			shared: SplitGroupUpdate,
			lines: { categoryId: number; amount: number; notes?: string }[]
		): Promise<boolean> {
			try {
				await storeUpdateSplitGroup(parentId, shared, lines);
				await reloadAfterMutation();
				toast.success('Split updated');
				return true;
			} catch (error) {
				handleError(error, {
					context: 'updateSplitGroup',
					userMessage:
						error instanceof Error ? error.message : 'Failed to update split'
				});
				return false;
			}
		},

		/**
		 * Add a tag to multiple transactions' notes.
		 */
		async bulkAddTag(ids: number[], tag: string): Promise<void> {
			try {
				await storeBulkAddTag(ids, tag);
				await reloadAfterMutation();
				toast.success(
					ids.length === 1
						? `Tag #${tag} added`
						: `Tag #${tag} added to ${ids.length} transactions`
				);
			} catch (error) {
				handleError(error, {
					context: 'bulkAddTag',
					userMessage: 'Failed to add tag'
				});
			}
		},

		/**
		 * Remove a tag from multiple transactions' notes.
		 */
		async bulkRemoveTag(ids: number[], tag: string): Promise<void> {
			try {
				await storeBulkRemoveTag(ids, tag);
				await reloadAfterMutation();
				toast.success(
					ids.length === 1
						? `Tag #${tag} removed`
						: `Tag #${tag} removed from ${ids.length} transactions`
				);
			} catch (error) {
				handleError(error, {
					context: 'bulkRemoveTag',
					userMessage: 'Failed to remove tag'
				});
			}
		},

		/**
		 * Cancel a subscription. This is a settings update, not a transaction mutation,
		 * so it does NOT call reloadAfterMutation.
		 * @param amount - Optional amount for targeted cancellation of a specific subscription
		 */
		async cancelSubscription(merchant: string, amount?: number): Promise<void> {
			try {
				await storeCancelSubscription(merchant, amount);
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
