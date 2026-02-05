import { writable, derived } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'undo';

export interface Toast {
	id: string;
	message: string;
	type: ToastType;
	duration: number;
	// New fields for interactive toasts
	key?: string;              // Toasts with same key replace each other
	actionLabel?: string;      // Button text (e.g., "Undo")
	onAction?: () => void;     // Called when action button clicked
	onDismiss?: () => void;    // Called when toast dismissed (timeout or X)
	showCountdown?: boolean;   // Show visual countdown progress bar
}

interface ToastState {
	toasts: Toast[];
}

function createToastStore() {
	const { subscribe, update, set } = writable<ToastState>({ toasts: [] });

	// Track timeouts so we can clear them when needed
	const timeouts = new Map<string, ReturnType<typeof setTimeout>>();

	function generateId(): string {
		return `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
	}

	function add(message: string, type: ToastType = 'info', duration: number = 3000): string {
		const id = generateId();
		const toast: Toast = { id, message, type, duration };

		update((state) => ({
			toasts: [...state.toasts, toast]
		}));

		// Auto-dismiss after duration
		if (duration > 0) {
			const timeoutId = setTimeout(() => {
				dismiss(id);
			}, duration);
			timeouts.set(id, timeoutId);
		}

		return id;
	}

	/**
	 * Add an interactive toast with action button and optional countdown.
	 * Supports singleton behavior via key - toasts with same key replace each other.
	 */
	function addActionToast(options: {
		message: string;
		type: ToastType;
		duration: number;
		key?: string;
		actionLabel: string;
		onAction: () => void;
		onDismiss?: () => void;
		showCountdown?: boolean;
	}): string {
		const id = generateId();

		// Singleton behavior: dismiss existing toast with same key
		if (options.key) {
			let existingToast: Toast | undefined;
			update((state) => {
				existingToast = state.toasts.find((t) => t.key === options.key);
				return state;
			});
			if (existingToast) {
				// Dismiss without calling onDismiss (we're replacing, not user-dismissing)
				dismissWithoutCallback(existingToast.id);
			}
		}

		const toast: Toast = {
			id,
			message: options.message,
			type: options.type,
			duration: options.duration,
			key: options.key,
			actionLabel: options.actionLabel,
			onAction: options.onAction,
			onDismiss: options.onDismiss,
			showCountdown: options.showCountdown
		};

		update((state) => ({
			toasts: [...state.toasts, toast]
		}));

		// Auto-dismiss after duration
		if (options.duration > 0) {
			const timeoutId = setTimeout(() => {
				dismiss(id);
			}, options.duration);
			timeouts.set(id, timeoutId);
		}

		return id;
	}

	/**
	 * Dismiss a toast without calling its onDismiss callback.
	 * Used when replacing a toast via key singleton behavior.
	 */
	function dismissWithoutCallback(id: string) {
		// Clear any pending timeout
		const timeoutId = timeouts.get(id);
		if (timeoutId) {
			clearTimeout(timeoutId);
			timeouts.delete(id);
		}

		update((state) => ({
			toasts: state.toasts.filter((t) => t.id !== id)
		}));
	}

	/**
	 * Dismiss a toast, calling its onDismiss callback if provided.
	 */
	function dismiss(id: string) {
		// Clear any pending timeout
		const timeoutId = timeouts.get(id);
		if (timeoutId) {
			clearTimeout(timeoutId);
			timeouts.delete(id);
		}

		// Find the toast to get its onDismiss callback
		let toastToDismiss: Toast | undefined;
		update((state) => {
			toastToDismiss = state.toasts.find((t) => t.id === id);
			return {
				toasts: state.toasts.filter((t) => t.id !== id)
			};
		});

		// Call onDismiss callback if provided
		if (toastToDismiss?.onDismiss) {
			toastToDismiss.onDismiss();
		}
	}

	function clear() {
		// Clear all timeouts
		for (const timeoutId of timeouts.values()) {
			clearTimeout(timeoutId);
		}
		timeouts.clear();

		update(() => ({ toasts: [] }));
	}

	return {
		subscribe,
		add,
		addActionToast,
		dismiss,
		dismissWithoutCallback,
		clear,
		// Convenience methods
		success: (message: string, duration?: number) => add(message, 'success', duration),
		error: (message: string, duration?: number) => add(message, 'error', duration ?? 5000),
		info: (message: string, duration?: number) => add(message, 'info', duration),
		warning: (message: string, duration?: number) => add(message, 'warning', duration ?? 4000)
	};
}

export const toast = createToastStore();

// Derived store for easy access to toast list
export const toasts = derived(toast, ($state) => $state.toasts);
