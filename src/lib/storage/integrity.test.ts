/**
 * Tests for data integrity features: checksums, recovery types
 *
 * Note: Full tauri-adapter.ts testing requires mocking Tauri FS APIs.
 * These tests focus on the type contracts and utility functions that
 * don't depend on Tauri runtime.
 */

import { describe, it, expect } from 'vitest';
import type { StoredData, ReadDataResult, RecoveryResult } from './types';

describe('Storage Types', () => {
	describe('StoredData', () => {
		it('checksum field is optional for backwards compatibility', () => {
			// Legacy data without checksum should be valid
			const legacyData: StoredData = {
				version: '1.0',
				exportedAt: '2026-01-15T12:00:00.000Z',
				transactions: [],
				categories: [],
				monthlyBudgets: [],
				categoryBudgets: [],
				settings: {
					id: 1,
					partnerName: 'Partner',
					defaultSplitType: 'percentage',
					defaultSplitValue: 0.5,
					currency: 'USD',
					theme: 'system',
					dismissedRecurring: [],
					cancelledSubscriptions: [],
					confirmedActiveSubscriptions: [],
					iCloudBackupEnabled: false,
					completedGoals: [],
					notificationsEnabled: false,
					dailyReminderEnabled: true,
					dailyReminderTime: '20:00',
					weeklyReviewEnabled: true,
					monthlyBudgetSetupEnabled: true
				}
			};

			expect(legacyData.checksum).toBeUndefined();
		});

		it('checksum field can hold SHA-256 hash', () => {
			const dataWithChecksum: StoredData = {
				version: '1.0',
				exportedAt: '2026-01-15T12:00:00.000Z',
				checksum: 'a'.repeat(64), // SHA-256 produces 64 hex chars
				transactions: [],
				categories: [],
				monthlyBudgets: [],
				categoryBudgets: [],
				settings: {
					id: 1,
					partnerName: 'Partner',
					defaultSplitType: 'percentage',
					defaultSplitValue: 0.5,
					currency: 'USD',
					theme: 'system',
					dismissedRecurring: [],
					cancelledSubscriptions: [],
					confirmedActiveSubscriptions: [],
					iCloudBackupEnabled: false,
					completedGoals: [],
					notificationsEnabled: false,
					dailyReminderEnabled: true,
					dailyReminderTime: '20:00',
					weeklyReviewEnabled: true,
					monthlyBudgetSetupEnabled: true
				}
			};

			expect(dataWithChecksum.checksum).toHaveLength(64);
		});
	});

	describe('ReadDataResult', () => {
		it('success result contains data', () => {
			const result: ReadDataResult = {
				status: 'success',
				data: {
					version: '1.0',
					exportedAt: '2026-01-15T12:00:00.000Z',
					transactions: [],
					categories: [],
					monthlyBudgets: [],
					categoryBudgets: [],
					settings: {
						id: 1,
						partnerName: 'Partner',
						defaultSplitType: 'percentage',
						defaultSplitValue: 0.5,
						currency: 'USD',
						theme: 'system',
						dismissedRecurring: [],
						cancelledSubscriptions: [],
						confirmedActiveSubscriptions: [],
						iCloudBackupEnabled: false,
						completedGoals: [],
						notificationsEnabled: false,
						dailyReminderEnabled: true,
						dailyReminderTime: '20:00',
						weeklyReviewEnabled: true,
						monthlyBudgetSetupEnabled: true
					}
				}
			};

			expect(result.status).toBe('success');
			if (result.status === 'success') {
				expect(result.data.version).toBe('1.0');
			}
		});

		it('not_found result has no data', () => {
			const result: ReadDataResult = { status: 'not_found' };

			expect(result.status).toBe('not_found');
			expect('data' in result).toBe(false);
		});

		it('corrupted result contains error message', () => {
			const result: ReadDataResult = {
				status: 'corrupted',
				error: 'JSON parse error: Unexpected token'
			};

			expect(result.status).toBe('corrupted');
			if (result.status === 'corrupted') {
				expect(result.error).toContain('JSON parse error');
			}
		});

		it('checksum_mismatch result contains data for potential recovery inspection', () => {
			const result: ReadDataResult = {
				status: 'checksum_mismatch',
				data: {
					version: '1.0',
					exportedAt: '2026-01-15T12:00:00.000Z',
					checksum: 'invalid',
					transactions: [],
					categories: [],
					monthlyBudgets: [],
					categoryBudgets: [],
					settings: {
						id: 1,
						partnerName: 'Partner',
						defaultSplitType: 'percentage',
						defaultSplitValue: 0.5,
						currency: 'USD',
						theme: 'system',
						dismissedRecurring: [],
						cancelledSubscriptions: [],
						confirmedActiveSubscriptions: [],
						iCloudBackupEnabled: false,
						completedGoals: [],
						notificationsEnabled: false,
						dailyReminderEnabled: true,
						dailyReminderTime: '20:00',
						weeklyReviewEnabled: true,
						monthlyBudgetSetupEnabled: true
					}
				}
			};

			expect(result.status).toBe('checksum_mismatch');
			if (result.status === 'checksum_mismatch') {
				expect(result.data).toBeDefined();
			}
		});
	});

	describe('RecoveryResult', () => {
		it('recovered result contains data and backup name', () => {
			const result: RecoveryResult = {
				status: 'recovered',
				data: {
					version: '1.0',
					exportedAt: '2026-01-15T12:00:00.000Z',
					transactions: [],
					categories: [],
					monthlyBudgets: [],
					categoryBudgets: [],
					settings: {
						id: 1,
						partnerName: 'Partner',
						defaultSplitType: 'percentage',
						defaultSplitValue: 0.5,
						currency: 'USD',
						theme: 'system',
						dismissedRecurring: [],
						cancelledSubscriptions: [],
						confirmedActiveSubscriptions: [],
						iCloudBackupEnabled: false,
						completedGoals: [],
						notificationsEnabled: false,
						dailyReminderEnabled: true,
						dailyReminderTime: '20:00',
						weeklyReviewEnabled: true,
						monthlyBudgetSetupEnabled: true
					}
				},
				backupName: 'data-2026-01-14T10-30-00-000Z.json'
			};

			expect(result.status).toBe('recovered');
			if (result.status === 'recovered') {
				expect(result.backupName).toContain('data-');
				expect(result.data.version).toBe('1.0');
			}
		});

		it('no_valid_backup result has no data', () => {
			const result: RecoveryResult = { status: 'no_valid_backup' };

			expect(result.status).toBe('no_valid_backup');
			expect('data' in result).toBe(false);
		});
	});
});

describe('StorageInitResult (via index.ts)', () => {
	// Note: The actual initialization behavior is tested in storage.test.ts
	// These tests verify the type contracts

	it('loaded status indicates normal startup', () => {
		const result = { status: 'loaded' as const };
		expect(result.status).toBe('loaded');
	});

	it('recovered status includes backup name', () => {
		const result = {
			status: 'recovered' as const,
			backupName: 'data-2026-01-14T10-30-00-000Z.json'
		};
		expect(result.status).toBe('recovered');
		expect(result.backupName).toBeDefined();
	});

	it('initialized_fresh status indicates first run', () => {
		const result = { status: 'initialized_fresh' as const };
		expect(result.status).toBe('initialized_fresh');
	});

	it('initialized_after_unrecoverable_corruption indicates data loss', () => {
		const result = { status: 'initialized_after_unrecoverable_corruption' as const };
		expect(result.status).toBe('initialized_after_unrecoverable_corruption');
	});
});
