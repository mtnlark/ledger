function haveSameArguments<TArgs extends unknown[]>(left: TArgs, right: TArgs): boolean {
	return left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
}

export function memoByVersion<TArgs extends unknown[], TResult>(
	fn: (...args: TArgs) => TResult
): (version: number, key: string, ...args: TArgs) => TResult {
	let cachedVersion = -1;
	let cachedKey = '';
	let cachedArgs: TArgs | null = null;
	let cachedResult: TResult | undefined;

	return (version: number, key: string, ...args: TArgs): TResult => {
		if (
			version === cachedVersion &&
			key === cachedKey &&
			cachedArgs !== null &&
			haveSameArguments(args, cachedArgs)
		) {
			return cachedResult as TResult;
		}
		cachedVersion = version;
		cachedKey = key;
		cachedArgs = args;
		cachedResult = fn(...args);
		return cachedResult;
	};
}

export function memoByVersionMultiKey<TArgs extends unknown[], TResult>(
	fn: (...args: TArgs) => TResult,
	maxEntries = 12
): (version: number, key: string, ...args: TArgs) => TResult {
	if (maxEntries < 1) throw new RangeError('maxEntries must be at least 1');

	let cachedVersion = -1;
	let cache = new Map<string, { args: TArgs; result: TResult }>();

	return (version: number, key: string, ...args: TArgs): TResult => {
		if (version !== cachedVersion) {
			cachedVersion = version;
			cache = new Map();
		}

		const cached = cache.get(key);
		if (cached && haveSameArguments(args, cached.args)) {
			cache.delete(key);
			cache.set(key, cached);
			return cached.result;
		}

		const result = fn(...args);
		cache.delete(key);

		if (cache.size >= maxEntries) {
			const firstKey = cache.keys().next().value;
			if (firstKey !== undefined) cache.delete(firstKey);
		}

		cache.set(key, { args, result });
		return result;
	};
}
