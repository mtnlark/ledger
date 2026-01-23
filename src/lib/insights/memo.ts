/**
 * Version-based memoization utilities for the insights calculation layer.
 *
 * These use TransactionCache.version as the invalidation signal:
 * when any transaction is mutated, the version increments and all
 * memo caches auto-invalidate on next access.
 */

/**
 * Single-key memo: caches one result per function.
 * Recomputes if version or key changes.
 *
 * @param fn The pure computation function (version and key are stripped before calling)
 * @returns A memoized version that caches based on (version, key)
 */
export function memoByVersion<TArgs extends unknown[], TResult>(
	fn: (...args: TArgs) => TResult
): (version: number, key: string, ...args: TArgs) => TResult {
	let cachedVersion = -1;
	let cachedKey = '';
	let cachedResult: TResult | undefined;

	return (version: number, key: string, ...args: TArgs): TResult => {
		if (version === cachedVersion && key === cachedKey) {
			return cachedResult as TResult;
		}
		cachedVersion = version;
		cachedKey = key;
		cachedResult = fn(...args);
		return cachedResult;
	};
}

/**
 * Multi-key memo: caches up to `maxEntries` results per version.
 * All entries are cleared when the version changes.
 * Useful for month-scoped calculations where navigating between
 * months shouldn't cause recomputation if transactions haven't changed.
 *
 * @param fn The pure computation function
 * @param maxEntries Maximum cached entries before LRU eviction (default: 12)
 * @returns A memoized version that caches based on (version, key)
 */
export function memoByVersionMultiKey<TArgs extends unknown[], TResult>(
	fn: (...args: TArgs) => TResult,
	maxEntries = 12
): (version: number, key: string, ...args: TArgs) => TResult {
	let cachedVersion = -1;
	let cache = new Map<string, TResult>();

	return (version: number, key: string, ...args: TArgs): TResult => {
		// Version changed: clear all entries
		if (version !== cachedVersion) {
			cachedVersion = version;
			cache = new Map();
		}

		// Check cache hit
		if (cache.has(key)) {
			return cache.get(key) as TResult;
		}

		// Compute and store
		const result = fn(...args);

		// Evict oldest entry if at capacity
		if (cache.size >= maxEntries) {
			const firstKey = cache.keys().next().value;
			if (firstKey !== undefined) {
				cache.delete(firstKey);
			}
		}

		cache.set(key, result);
		return result;
	};
}
