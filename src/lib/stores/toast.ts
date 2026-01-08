import { writable, derived } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
	id: string;
	message: string;
	type: ToastType;
	duration: number;
}

interface ToastState {
	toasts: Toast[];
}

function createToastStore() {
	const { subscribe, update } = writable<ToastState>({ toasts: [] });

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
			setTimeout(() => {
				dismiss(id);
			}, duration);
		}

		return id;
	}

	function dismiss(id: string) {
		update((state) => ({
			toasts: state.toasts.filter((t) => t.id !== id)
		}));
	}

	function clear() {
		update(() => ({ toasts: [] }));
	}

	return {
		subscribe,
		add,
		dismiss,
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
