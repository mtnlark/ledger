import { describe, it, expect, vi } from 'vitest';
import { memoByVersion, memoByVersionMultiKey } from './memo';

describe('memoByVersion', () => {
	it('caches result for same version and key', () => {
		const fn = vi.fn((x: number) => x * 2);
		const memoized = memoByVersion(fn);

		const r1 = memoized(1, 'a', 5);
		const r2 = memoized(1, 'a', 5);

		expect(r1).toBe(10);
		expect(r2).toBe(10);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('recomputes when version changes', () => {
		const fn = vi.fn((x: number) => x * 2);
		const memoized = memoByVersion(fn);

		memoized(1, 'a', 5);
		const r2 = memoized(2, 'a', 5);

		expect(r2).toBe(10);
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it('recomputes when key changes', () => {
		const fn = vi.fn((x: number) => x * 2);
		const memoized = memoByVersion(fn);

		memoized(1, 'a', 5);
		const r2 = memoized(1, 'b', 7);

		expect(r2).toBe(14);
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it('uses new args on recomputation, not cached args', () => {
		const fn = vi.fn((x: number) => x * 2);
		const memoized = memoByVersion(fn);

		memoized(1, 'a', 5);
		const r2 = memoized(2, 'a', 10);

		expect(r2).toBe(20);
	});

	it('handles functions with multiple args', () => {
		const fn = vi.fn((a: number, b: string) => `${b}:${a}`);
		const memoized = memoByVersion(fn);

		const r1 = memoized(1, 'key', 42, 'hello');
		expect(r1).toBe('hello:42');
		expect(fn).toHaveBeenCalledWith(42, 'hello');
	});

	it('handles functions with no args', () => {
		const fn = vi.fn(() => 'static');
		const memoized = memoByVersion(fn);

		const r1 = memoized(1, 'k');
		const r2 = memoized(1, 'k');

		expect(r1).toBe('static');
		expect(r2).toBe('static');
		expect(fn).toHaveBeenCalledTimes(1);
	});
});

describe('memoByVersionMultiKey', () => {
	it('caches result for same version and key', () => {
		const fn = vi.fn((x: number) => x * 2);
		const memoized = memoByVersionMultiKey(fn);

		const r1 = memoized(1, 'a', 5);
		const r2 = memoized(1, 'a', 5);

		expect(r1).toBe(10);
		expect(r2).toBe(10);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('caches different keys within same version', () => {
		const fn = vi.fn((x: number) => x * 2);
		const memoized = memoByVersionMultiKey(fn);

		memoized(1, 'a', 5);
		memoized(1, 'b', 7);

		// Access both again - should be cached
		const r1 = memoized(1, 'a', 5);
		const r2 = memoized(1, 'b', 7);

		expect(r1).toBe(10);
		expect(r2).toBe(14);
		expect(fn).toHaveBeenCalledTimes(2); // only computed once per key
	});

	it('clears all entries when version changes', () => {
		const fn = vi.fn((x: number) => x * 2);
		const memoized = memoByVersionMultiKey(fn);

		memoized(1, 'a', 5);
		memoized(1, 'b', 7);
		expect(fn).toHaveBeenCalledTimes(2);

		// Version change: both should recompute
		memoized(2, 'a', 5);
		expect(fn).toHaveBeenCalledTimes(3);

		memoized(2, 'b', 7);
		expect(fn).toHaveBeenCalledTimes(4);
	});

	it('evicts oldest entry when at capacity', () => {
		const fn = vi.fn((x: number) => x * 2);
		const memoized = memoByVersionMultiKey(fn, 3); // max 3 entries

		memoized(1, 'a', 1);
		memoized(1, 'b', 2);
		memoized(1, 'c', 3);
		expect(fn).toHaveBeenCalledTimes(3);

		// Adding a 4th should evict 'a'
		memoized(1, 'd', 4);
		expect(fn).toHaveBeenCalledTimes(4);

		// 'a' should require recomputation, which evicts 'b' (now the oldest)
		memoized(1, 'a', 1);
		expect(fn).toHaveBeenCalledTimes(5);

		// 'c' should still be cached (wasn't evicted)
		memoized(1, 'c', 3);
		expect(fn).toHaveBeenCalledTimes(5);

		// 'b' was evicted when 'a' was re-added, so it requires recomputation
		memoized(1, 'b', 2);
		expect(fn).toHaveBeenCalledTimes(6);
	});

	it('defaults to 12 max entries', () => {
		const fn = vi.fn((x: number) => x);
		const memoized = memoByVersionMultiKey(fn);

		// Fill 12 entries
		for (let i = 0; i < 12; i++) {
			memoized(1, `key-${i}`, i);
		}
		expect(fn).toHaveBeenCalledTimes(12);

		// All 12 should be cached
		for (let i = 0; i < 12; i++) {
			memoized(1, `key-${i}`, i);
		}
		expect(fn).toHaveBeenCalledTimes(12);

		// 13th should evict the first
		memoized(1, 'key-12', 12);
		expect(fn).toHaveBeenCalledTimes(13);

		// First key should require recomputation
		memoized(1, 'key-0', 0);
		expect(fn).toHaveBeenCalledTimes(14);
	});

	it('handles functions with multiple args', () => {
		const fn = vi.fn((a: number, b: number) => a + b);
		const memoized = memoByVersionMultiKey(fn);

		const r1 = memoized(1, 'sum', 3, 4);
		expect(r1).toBe(7);
		expect(fn).toHaveBeenCalledWith(3, 4);
	});
});
