import type { Transaction, Category } from '$lib/db';
import {
	addTransaction as storeAddTransaction,
	addSplitTransaction as storeAddSplitTransaction,
	updateTransaction,
	bulkUpdateCategory,
	bulkAddTag as storeBulkAddTag,
	bulkRemoveTag as storeBulkRemoveTag,
	splitTransaction as storeSplitTransaction,
	updateSplitGroup as storeUpdateSplitGroup,
	type SplitGroupUpdate,
	getTransactionsByMonth,
	getTransactionsByMonthFromCache,
	getAllTransactions,
	getAvailableMonths,
	softDeleteTransaction,
	softDeleteTransactions
} from '$lib/stores/transactions';
import { cancelSubscription as storeCancelSubscription } from '$lib/stores/settings';
import { toast } from '$lib/stores/toast';
import { handleError } from '$lib/utils/error-handler';
import { undoStore } from '$lib/stores/undo';
import { sumCurrency } from '$lib/utils/currency';

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

export interface DashboardContext {
	getCurrentMonth: () => string;
	hasAllTransactions: () => boolean;
	reload: (data: {
		transactions: Transaction[];
		availableMonths: string[];
		allTransactions?: Transaction[];
	}) => void;
}

export function setupDashboardActions(ctx: DashboardContext) {
	async function reloadAfterMutation(): Promise<void> {
		const month = ctx.getCurrentMonth();
		const cachedTransactions = getTransactionsByMonthFromCache(month);
		const [transactions, availableMonths, allTransactions] = await Promise.all([
			cachedTransactions ?? getTransactionsByMonth(month),
			getAvailableMonths(),
			ctx.hasAllTransactions() ? getAllTransactions() : undefined
		]);
		const data: {
			transactions: Transaction[];
			availableMonths: string[];
			allTransactions?: Transaction[];
		} = { transactions, availableMonths };
		if (allTransactions) data.allTransactions = allTransactions;
		ctx.reload(data);
	}

	return {
		async addTransaction(data: AddTransactionData): Promise<void> {
			try {
				await storeAddTransaction(data);
				await reloadAfterMutation();
				toast.success('Transaction added');
			} catch (error) {
				handleError(error, {
					context: 'addTransaction',
					userMessage: 'Failed to add transaction'
				});
			}
		},

		async addSplitTransactions(data: SplitTransactionFormData): Promise<void> {
			try {
				await storeAddSplitTransaction(
					{
						date: data.date,
						merchant: data.merchant,
						amount: sumCurrency(data.splits.map((split) => split.amount)),
						categoryId: data.splits[0].categoryId,
						isShared: data.isShared,
						isSettled: data.isSettled,
						splitType: data.splitType,
						splitValue: data.splitValue,
						isEssential: data.isEssential,
						isSubscription: data.isSubscription,
						subscriptionFrequency: data.subscriptionFrequency
					},
					data.splits
				);

				await reloadAfterMutation();
				toast.success(`Transaction split across ${data.splits.length} categories`);
			} catch (error) {
				handleError(error, {
					context: 'addSplitTransactions',
					userMessage: 'Failed to add split transaction'
				});
			}
		},

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

		async deleteTransaction(id: number): Promise<void> {
			try {
				const deleted = await softDeleteTransaction(id);
				await reloadAfterMutation();
				if (deleted) {
					undoStore.capture([deleted]);
				}
			} catch (error) {
				handleError(error, {
					context: 'deleteTransaction',
					userMessage: 'Failed to delete transaction'
				});
			}
		},

		async bulkDelete(ids: number[]): Promise<void> {
			try {
				const deleted = await softDeleteTransactions(ids);
				await reloadAfterMutation();
				if (deleted.length > 0) {
					undoStore.capture(deleted);
				}
			} catch (error) {
				handleError(error, {
					context: 'bulkDelete',
					userMessage: 'Failed to delete transactions'
				});
			}
		},

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

		async splitTransaction(
			id: number,
			splits: { categoryId: number; amount: number }[]
		): Promise<boolean> {
			try {
				await storeSplitTransaction(id, splits);
				await reloadAfterMutation();
				toast.success(`Transaction split across ${splits.length} categories`);
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
