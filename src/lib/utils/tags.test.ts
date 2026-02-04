import { describe, it, expect } from 'vitest';
import { extractTags, removeTags, matchesTag, calculateTagTotal, replaceTag, stripTag } from './tags.js';
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

describe('calculateTagTotal', () => {
  const createTx = (amount: number, notes?: string, isShared = false, partnerShare = 0): Transaction => ({
    id: 1,
    date: new Date(),
    merchant: 'Test',
    amount,
    categoryId: 1,
    isShared,
    splitType: 'percentage',
    splitValue: 50,
    partnerShare,
    isSettled: false,
    isEssential: false,
    isSubscription: false,
    notes,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it('returns 0 for empty transactions', () => {
    expect(calculateTagTotal([], 'italy')).toBe(0);
  });

  it('sums full amounts for non-shared transactions', () => {
    const txs = [
      createTx(50, '#italy dinner'),
      createTx(30, '#italy lunch'),
    ];
    expect(calculateTagTotal(txs, 'italy')).toBe(80);
  });

  it('sums user share for shared transactions', () => {
    const txs = [
      createTx(100, '#italy hotel', true, 50),
    ];
    expect(calculateTagTotal(txs, 'italy')).toBe(50);
  });

  it('only includes transactions matching the tag', () => {
    const txs = [
      createTx(50, '#italy dinner'),
      createTx(30, '#france lunch'),
    ];
    expect(calculateTagTotal(txs, 'italy')).toBe(50);
  });

  it('handles mix of shared and non-shared', () => {
    const txs = [
      createTx(100, '#trip shared hotel', true, 40),
      createTx(25, '#trip solo coffee'),
    ];
    expect(calculateTagTotal(txs, 'trip')).toBe(85);
  });

  it('is case insensitive', () => {
    const txs = [createTx(50, '#Italy dinner')];
    expect(calculateTagTotal(txs, 'italy')).toBe(50);
  });
});

describe('replaceTag', () => {
  it('replaces a tag in notes', () => {
    expect(replaceTag('Dinner #old-tag notes', 'old-tag', 'new-tag')).toBe('Dinner #new-tag notes');
  });

  it('replaces tag case-insensitively', () => {
    expect(replaceTag('#OldTag lunch', 'oldtag', 'newtag')).toBe('#newtag lunch');
  });

  it('replaces only the exact tag', () => {
    expect(replaceTag('#italy #italy-trip', 'italy', 'france')).toBe('#france #italy-trip');
  });

  it('handles tag at end of string', () => {
    expect(replaceTag('Dinner #food', 'food', 'restaurant')).toBe('Dinner #restaurant');
  });

  it('handles tag at start of string', () => {
    expect(replaceTag('#food dinner', 'food', 'restaurant')).toBe('#restaurant dinner');
  });

  it('handles notes with only the tag', () => {
    expect(replaceTag('#food', 'food', 'restaurant')).toBe('#restaurant');
  });

  it('returns original if tag not found', () => {
    expect(replaceTag('Dinner #food', 'travel', 'trip')).toBe('Dinner #food');
  });
});

describe('stripTag', () => {
  it('removes a tag from notes', () => {
    expect(stripTag('Dinner #italy notes', 'italy')).toBe('Dinner notes');
  });

  it('removes tag case-insensitively', () => {
    expect(stripTag('#ITALY lunch', 'italy')).toBe('lunch');
  });

  it('removes only the exact tag', () => {
    expect(stripTag('#italy #italy-trip', 'italy')).toBe('#italy-trip');
  });

  it('cleans up extra whitespace', () => {
    expect(stripTag('Before  #tag  after', 'tag')).toBe('Before after');
  });

  it('returns empty string when tag is the only content', () => {
    expect(stripTag('#italy', 'italy')).toBe('');
  });

  it('returns trimmed result when other tags remain', () => {
    expect(stripTag('#italy #france', 'italy')).toBe('#france');
  });

  it('returns original if tag not found', () => {
    expect(stripTag('Dinner #food', 'travel')).toBe('Dinner #food');
  });
});
