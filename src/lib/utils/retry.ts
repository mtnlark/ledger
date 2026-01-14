/**
 * Options for retry behavior
 */
export interface RetryOptions {
	/** Maximum number of retry attempts (default: 3) */
	maxRetries?: number;
	/** Base delay in milliseconds for exponential backoff (default: 100) */
	baseDelay?: number;
	/** Maximum delay in milliseconds (default: 5000) */
	maxDelay?: number;
	/** Callback called on each retry attempt */
	onRetry?: (error: Error, attempt: number, delay: number) => void;
	/** Function to determine if an error is retryable (default: all errors) */
	shouldRetry?: (error: Error) => boolean;
}

/**
 * Default retry options
 */
export const DEFAULT_RETRY_OPTIONS: Required<Pick<RetryOptions, 'maxRetries' | 'baseDelay' | 'maxDelay'>> = {
	maxRetries: 3,
	baseDelay: 100,
	maxDelay: 5000
};

/**
 * Create retry options with defaults
 */
export function createRetryOptions(options?: RetryOptions): RetryOptions {
	return {
		...DEFAULT_RETRY_OPTIONS,
		...options
	};
}

/**
 * Calculate delay for a given attempt using exponential backoff
 */
function calculateDelay(attempt: number, baseDelay: number, maxDelay: number): number {
	const delay = baseDelay * Math.pow(2, attempt - 1);
	return Math.min(delay, maxDelay);
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with automatic retry on failure using exponential backoff
 *
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @returns The result of the function
 * @throws The last error if all retries fail
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => fetch('/api/data'),
 *   { maxRetries: 3, baseDelay: 100 }
 * );
 * ```
 */
export async function withRetry<T>(
	fn: () => Promise<T>,
	options?: RetryOptions
): Promise<T> {
	const {
		maxRetries = DEFAULT_RETRY_OPTIONS.maxRetries,
		baseDelay = DEFAULT_RETRY_OPTIONS.baseDelay,
		maxDelay = DEFAULT_RETRY_OPTIONS.maxDelay,
		onRetry,
		shouldRetry
	} = options ?? {};

	let lastError: Error;
	let attempt = 0;

	while (attempt <= maxRetries) {
		try {
			return await fn();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			// Check if we should retry this error
			if (shouldRetry && !shouldRetry(lastError)) {
				throw lastError;
			}

			// Check if we have retries left
			if (attempt >= maxRetries) {
				throw lastError;
			}

			// Calculate delay and wait before retrying
			attempt++;
			const delay = calculateDelay(attempt, baseDelay, maxDelay);

			// Call onRetry callback if provided
			onRetry?.(lastError, attempt, delay);

			await sleep(delay);
		}
	}

	// This should never be reached, but TypeScript needs it
	throw lastError!;
}
