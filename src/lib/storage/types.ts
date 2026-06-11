import type {
	Transaction,
	Category,
	MonthlyBudget,
	CategoryBudget,
	Settings,
	SavingsAccount,
	SavingsContribution,
	LinkedAccount,
	BalanceSnapshot
} from '$lib/db';

// Data structure for file storage
export interface StoredData {
	version: string;
	exportedAt: string;
	checksum?: string; // SHA-256 hash of data content (excludes checksum field itself)
	transactions: Transaction[];
	categories: Category[];
	monthlyBudgets: MonthlyBudget[];
	categoryBudgets: CategoryBudget[];
	settings: Settings;
	savingsAccounts?: SavingsAccount[];
	savingsContributions?: SavingsContribution[];
	linkedAccounts?: LinkedAccount[];
	balanceSnapshots?: BalanceSnapshot[];
}

/**
 * Result of attempting to read and validate the data file
 */
export type ReadDataResult =
	| { status: 'success'; data: StoredData }
	| { status: 'not_found' }
	| { status: 'corrupted'; error: string }
	| { status: 'checksum_mismatch'; data: StoredData };

/**
 * Result of attempting to recover from backups
 */
export type RecoveryResult =
	| { status: 'recovered'; data: StoredData; backupName: string }
	| { status: 'no_valid_backup' };
