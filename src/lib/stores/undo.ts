import { writable, get } from 'svelte/store';
import type { Transaction } from '$lib/db';
import { restoreTransactions } from './transactions';
import { toast } from './toast';

/**
 * Undo window duration in milliseconds.
 * User has this long to click "Undo" before the toast auto-dismisses.
 */
export const UNDO_WINDOW_MS = 5000;

interface UndoState {
	/** The soft-deleted transactions available for undo */
	transactions: Transaction[];
	/** ID of the active undo toast (for cleanup) */
	toastId: string | null;
}

const initialState: UndoState = {
	transactions: [],
	toastId: null
};

function createUndoStore() {
	const { subscribe, set, update } = writable<UndoState>(initialState);

	return {
		subscribe,

		/**
		 * Capture soft-deleted transactions and show the undo toast.
		 * Called after softDeleteTransaction/softDeleteTransactions.
		 */
		capture(transactions: Transaction[]): void {
			if (transactions.length === 0) return;

			const message =
				transactions.length === 1
					? 'Transaction deleted'
					: `${transactions.length} transactions deleted`;

			const toastId = toast.addActionToast({
				message,
				type: 'undo',
				duration: UNDO_WINDOW_MS,
				key: 'undo', // Singleton - new deletes replace previous undo
				actionLabel: 'Undo',
				showCountdown: true,
				onAction: () => this.undo(),
				onDismiss: () => this.clear()
			});

			set({
				transactions,
				toastId
			});
		},

		/**
		 * Restore the soft-deleted transactions.
		 * Called when user clicks "Undo" button.
		 * @returns true if restore succeeded, false otherwise
		 */
		async undo(): Promise<boolean> {
			const state = get({ subscribe });
			if (state.transactions.length === 0) return false;

			const ids = state.transactions
				.map((t) => t.id)
				.filter((id): id is number => id !== undefined);

			if (ids.length === 0) return false;

			try {
				await restoreTransactions(ids);

				const message =
					state.transactions.length === 1
						? 'Transaction restored'
						: `${state.transactions.length} transactions restored`;

				toast.success(message);

				// Clear state (toast already dismissed by action handler)
				set(initialState);
				return true;
			} catch (error) {
				console.error('Failed to restore transactions:', error);
				toast.error('Failed to restore transactions');
				return false;
			}
		},

		/**
		 * Clear the undo state without restoring.
		 * Called when toast times out or is manually dismissed.
		 */
		clear(): void {
			set(initialState);
		},

		/**
		 * Check if undo is currently available.
		 */
		get canUndo(): boolean {
			return get({ subscribe }).transactions.length > 0;
		}
	};
}

export const undoStore = createUndoStore();
