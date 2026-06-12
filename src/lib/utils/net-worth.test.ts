import { describe, it, expect } from 'vitest';
import { calculateNetWorth, buildNetWorthSeries, seriesDelta, accountClassForType } from './net-worth';
import type { LinkedAccount, BalanceSnapshot } from '$lib/db';

let nextId = 1;
function account(overrides: Partial<LinkedAccount> = {}): LinkedAccount {
	return {
		id: nextId++,
		name: 'Test',
		institution: 'Bank',
		accountClass: 'asset',
		accountType: 'checking',
		currentBalance: 0,
		source: 'manual',
		lastSyncStatus: 'never',
		sortOrder: 0,
		isActive: true,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides
	} as LinkedAccount;
}

function snap(accountId: number, date: string, balance: number): BalanceSnapshot {
	return { accountId, balance, source: 'manual', capturedAt: new Date(`${date}T12:00:00`) };
}

describe('calculateNetWorth', () => {
	it('sums assets and subtracts liabilities over active accounts', () => {
		const accounts = [
			account({ currentBalance: 1000 }),
			account({ currentBalance: 5000, accountType: 'investment' }),
			account({ currentBalance: 400, accountClass: 'liability', accountType: 'credit' })
		];
		expect(calculateNetWorth(accounts)).toEqual({ total: 5600, assets: 6000, liabilities: 400 });
	});

	it('ignores inactive accounts', () => {
		const accounts = [
			account({ currentBalance: 1000 }),
			account({ currentBalance: 9999, isActive: false })
		];
		expect(calculateNetWorth(accounts).total).toBe(1000);
	});

	it('handles empty input and rounds currency', () => {
		expect(calculateNetWorth([])).toEqual({ total: 0, assets: 0, liabilities: 0 });
		expect(calculateNetWorth([account({ currentBalance: 0.1 }), account({ currentBalance: 0.2 })]).total).toBe(0.3);
	});
});

describe('buildNetWorthSeries', () => {
	it('forward-fills accounts without a snapshot that day', () => {
		const a = account();
		const b = account();
		const series = buildNetWorthSeries(
			[snap(a.id!, '2026-06-01', 100), snap(b.id!, '2026-06-03', 50), snap(a.id!, '2026-06-05', 120)],
			[a, b]
		);
		expect(series).toEqual([
			{ date: '2026-06-01', total: 100 },
			{ date: '2026-06-03', total: 150 }, // a carried at 100
			{ date: '2026-06-05', total: 170 } // b carried at 50
		]);
	});

	it('signs liabilities negative and excludes inactive accounts', () => {
		const asset = account();
		const debt = account({ accountClass: 'liability' });
		const closed = account({ isActive: false });
		const series = buildNetWorthSeries(
			[
				snap(asset.id!, '2026-06-01', 1000),
				snap(debt.id!, '2026-06-01', 300),
				snap(closed.id!, '2026-06-01', 9999)
			],
			[asset, debt, closed]
		);
		expect(series).toEqual([{ date: '2026-06-01', total: 700 }]);
	});

	it('returns empty for no snapshots', () => {
		expect(buildNetWorthSeries([], [account()])).toEqual([]);
	});

	it('sorts unordered snapshots', () => {
		const a = account();
		const series = buildNetWorthSeries(
			[snap(a.id!, '2026-06-05', 200), snap(a.id!, '2026-06-01', 100)],
			[a]
		);
		expect(series.map((p) => p.date)).toEqual(['2026-06-01', '2026-06-05']);
	});
});

describe('seriesDelta', () => {
	const series = [
		{ date: '2026-05-01', total: 1000 },
		{ date: '2026-05-20', total: 1100 },
		{ date: '2026-06-10', total: 1300 }
	];

	it('returns change vs the last point at or before the window start', () => {
		// 30 days before 2026-06-10 is 2026-05-11 → baseline is 2026-05-01
		expect(seriesDelta(series, 30)).toBe(300);
		// 7-day window → baseline 2026-05-20
		expect(seriesDelta(series, 21)).toBe(200);
	});

	it('returns null without enough history', () => {
		expect(seriesDelta([{ date: '2026-06-10', total: 100 }], 30)).toBeNull();
		expect(seriesDelta([], 30)).toBeNull();
	});
});

describe('accountClassForType', () => {
	it('classifies credit and loan as liabilities, everything else as assets', () => {
		expect(accountClassForType('credit')).toBe('liability');
		expect(accountClassForType('loan')).toBe('liability');
		expect(accountClassForType('checking')).toBe('asset');
		expect(accountClassForType('savings')).toBe('asset');
		expect(accountClassForType('investment')).toBe('asset');
		expect(accountClassForType('retirement')).toBe('asset');
		expect(accountClassForType('other')).toBe('asset');
	});
});
