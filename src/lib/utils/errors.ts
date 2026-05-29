/**
 * Storage operation error codes
 */
type StorageErrorCode = 'READ' | 'WRITE' | 'BACKUP' | 'RESTORE' | 'INIT';

/**
 * Transaction operation types
 */
type TransactionOperation = 'ADD' | 'UPDATE' | 'DELETE' | 'SPLIT' | 'BULK_DELETE' | 'BULK_UPDATE';

/**
 * Error thrown during storage operations (file read/write, backup, etc.)
 */
export class StorageError extends Error {
	readonly name = 'StorageError';
	readonly code: StorageErrorCode;
	readonly originalError?: Error;

	constructor(code: StorageErrorCode, message: string, originalError?: Error) {
		super(message);
		this.code = code;
		this.originalError = originalError;
	}
}

/**
 * Error thrown when form/data validation fails
 */
export class ValidationError extends Error {
	readonly name = 'ValidationError';
	readonly field: string | string[];

	constructor(field: string | string[], message: string) {
		super(message);
		this.field = field;
	}
}

/**
 * Error thrown during transaction operations
 */
export class TransactionError extends Error {
	readonly name = 'TransactionError';
	readonly operation: TransactionOperation;
	readonly transactionId?: number;

	constructor(operation: TransactionOperation, message: string, transactionId?: number) {
		super(message);
		this.operation = operation;
		this.transactionId = transactionId;
	}
}

/**
 * Create a StorageError from an unknown error
 */
export function createStorageError(code: StorageErrorCode, error: unknown): StorageError {
	if (error instanceof Error) {
		return new StorageError(code, error.message, error);
	}
	if (typeof error === 'string') {
		return new StorageError(code, error);
	}
	return new StorageError(code, 'Unknown storage error');
}

/**
 * Create a ValidationError
 */
export function createValidationError(field: string | string[], message: string): ValidationError {
	return new ValidationError(field, message);
}

/**
 * Create a TransactionError
 */
export function createTransactionError(
	operation: TransactionOperation,
	message: string,
	transactionId?: number
): TransactionError {
	return new TransactionError(operation, message, transactionId);
}

/**
 * Type guard for StorageError
 */
export function isStorageError(error: unknown): error is StorageError {
	return error instanceof StorageError;
}

/**
 * Type guard for ValidationError
 */
export function isValidationError(error: unknown): error is ValidationError {
	return error instanceof ValidationError;
}

/**
 * Type guard for TransactionError
 */
export function isTransactionError(error: unknown): error is TransactionError {
	return error instanceof TransactionError;
}

/**
 * Format an error message for logging or display
 */
export function formatErrorMessage(error: unknown): string {
	if (error instanceof StorageError) {
		return `[Storage:${error.code}] ${error.message}`;
	}
	if (error instanceof ValidationError) {
		const fields = Array.isArray(error.field) ? error.field.join(',') : error.field;
		return `[Validation:${fields}] ${error.message}`;
	}
	if (error instanceof TransactionError) {
		const idPart = error.transactionId !== undefined ? `:${error.transactionId}` : '';
		return `[Transaction:${error.operation}${idPart}] ${error.message}`;
	}
	if (error instanceof Error) {
		return error.message;
	}
	return 'Unknown error';
}
