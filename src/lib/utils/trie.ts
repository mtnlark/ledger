/**
 * Trie Data Structure
 *
 * Efficient prefix-based string matching for autocomplete
 */

interface TrieNode {
	children: Map<string, TrieNode>;
	isEndOfWord: boolean;
	value?: string; // Store original casing
	count: number; // Frequency count for ranking
}

/**
 * Create a new trie node
 */
export function createTrieNode(): TrieNode {
	return {
		children: new Map(),
		isEndOfWord: false,
		count: 0
	};
}

/**
 * Trie class for prefix-based string matching
 */
export class Trie {
	private root: TrieNode;

	constructor() {
		this.root = createTrieNode();
	}

	/**
	 * Insert a word into the trie
	 */
	insert(word: string, increment: number = 1): void {
		if (!word || word.trim().length === 0) return;

		const normalizedWord = word.toLowerCase().trim();
		let current = this.root;

		for (const char of normalizedWord) {
			if (!current.children.has(char)) {
				current.children.set(char, createTrieNode());
			}
			current = current.children.get(char)!;
		}

		current.isEndOfWord = true;
		current.value = word.trim(); // Preserve original casing
		current.count += increment;
	}

	/**
	 * Search for exact word match
	 */
	search(word: string): boolean {
		const node = this.findNode(word.toLowerCase().trim());
		return node !== null && node.isEndOfWord;
	}

	/**
	 * Check if any word starts with the given prefix
	 */
	startsWith(prefix: string): boolean {
		return this.findNode(prefix.toLowerCase().trim()) !== null;
	}

	/**
	 * Find all words that start with the given prefix
	 * Returns results sorted by frequency (descending)
	 */
	findAllWithPrefix(prefix: string, limit: number = 10): string[] {
		const normalizedPrefix = prefix.toLowerCase().trim();
		const prefixNode = this.findNode(normalizedPrefix);

		if (!prefixNode) return [];

		const results: Array<{ value: string; count: number }> = [];
		this.collectAllWords(prefixNode, results);

		// Sort by count descending, then alphabetically
		results.sort((a, b) => {
			if (b.count !== a.count) return b.count - a.count;
			return a.value.localeCompare(b.value);
		});

		return results.slice(0, limit).map((r) => r.value);
	}

	/**
	 * Remove a word from the trie
	 * Returns true if the word was found and removed
	 */
	remove(word: string): boolean {
		const normalizedWord = word.toLowerCase().trim();
		const node = this.findNode(normalizedWord);

		// Word doesn't exist
		if (!node || !node.isEndOfWord) {
			return false;
		}

		// Mark as not end of word and clear value
		node.isEndOfWord = false;
		node.value = undefined;
		node.count = 0;

		// Clean up nodes if needed (optional optimization)
		this.removeHelper(this.root, normalizedWord, 0);

		return true;
	}

	/**
	 * Clear all entries from the trie
	 */
	clear(): void {
		this.root = createTrieNode();
	}

	/**
	 * Get all words in the trie
	 */
	getAllWords(): string[] {
		const results: Array<{ value: string; count: number }> = [];
		this.collectAllWords(this.root, results);
		return results.map((r) => r.value);
	}

	/**
	 * Get the number of unique words in the trie
	 */
	size(): number {
		return this.countWords(this.root);
	}

	/**
	 * Increment the count for an existing word
	 */
	incrementCount(word: string, amount: number = 1): void {
		const normalizedWord = word.toLowerCase().trim();
		const node = this.findNode(normalizedWord);
		if (node && node.isEndOfWord) {
			node.count += amount;
		}
	}

	/**
	 * Get the count for a word
	 */
	getCount(word: string): number {
		const normalizedWord = word.toLowerCase().trim();
		const node = this.findNode(normalizedWord);
		return node?.isEndOfWord ? node.count : 0;
	}

	// Private helper methods

	private findNode(prefix: string): TrieNode | null {
		let current = this.root;

		for (const char of prefix) {
			if (!current.children.has(char)) {
				return null;
			}
			current = current.children.get(char)!;
		}

		return current;
	}

	private collectAllWords(
		node: TrieNode,
		results: Array<{ value: string; count: number }>
	): void {
		if (node.isEndOfWord && node.value) {
			results.push({ value: node.value, count: node.count });
		}

		for (const child of node.children.values()) {
			this.collectAllWords(child, results);
		}
	}

	private removeHelper(node: TrieNode, word: string, index: number): boolean {
		if (index === word.length) {
			if (!node.isEndOfWord) return false;
			node.isEndOfWord = false;
			node.value = undefined;
			node.count = 0;
			return node.children.size === 0;
		}

		const char = word[index];
		const child = node.children.get(char);
		if (!child) return false;

		const shouldDeleteChild = this.removeHelper(child, word, index + 1);

		if (shouldDeleteChild) {
			node.children.delete(char);
			return !node.isEndOfWord && node.children.size === 0;
		}

		return false;
	}

	private countWords(node: TrieNode): number {
		let count = node.isEndOfWord ? 1 : 0;
		for (const child of node.children.values()) {
			count += this.countWords(child);
		}
		return count;
	}
}

/**
 * Create a trie from an array of strings
 */
export function createTrieFromArray(words: string[]): Trie {
	const trie = new Trie();
	for (const word of words) {
		trie.insert(word);
	}
	return trie;
}

/**
 * Create a trie from merchant frequency data
 */
export function createTrieFromMerchants(
	merchants: Array<{ name: string; count: number }>
): Trie {
	const trie = new Trie();
	for (const merchant of merchants) {
		trie.insert(merchant.name, merchant.count);
	}
	return trie;
}
