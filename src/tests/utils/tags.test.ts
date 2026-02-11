import { describe, it, expect } from 'vitest';
import { appendTag } from '$lib/utils/tags';

describe('appendTag', () => {
	it('appends tag to existing notes', () => {
		expect(appendTag('bought coffee', 'vacation')).toBe('bought coffee #vacation');
	});

	it('returns just the tag when notes is undefined', () => {
		expect(appendTag(undefined, 'vacation')).toBe('#vacation');
	});

	it('returns just the tag when notes is empty string', () => {
		expect(appendTag('', 'vacation')).toBe('#vacation');
	});

	it('returns just the tag when notes is whitespace only', () => {
		expect(appendTag('   ', 'vacation')).toBe('#vacation');
	});

	it('does not duplicate tag if already present', () => {
		expect(appendTag('bought coffee #vacation', 'vacation')).toBe('bought coffee #vacation');
	});

	it('is case-insensitive when checking for duplicates', () => {
		expect(appendTag('bought coffee #Vacation', 'vacation')).toBe('bought coffee #Vacation');
	});

	it('strips # prefix from tag argument', () => {
		expect(appendTag('bought coffee', '#vacation')).toBe('bought coffee #vacation');
	});

	it('normalizes tag to lowercase', () => {
		expect(appendTag('bought coffee', 'Vacation')).toBe('bought coffee #vacation');
	});

	it('works with notes that already have other tags', () => {
		expect(appendTag('bought coffee #italy', 'vacation')).toBe('bought coffee #italy #vacation');
	});
});
