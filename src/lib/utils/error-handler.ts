import { toast } from '$lib/stores/toast';
import {
	formatErrorMessage,
	isStorageError,
	isValidationError,
	isTransactionError
} from './errors';

interface ErrorHandlerOptions {
	/** User-facing message (overrides auto-detected message) */
	userMessage?: string;
	/** Show toast notification (default: true) */
	showToast?: boolean;
	/** Log to console (default: true) */
	logToConsole?: boolean;
	/** Toast duration override in ms */
	toastDuration?: number;
	/** Calling context for log messages (e.g., "handleAddTransaction") */
	context?: string;
}

/**
 * Centralized error handler.
 * Logs the error and shows a user-facing toast notification.
 */
export function handleError(
	error: unknown,
	options: ErrorHandlerOptions = {}
): void {
	const {
		userMessage,
		showToast = true,
		logToConsole = true,
		toastDuration,
		context
	} = options;

	if (logToConsole) {
		const formatted = formatErrorMessage(error);
		const logMessage = context ? `[${context}] ${formatted}` : formatted;
		console.error(logMessage, error);
	}

	if (showToast) {
		const message = userMessage ?? getDefaultMessage(error);
		toast.error(message, toastDuration);
	}
}

function getDefaultMessage(error: unknown): string {
	if (isValidationError(error)) {
		return error.message;
	}

	if (isStorageError(error)) {
		const messages: Record<string, string> = {
			READ: 'Failed to load data',
			WRITE: 'Failed to save data',
			BACKUP: 'Failed to create backup',
			RESTORE: 'Failed to restore data',
			INIT: 'Failed to initialize storage'
		};
		return messages[error.code] ?? 'Storage operation failed';
	}

	if (isTransactionError(error)) {
		const messages: Record<string, string> = {
			ADD: 'Failed to add transaction',
			UPDATE: 'Failed to update transaction',
			DELETE: 'Failed to delete transaction',
			SPLIT: 'Failed to split transaction',
			BULK_DELETE: 'Failed to delete transactions',
			BULK_UPDATE: 'Failed to update transactions'
		};
		return messages[error.operation] ?? 'Transaction operation failed';
	}

	return 'An unexpected error occurred';
}
