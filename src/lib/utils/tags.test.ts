import { describe, it, expect } from 'vitest';
import { extractTags, removeTags, matchesTag } from './tags.js';
import type { Transaction } from '$lib/db/constants.js';

describe('extractTags', () => {
  it('returns empty array for undefined input', () => {
    expect(extractTags(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(extractTags('')).toEqual([]);
  });

  it('returns empty array for string without tags', () => {
    expect(extractTags('Just a regular note')).toEqual([]);
  });

  it('extracts a single tag', () => {
    expect(extractTags('Trip to #italy')).toEqual(['italy']);
  });

  it('extracts multiple tags', () => {
    expect(extractTags('#work expense for #travel')).toEqual(['work', 'travel']);
  });

  it('normalizes tags to lowercase', () => {
    expect(extractTags('#Italy #FRANCE #Spain')).toEqual(['italy', 'france', 'spain']);
  });

  it('deduplicates tags', () => {
    expect(extractTags('#italy #ITALY #Italy')).toEqual(['italy']);
  });

  it('handles tags with hyphens', () => {
    expect(extractTags('#trip-2026 #euro-vacation')).toEqual(['trip-2026', 'euro-vacation']);
  });

  it('handles tags with numbers', () => {
    expect(extractTags('#work1 #2024trip #q4')).toEqual(['work1', '2024trip', 'q4']);
  });

  it('ignores standalone # without word', () => {
    expect(extractTags('Price is # 50')).toEqual([]);
  });

  it('ignores # followed by space', () => {
    expect(extractTags('Item # 123')).toEqual([]);
  });

  it('extracts tag at start of string', () => {
    expect(extractTags('#vacation in Rome')).toEqual(['vacation']);
  });

  it('extracts tag at end of string', () => {
    expect(extractTags('Dinner at restaurant #food')).toEqual(['food']);
  });

  it('extracts tag in middle of string', () => {
    expect(extractTags('Bought a #gift for mom')).toEqual(['gift']);
  });

  it('handles tags adjacent to punctuation', () => {
    expect(extractTags('Check out #italy!')).toEqual(['italy']);
    expect(extractTags('(#travel) expenses')).toEqual(['travel']);
    expect(extractTags('#food, #drinks')).toEqual(['food', 'drinks']);
  });

  it('preserves order of first occurrence when deduplicating', () => {
    expect(extractTags('#first #second #FIRST #third')).toEqual(['first', 'second', 'third']);
  });
});

describe('removeTags', () => {
  it('returns empty string for undefined input', () => {
    expect(removeTags(undefined)).toBe('');
  });

  it('returns empty string for empty string input', () => {
    expect(removeTags('')).toBe('');
  });

  it('returns original string when no tags present', () => {
    expect(removeTags('Just a regular note')).toBe('Just a regular note');
  });

  it('removes a single tag', () => {
    expect(removeTags('Trip to #italy')).toBe('Trip to');
  });

  it('removes multiple tags', () => {
    expect(removeTags('#work expense for #travel')).toBe('expense for');
  });

  it('handles tag at start of string', () => {
    expect(removeTags('#vacation in Rome')).toBe('in Rome');
  });

  it('handles tag at end of string', () => {
    expect(removeTags('Dinner at restaurant #food')).toBe('Dinner at restaurant');
  });

  it('handles string with only tags', () => {
    expect(removeTags('#italy #travel')).toBe('');
  });

  it('normalizes multiple spaces to single space', () => {
    expect(removeTags('Trip  #italy  notes')).toBe('Trip notes');
  });

  it('trims leading and trailing whitespace', () => {
    expect(removeTags('  #tag text  ')).toBe('text');
  });

  it('preserves text around tags', () => {
    expect(removeTags('Before #tag after')).toBe('Before after');
  });

  it('handles tags with hyphens and numbers', () => {
    expect(removeTags('Trip #trip-2026 was fun')).toBe('Trip was fun');
  });
});

describe('matchesTag', () => {
  const createTransaction = (notes?: string): Transaction => ({
    id: 1,
    date: new Date(),
    merchant: 'Test',
    amount: 100,
    categoryId: 1,
    isShared: false,
    splitType: 'percentage',
    splitValue: 50,
    partnerShare: 0,
    isSettled: false,
    isEssential: false,
    isSubscription: false,
    notes,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it('returns false for transaction without notes', () => {
    const tx = createTransaction(undefined);
    expect(matchesTag(tx, 'italy')).toBe(false);
  });

  it('returns false for transaction with empty notes', () => {
    const tx = createTransaction('');
    expect(matchesTag(tx, 'italy')).toBe(false);
  });

  it('returns true when transaction has matching tag', () => {
    const tx = createTransaction('Trip to #italy');
    expect(matchesTag(tx, 'italy')).toBe(true);
  });

  it('returns false when transaction does not have matching tag', () => {
    const tx = createTransaction('Trip to #france');
    expect(matchesTag(tx, 'italy')).toBe(false);
  });

  it('matches case insensitively - lowercase search', () => {
    const tx = createTransaction('Trip to #ITALY');
    expect(matchesTag(tx, 'italy')).toBe(true);
  });

  it('matches case insensitively - uppercase search', () => {
    const tx = createTransaction('Trip to #italy');
    expect(matchesTag(tx, 'ITALY')).toBe(true);
  });

  it('matches case insensitively - mixed case search', () => {
    const tx = createTransaction('Trip to #italy');
    expect(matchesTag(tx, 'Italy')).toBe(true);
  });

  it('matches tag with hyphens', () => {
    const tx = createTransaction('#trip-2026 vacation');
    expect(matchesTag(tx, 'trip-2026')).toBe(true);
  });

  it('matches tag with numbers', () => {
    const tx = createTransaction('#q4 expense');
    expect(matchesTag(tx, 'q4')).toBe(true);
  });

  it('does not match partial tag', () => {
    const tx = createTransaction('#italy trip');
    expect(matchesTag(tx, 'ital')).toBe(false);
  });

  it('works with search term that includes # prefix', () => {
    const tx = createTransaction('Trip to #italy');
    expect(matchesTag(tx, '#italy')).toBe(true);
  });
});
