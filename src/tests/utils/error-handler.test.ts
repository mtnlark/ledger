import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock toast before importing error-handler
vi.mock('$lib/stores/toast', () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
		info: vi.fn(),
		warning: vi.fn()
	}
}));

import { handleError } from '$lib/utils/error-handler';
import { toast } from '$lib/stores/toast';
import { StorageError, TransactionError, ValidationError } from '$lib/utils/errors';

describe('handleError', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	it('logs error to console with context', () => {
		const error = new Error('something broke');
		handleError(error, { context: 'handleAddTransaction' });
		expect(console.error).toHaveBeenCalledWith(
			expect.stringContaining('[handleAddTransaction]'),
			error
		);
	});

	it('shows toast with user message', () => {
		handleError(new Error('fail'), { userMessage: 'Custom message' });
		expect(toast.error).toHaveBeenCalledWith('Custom message', undefined);
	});

	it('uses TransactionError operation for default message', () => {
		handleError(new TransactionError('ADD', 'db error'));
		expect(toast.error).toHaveBeenCalledWith('Failed to add transaction', undefined);
	});

	it('uses StorageError code for default message', () => {
		handleError(new StorageError('WRITE', 'disk full'));
		expect(toast.error).toHaveBeenCalledWith('Failed to save data', undefined);
	});

	it('uses ValidationError message directly (user-friendly)', () => {
		handleError(new ValidationError('amount', 'Amount must be positive'));
		expect(toast.error).toHaveBeenCalledWith('Amount must be positive', undefined);
	});

	it('suppresses toast when showToast is false', () => {
		handleError(new Error('quiet'), { showToast: false });
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('suppresses console when logToConsole is false', () => {
		handleError(new Error('quiet'), { logToConsole: false });
		expect(console.error).not.toHaveBeenCalled();
	});

	it('handles unknown error types', () => {
		handleError('just a string');
		expect(toast.error).toHaveBeenCalledWith('An unexpected error occurred', undefined);
	});

	it('passes toastDuration to toast.error', () => {
		handleError(new Error('fail'), { userMessage: 'Oops', toastDuration: 8000 });
		expect(toast.error).toHaveBeenCalledWith('Oops', 8000);
	});
});
