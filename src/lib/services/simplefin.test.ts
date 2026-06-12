import { describe, it, expect } from 'vitest';
import { mapSimplefinAccount, type SimplefinRawAccount } from './simplefin';

function raw(overrides: Partial<SimplefinRawAccount> = {}): SimplefinRawAccount {
	return {
		id: 'Demo Savings',
		name: 'SimpleFIN Savings',
		currency: 'USD',
		balance: '113985.51',
		'balance-date': 1781222400,
		org: { name: 'SimpleFIN Demo', domain: 'beta-bridge.simplefin.org' },
		...overrides
	};
}

describe('mapSimplefinAccount', () => {
	it('parses the protocol string balance and unix balance-date', () => {
		const mapped = mapSimplefinAccount(raw());
		expect(mapped.simplefinId).toBe('Demo Savings');
		expect(mapped.balance).toBe(113985.51);
		expect(mapped.balanceDate.getTime()).toBe(1781222400 * 1000);
		expect(mapped.institution).toBe('SimpleFIN Demo');
	});

	it('falls back to org domain, then empty, for institution', () => {
		expect(mapSimplefinAccount(raw({ org: { domain: 'bank.example' } })).institution).toBe('bank.example');
		expect(mapSimplefinAccount(raw({ org: null })).institution).toBe('');
	});

	it('rounds balances and survives malformed numbers', () => {
		expect(mapSimplefinAccount(raw({ balance: '10.005' })).balance).toBe(10.01);
		expect(mapSimplefinAccount(raw({ balance: 'not-a-number' })).balance).toBe(0);
	});
});
