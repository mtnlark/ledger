import type { Transaction } from '$lib/db';
import { getMonthKey } from '$lib/db';

/**
 * Cached transaction type - includes all Transaction fields
 * but id is required (not optional) since cached transactions always have an id
 */
export type CachedTransaction = Transaction & { id: number };

/**
 * TransactionCache provides an in-memory cache for transactions with O(1) lookup.
 * Supports incremental updates to avoid reloading all transactions after mutations.
 *
 * Usage:
 * 1. Call initialize() with full transaction list when first loading all transactions
 * 2. Use add/update/remove for incremental updates after mutations
 * 3. Use getAll/getForMonth/getForDateRange for querying
 * 4. Call invalidate() to force a full reload on next access
 */
export class TransactionCache {
	private cache: Map<number, CachedTransaction> = new Map();
	private _isLoaded = false;
	private _version = 0;
	private _initPromise: Promise<void> | null = null;

	/**
	 * Whether the cache has been initialized with data
	 */
	get isLoaded(): boolean {
		return this._isLoaded;
	}

	/**
	 * Number of transactions in the cache
	 */
	get size(): number {
		return this.cache.size;
	}

	/**
	 * Version number that increments with each modification.
	 * Can be used to detect cache changes for reactivity.
	 */
	get version(): number {
		return this._version;
	}

	/**
	 * Initialize the cache with a full list of transactions.
	 * Clears any existing data.
	 */
	initialize(transactions: Transaction[]): void {
		this.cache.clear();
		for (const tx of transactions) {
			if (tx.id !== undefined) {
				this.cache.set(tx.id, tx as CachedTransaction);
			}
		}
		this._isLoaded = true;
		this._initPromise = null;
		this._version++;
	}

	/**
	 * Initialize the cache with an async loader function.
	 * Uses a lock to prevent concurrent initialization.
	 * Returns immediately if already loaded.
	 */
	async initializeAsync(loader: () => Promise<Transaction[]>): Promise<void> {
		if (this._isLoaded) return;

		// If already initializing, wait for that to complete
		if (this._initPromise) {
			await this._initPromise;
			return;
		}

		// Start initialization with lock
		this._initPromise = (async () => {
			const transactions = await loader();
			this.initialize(transactions);
		})();

		await this._initPromise;
	}

	/**
	 * Get a transaction by ID
	 */
	get(id: number): CachedTransaction | undefined {
		return this.cache.get(id);
	}

	/**
	 * Add or replace a transaction in the cache
	 */
	add(transaction: CachedTransaction): void {
		this.cache.set(transaction.id, transaction);
		this._version++;
	}

	/**
	 * Update an existing transaction with partial data
	 */
	update(id: number, updates: Partial<Transaction>): void {
		const existing = this.cache.get(id);
		if (existing) {
			this.cache.set(id, { ...existing, ...updates });
			this._version++;
		}
	}

	/**
	 * Remove a transaction from the cache
	 */
	remove(id: number): void {
		if (this.cache.delete(id)) {
			this._version++;
		}
	}

	/**
	 * Remove multiple transactions from the cache
	 */
	bulkRemove(ids: number[]): void {
		let removed = false;
		for (const id of ids) {
			if (this.cache.delete(id)) {
				removed = true;
			}
		}
		if (removed) {
			this._version++;
		}
	}

	/**
	 * Update multiple transactions with the same partial data
	 */
	bulkUpdate(ids: number[], updates: Partial<Transaction>): void {
		let updated = false;
		for (const id of ids) {
			const existing = this.cache.get(id);
			if (existing) {
				this.cache.set(id, { ...existing, ...updates });
				updated = true;
			}
		}
		if (updated) {
			this._version++;
		}
	}

	/**
	 * Mark a transaction as a split parent (hidden from normal queries)
	 */
	markSplitParent(id: number): void {
		this.update(id, { isSplitParent: true });
	}

	/**
	 * Get all transactions (excluding split parents)
	 */
	getAll(): CachedTransaction[] {
		if (!this._isLoaded) return [];
		return Array.from(this.cache.values()).filter((t) => !t.isSplitParent);
	}

	/**
	 * Get transactions for a specific month (excluding split parents)
	 * @param month Month in "YYYY-MM" format
	 */
	getForMonth(month: string): CachedTransaction[] {
		if (!this._isLoaded) return [];

		return Array.from(this.cache.values()).filter((t) => {
			if (t.isSplitParent) return false;
			const txMonth = getMonthKey(new Date(t.date));
			return txMonth === month;
		});
	}

	/**
	 * Get transactions within a date range (excluding split parents)
	 * Both dates are inclusive
	 */
	getForDateRange(fromDate: Date, toDate: Date): CachedTransaction[] {
		if (!this._isLoaded) return [];

		// Normalize to start/end of day for inclusive comparison
		const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
		const end = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59, 999);

		return Array.from(this.cache.values()).filter((t) => {
			if (t.isSplitParent) return false;
			const txDate = new Date(t.date);
			return txDate >= start && txDate <= end;
		});
	}

	/**
	 * Clear the cache and mark as unloaded.
	 * Call this when the underlying data may have changed externally.
	 */
	invalidate(): void {
		this.cache.clear();
		this._isLoaded = false;
		this._initPromise = null;
		this._version++;
	}
}

// Singleton instance for app-wide use
let globalCache: TransactionCache | null = null;

/**
 * Get the global transaction cache instance
 */
export function getTransactionCache(): TransactionCache {
	if (!globalCache) {
		globalCache = new TransactionCache();
	}
	return globalCache;
}

/**
 * Invalidate the global transaction cache.
 * Call this when transactions are modified outside of the cache's add/update/remove methods.
 */
export function invalidateTransactionCache(): void {
	if (globalCache) {
		globalCache.invalidate();
	}
}
