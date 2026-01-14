import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, createRetryOptions, DEFAULT_RETRY_OPTIONS, type RetryOptions } from './retry';

describe('retry', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('withRetry', () => {
		it('returns result on first success', async () => {
			const fn = vi.fn().mockResolvedValue('success');

			const promise = withRetry(fn);
			await vi.runAllTimersAsync();
			const result = await promise;

			expect(result).toBe('success');
			expect(fn).toHaveBeenCalledTimes(1);
		});

		it('retries on failure and succeeds eventually', async () => {
			const fn = vi
				.fn()
				.mockRejectedValueOnce(new Error('fail 1'))
				.mockRejectedValueOnce(new Error('fail 2'))
				.mockResolvedValue('success');

			const promise = withRetry(fn);
			await vi.runAllTimersAsync();
			const result = await promise;

			expect(result).toBe('success');
			expect(fn).toHaveBeenCalledTimes(3);
		});

		it('throws after max retries exceeded', async () => {
			const error = new Error('persistent failure');
			const fn = vi.fn().mockRejectedValue(error);

			// Catch the rejection immediately to prevent unhandled rejection
			let caughtError: Error | undefined;
			const promise = withRetry(fn, { maxRetries: 2 }).catch((e: Error) => {
				caughtError = e;
			});
			await vi.runAllTimersAsync();
			await promise;

			expect(caughtError).toBeDefined();
			expect(caughtError!.message).toBe('persistent failure');
			expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
		});

		it('uses exponential backoff', async () => {
			const fn = vi
				.fn()
				.mockRejectedValueOnce(new Error('fail'))
				.mockRejectedValueOnce(new Error('fail'))
				.mockResolvedValue('success');

			const options: RetryOptions = { maxRetries: 3, baseDelay: 100 };
			const promise = withRetry(fn, options);

			// First call is immediate
			expect(fn).toHaveBeenCalledTimes(1);

			// First retry after 100ms
			await vi.advanceTimersByTimeAsync(100);
			expect(fn).toHaveBeenCalledTimes(2);

			// Second retry after 200ms (exponential)
			await vi.advanceTimersByTimeAsync(200);
			expect(fn).toHaveBeenCalledTimes(3);

			await vi.runAllTimersAsync();
			const result = await promise;
			expect(result).toBe('success');
		});

		it('respects maxDelay option', async () => {
			const fn = vi
				.fn()
				.mockRejectedValueOnce(new Error('fail'))
				.mockRejectedValueOnce(new Error('fail'))
				.mockRejectedValueOnce(new Error('fail'))
				.mockResolvedValue('success');

			const options: RetryOptions = { maxRetries: 4, baseDelay: 100, maxDelay: 150 };
			const promise = withRetry(fn, options);

			// First call immediate
			expect(fn).toHaveBeenCalledTimes(1);

			// First retry after 100ms
			await vi.advanceTimersByTimeAsync(100);
			expect(fn).toHaveBeenCalledTimes(2);

			// Second retry - would be 200ms but capped at 150ms
			await vi.advanceTimersByTimeAsync(150);
			expect(fn).toHaveBeenCalledTimes(3);

			// Third retry - also capped at 150ms
			await vi.advanceTimersByTimeAsync(150);
			expect(fn).toHaveBeenCalledTimes(4);

			await vi.runAllTimersAsync();
			const result = await promise;
			expect(result).toBe('success');
		});

		it('calls onRetry callback with attempt info', async () => {
			const fn = vi
				.fn()
				.mockRejectedValueOnce(new Error('error 1'))
				.mockRejectedValueOnce(new Error('error 2'))
				.mockResolvedValue('success');

			const onRetry = vi.fn();
			const promise = withRetry(fn, { maxRetries: 3, onRetry });
			await vi.runAllTimersAsync();
			await promise;

			expect(onRetry).toHaveBeenCalledTimes(2);
			expect(onRetry).toHaveBeenNthCalledWith(1, expect.any(Error), 1, expect.any(Number));
			expect(onRetry).toHaveBeenNthCalledWith(2, expect.any(Error), 2, expect.any(Number));
		});

		it('uses shouldRetry to filter retryable errors', async () => {
			const permanentError = new Error('Not found');
			const fn = vi.fn().mockRejectedValue(permanentError);

			const shouldRetry = vi.fn().mockReturnValue(false);
			let caughtError: Error | undefined;
			const promise = withRetry(fn, { maxRetries: 3, shouldRetry }).catch((e: Error) => {
				caughtError = e;
			});
			await vi.runAllTimersAsync();
			await promise;

			expect(caughtError).toBeDefined();
			expect(caughtError!.message).toBe('Not found');
			expect(fn).toHaveBeenCalledTimes(1); // No retries
			expect(shouldRetry).toHaveBeenCalledWith(permanentError);
		});

		it('retries only when shouldRetry returns true', async () => {
			const transientError = new Error('Connection timeout');
			const permanentError = new Error('Not found');
			const fn = vi
				.fn()
				.mockRejectedValueOnce(transientError)
				.mockRejectedValueOnce(permanentError);

			const shouldRetry = vi.fn().mockImplementation((err: Error) => {
				return err.message.includes('timeout');
			});

			let caughtError: Error | undefined;
			const promise = withRetry(fn, { maxRetries: 3, shouldRetry }).catch((e: Error) => {
				caughtError = e;
			});
			await vi.runAllTimersAsync();
			await promise;

			expect(caughtError).toBeDefined();
			expect(caughtError!.message).toBe('Not found');
			expect(fn).toHaveBeenCalledTimes(2);
		});
	});

	describe('createRetryOptions', () => {
		it('creates options with defaults', () => {
			const options = createRetryOptions();

			expect(options.maxRetries).toBe(DEFAULT_RETRY_OPTIONS.maxRetries);
			expect(options.baseDelay).toBe(DEFAULT_RETRY_OPTIONS.baseDelay);
		});

		it('merges custom options with defaults', () => {
			const options = createRetryOptions({ maxRetries: 5 });

			expect(options.maxRetries).toBe(5);
			expect(options.baseDelay).toBe(DEFAULT_RETRY_OPTIONS.baseDelay);
		});
	});
});
