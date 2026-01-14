import { describe, it, expect } from 'vitest';
import {
	StorageError,
	ValidationError,
	TransactionError,
	createStorageError,
	createValidationError,
	createTransactionError,
	isStorageError,
	isValidationError,
	isTransactionError,
	formatErrorMessage
} from './errors';

describe('errors', () => {
	describe('StorageError', () => {
		it('creates error with code and original error', () => {
			const original = new Error('Disk full');
			const error = new StorageError('WRITE', 'Failed to save data', original);

			expect(error.code).toBe('WRITE');
			expect(error.message).toBe('Failed to save data');
			expect(error.originalError).toBe(original);
			expect(error.name).toBe('StorageError');
		});

		it('creates error without original error', () => {
			const error = new StorageError('READ', 'File not found');

			expect(error.code).toBe('READ');
			expect(error.message).toBe('File not found');
			expect(error.originalError).toBeUndefined();
		});
	});

	describe('ValidationError', () => {
		it('creates error with field name', () => {
			const error = new ValidationError('amount', 'Amount must be positive');

			expect(error.field).toBe('amount');
			expect(error.message).toBe('Amount must be positive');
			expect(error.name).toBe('ValidationError');
		});

		it('creates error with multiple fields', () => {
			const error = new ValidationError(['amount', 'merchant'], 'Required fields missing');

			expect(error.field).toEqual(['amount', 'merchant']);
			expect(error.message).toBe('Required fields missing');
		});
	});

	describe('TransactionError', () => {
		it('creates error with operation name', () => {
			const error = new TransactionError('ADD', 'Failed to add transaction');

			expect(error.operation).toBe('ADD');
			expect(error.message).toBe('Failed to add transaction');
			expect(error.name).toBe('TransactionError');
		});

		it('creates error with transaction ID', () => {
			const error = new TransactionError('DELETE', 'Transaction not found', 123);

			expect(error.operation).toBe('DELETE');
			expect(error.transactionId).toBe(123);
		});
	});

	describe('createStorageError', () => {
		it('creates storage error from unknown error', () => {
			const error = createStorageError('BACKUP', new Error('Backup failed'));

			expect(error.code).toBe('BACKUP');
			expect(error.message).toBe('Backup failed');
		});

		it('creates storage error from string', () => {
			const error = createStorageError('READ', 'Something went wrong');

			expect(error.code).toBe('READ');
			expect(error.message).toBe('Something went wrong');
		});

		it('creates storage error from non-error object', () => {
			const error = createStorageError('WRITE', { foo: 'bar' });

			expect(error.code).toBe('WRITE');
			expect(error.message).toBe('Unknown storage error');
		});
	});

	describe('createValidationError', () => {
		it('creates validation error', () => {
			const error = createValidationError('email', 'Invalid email format');

			expect(error.field).toBe('email');
			expect(error.message).toBe('Invalid email format');
		});
	});

	describe('createTransactionError', () => {
		it('creates transaction error', () => {
			const error = createTransactionError('UPDATE', 'Update failed', 456);

			expect(error.operation).toBe('UPDATE');
			expect(error.transactionId).toBe(456);
		});
	});

	describe('type guards', () => {
		it('isStorageError returns true for StorageError', () => {
			const error = new StorageError('READ', 'Error');
			expect(isStorageError(error)).toBe(true);
		});

		it('isStorageError returns false for other errors', () => {
			expect(isStorageError(new Error('Generic'))).toBe(false);
			expect(isStorageError(new ValidationError('f', 'm'))).toBe(false);
		});

		it('isValidationError returns true for ValidationError', () => {
			const error = new ValidationError('field', 'Error');
			expect(isValidationError(error)).toBe(true);
		});

		it('isValidationError returns false for other errors', () => {
			expect(isValidationError(new Error('Generic'))).toBe(false);
		});

		it('isTransactionError returns true for TransactionError', () => {
			const error = new TransactionError('ADD', 'Error');
			expect(isTransactionError(error)).toBe(true);
		});

		it('isTransactionError returns false for other errors', () => {
			expect(isTransactionError(new Error('Generic'))).toBe(false);
		});
	});

	describe('formatErrorMessage', () => {
		it('formats StorageError with code', () => {
			const error = new StorageError('WRITE', 'Disk full');
			expect(formatErrorMessage(error)).toBe('[Storage:WRITE] Disk full');
		});

		it('formats ValidationError with field', () => {
			const error = new ValidationError('amount', 'Must be positive');
			expect(formatErrorMessage(error)).toBe('[Validation:amount] Must be positive');
		});

		it('formats ValidationError with multiple fields', () => {
			const error = new ValidationError(['a', 'b'], 'Required');
			expect(formatErrorMessage(error)).toBe('[Validation:a,b] Required');
		});

		it('formats TransactionError with operation', () => {
			const error = new TransactionError('DELETE', 'Not found', 123);
			expect(formatErrorMessage(error)).toBe('[Transaction:DELETE:123] Not found');
		});

		it('formats generic Error', () => {
			const error = new Error('Something went wrong');
			expect(formatErrorMessage(error)).toBe('Something went wrong');
		});

		it('handles non-Error objects', () => {
			expect(formatErrorMessage('string error')).toBe('Unknown error');
			expect(formatErrorMessage(null)).toBe('Unknown error');
			expect(formatErrorMessage(undefined)).toBe('Unknown error');
		});
	});
});
