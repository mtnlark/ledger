import { TagIndex } from './tags';

/**
 * Reactive wrapper for TagIndex that triggers Svelte updates.
 * Uses $state to make tag data reactive in Svelte 5 components.
 */
class ReactiveTagIndex {
	private index = new TagIndex();
	private _version = $state(0);

	/**
	 * Build index from transactions, clearing previous data.
	 * Increments version to trigger reactivity.
	 */
	rebuild(transactions: Parameters<TagIndex['rebuild']>[0]): void {
		this.index.rebuild(transactions);
		this._version++;
	}

	/**
	 * Return all unique tags sorted alphabetically.
	 * Reads _version to establish reactive dependency.
	 */
	getAllTags(): string[] {
		// Access _version to create reactive dependency
		void this._version;
		return this.index.getAllTags();
	}

	/**
	 * Return tags matching prefix (case insensitive).
	 * Reads _version to establish reactive dependency.
	 */
	getTagSuggestions(prefix: string): string[] {
		void this._version;
		return this.index.getTagSuggestions(prefix);
	}

	/**
	 * Return transaction IDs with the given tag.
	 */
	getTransactionIdsForTag(tag: string): Set<number> {
		void this._version;
		return this.index.getTransactionIdsForTag(tag);
	}

	/**
	 * Return count of transactions with the given tag.
	 */
	getTransactionCountForTag(tag: string): number {
		void this._version;
		return this.index.getTransactionCountForTag(tag);
	}
}

/**
 * Singleton reactive instance for app-wide tag indexing.
 */
export const tagIndex = new ReactiveTagIndex();
