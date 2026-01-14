import { describe, it, expect, beforeEach } from 'vitest';
import { Trie, createTrieFromArray, createTrieFromMerchants, createTrieNode } from './trie';

describe('trie', () => {
	describe('createTrieNode', () => {
		it('creates an empty node', () => {
			const node = createTrieNode();

			expect(node.children.size).toBe(0);
			expect(node.isEndOfWord).toBe(false);
			expect(node.count).toBe(0);
		});
	});

	describe('Trie', () => {
		let trie: Trie;

		beforeEach(() => {
			trie = new Trie();
		});

		describe('insert', () => {
			it('inserts a word', () => {
				trie.insert('hello');

				expect(trie.search('hello')).toBe(true);
			});

			it('handles empty strings', () => {
				trie.insert('');
				trie.insert('  ');

				expect(trie.size()).toBe(0);
			});

			it('preserves original casing in results', () => {
				trie.insert('Netflix');

				const results = trie.findAllWithPrefix('net');
				expect(results[0]).toBe('Netflix');
			});

			it('is case-insensitive for search', () => {
				trie.insert('Amazon');

				expect(trie.search('amazon')).toBe(true);
				expect(trie.search('AMAZON')).toBe(true);
				expect(trie.search('Amazon')).toBe(true);
			});

			it('increments count on repeated inserts', () => {
				trie.insert('coffee', 1);
				trie.insert('coffee', 1);
				trie.insert('Coffee', 1);

				expect(trie.getCount('coffee')).toBe(3);
			});
		});

		describe('search', () => {
			it('finds existing words', () => {
				trie.insert('apple');
				trie.insert('application');

				expect(trie.search('apple')).toBe(true);
				expect(trie.search('application')).toBe(true);
			});

			it('returns false for non-existent words', () => {
				trie.insert('apple');

				expect(trie.search('app')).toBe(false);
				expect(trie.search('banana')).toBe(false);
			});

			it('returns false for prefixes that are not complete words', () => {
				trie.insert('application');

				expect(trie.search('app')).toBe(false);
				expect(trie.search('appli')).toBe(false);
			});
		});

		describe('startsWith', () => {
			it('finds prefixes of existing words', () => {
				trie.insert('application');

				expect(trie.startsWith('app')).toBe(true);
				expect(trie.startsWith('appli')).toBe(true);
				expect(trie.startsWith('application')).toBe(true);
			});

			it('returns false for non-existent prefixes', () => {
				trie.insert('apple');

				expect(trie.startsWith('ban')).toBe(false);
				expect(trie.startsWith('apples')).toBe(false);
			});
		});

		describe('findAllWithPrefix', () => {
			it('finds all words with given prefix', () => {
				trie.insert('apple');
				trie.insert('application');
				trie.insert('banana');

				const results = trie.findAllWithPrefix('app');

				expect(results).toContain('apple');
				expect(results).toContain('application');
				expect(results).not.toContain('banana');
			});

			it('sorts by frequency descending', () => {
				trie.insert('Starbucks', 10);
				trie.insert('Subway', 5);
				trie.insert('Sweetgreen', 2);

				const results = trie.findAllWithPrefix('s');

				expect(results[0]).toBe('Starbucks');
				expect(results[1]).toBe('Subway');
				expect(results[2]).toBe('Sweetgreen');
			});

			it('respects limit parameter', () => {
				trie.insert('a1');
				trie.insert('a2');
				trie.insert('a3');
				trie.insert('a4');
				trie.insert('a5');

				const results = trie.findAllWithPrefix('a', 3);

				expect(results).toHaveLength(3);
			});

			it('returns empty array for non-matching prefix', () => {
				trie.insert('apple');

				const results = trie.findAllWithPrefix('xyz');

				expect(results).toHaveLength(0);
			});

			it('is case-insensitive', () => {
				trie.insert('Netflix');

				expect(trie.findAllWithPrefix('NET')).toContain('Netflix');
				expect(trie.findAllWithPrefix('net')).toContain('Netflix');
			});
		});

		describe('remove', () => {
			it('removes existing word', () => {
				trie.insert('hello');
				trie.insert('help');

				const removed = trie.remove('hello');

				expect(removed).toBe(true);
				expect(trie.search('hello')).toBe(false);
				expect(trie.search('help')).toBe(true);
			});

			it('returns false for non-existent word', () => {
				trie.insert('hello');

				const removed = trie.remove('world');

				expect(removed).toBe(false);
			});

			it('handles removing prefix of longer word', () => {
				trie.insert('app');
				trie.insert('application');

				trie.remove('app');

				expect(trie.search('app')).toBe(false);
				expect(trie.search('application')).toBe(true);
			});
		});

		describe('clear', () => {
			it('removes all words', () => {
				trie.insert('one');
				trie.insert('two');
				trie.insert('three');

				trie.clear();

				expect(trie.size()).toBe(0);
				expect(trie.search('one')).toBe(false);
			});
		});

		describe('getAllWords', () => {
			it('returns all inserted words', () => {
				trie.insert('apple');
				trie.insert('banana');
				trie.insert('cherry');

				const words = trie.getAllWords();

				expect(words).toContain('apple');
				expect(words).toContain('banana');
				expect(words).toContain('cherry');
				expect(words).toHaveLength(3);
			});

			it('returns empty array for empty trie', () => {
				expect(trie.getAllWords()).toHaveLength(0);
			});
		});

		describe('size', () => {
			it('returns correct count', () => {
				expect(trie.size()).toBe(0);

				trie.insert('one');
				expect(trie.size()).toBe(1);

				trie.insert('two');
				expect(trie.size()).toBe(2);
			});

			it('does not count duplicates', () => {
				trie.insert('hello');
				trie.insert('hello');
				trie.insert('HELLO');

				expect(trie.size()).toBe(1);
			});
		});

		describe('incrementCount', () => {
			it('increments count for existing word', () => {
				trie.insert('coffee', 5);

				trie.incrementCount('coffee', 3);

				expect(trie.getCount('coffee')).toBe(8);
			});

			it('does nothing for non-existent word', () => {
				trie.incrementCount('nonexistent', 5);

				expect(trie.getCount('nonexistent')).toBe(0);
			});
		});

		describe('getCount', () => {
			it('returns count for existing word', () => {
				trie.insert('test', 7);

				expect(trie.getCount('test')).toBe(7);
			});

			it('returns 0 for non-existent word', () => {
				expect(trie.getCount('nonexistent')).toBe(0);
			});
		});
	});

	describe('createTrieFromArray', () => {
		it('creates trie from string array', () => {
			const trie = createTrieFromArray(['apple', 'banana', 'cherry']);

			expect(trie.size()).toBe(3);
			expect(trie.search('apple')).toBe(true);
			expect(trie.search('banana')).toBe(true);
			expect(trie.search('cherry')).toBe(true);
		});

		it('handles empty array', () => {
			const trie = createTrieFromArray([]);

			expect(trie.size()).toBe(0);
		});
	});

	describe('createTrieFromMerchants', () => {
		it('creates trie with frequency counts', () => {
			const trie = createTrieFromMerchants([
				{ name: 'Starbucks', count: 15 },
				{ name: 'Subway', count: 8 },
				{ name: 'Target', count: 3 }
			]);

			expect(trie.size()).toBe(3);
			expect(trie.getCount('Starbucks')).toBe(15);
			expect(trie.getCount('Subway')).toBe(8);
			expect(trie.getCount('Target')).toBe(3);
		});

		it('sorts results by frequency', () => {
			const trie = createTrieFromMerchants([
				{ name: 'Starbucks', count: 15 },
				{ name: 'Subway', count: 8 },
				{ name: 'Sweetgreen', count: 3 }
			]);

			const results = trie.findAllWithPrefix('s');

			expect(results[0]).toBe('Starbucks');
			expect(results[1]).toBe('Subway');
			expect(results[2]).toBe('Sweetgreen');
		});
	});
});
