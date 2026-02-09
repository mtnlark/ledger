// Type definitions
export interface Transaction {
	id?: number;
	date: Date;
	merchant: string;
	amount: number;
	categoryId: number;
	isShared: boolean;
	splitType: 'percentage' | 'fixed';
	splitValue: number;
	partnerShare: number;
	isSettled: boolean;
	settledDate?: Date;
	notes?: string;
	isEssential: boolean; // Needs vs wants - defaults from category but can be overridden
	isSubscription: boolean; // Recurring subscription payment
	subscriptionFrequency?: 'monthly' | 'semi-annual' | 'annual'; // Billing frequency for subscriptions
	parentTransactionId?: number; // Links split children to their parent transaction
	isSplitParent?: boolean; // True if this transaction has been split into children
	isDeleted?: boolean; // True if soft-deleted (awaiting permanent removal or undo)
	deletedAt?: Date; // When the transaction was soft-deleted
	createdAt: Date;
	updatedAt: Date;
}

export interface Category {
	id?: number;
	name: string;
	icon?: string;
	color?: string;
	isActive: boolean;
	sortOrder: number;
	isEssential: boolean; // Needs vs wants - essential spending
}

export interface MonthlyBudget {
	id?: number;
	month: string; // "2025-12" format
	income: number;
	savedAmount: number;
	notes?: string;
}

export interface CategoryBudget {
	id?: number;
	month: string; // "YYYY-MM" format
	categoryId: number; // References Category.id
	budgetAmount: number; // Target spending limit
	createdAt: Date;
	updatedAt: Date;
}

export interface CancelledSubscription {
	merchant: string; // Normalized merchant name
	cancelledDate: string; // ISO date string
	amount?: number; // When set, cancellation targets this specific subscription amount
}

export interface CompletedGoal {
	accountName: string;
	targetAmount: number;
	completedDate: string; // ISO date string
	icon?: string; // Preserve for display
	color?: string;
}

// Savings account types
export type SavingsAccountType = 'savings' | 'retirement' | 'investment';

export type ContributionSource =
	| 'payroll_deduction'
	| 'bank_transfer'
	| 'interest'
	| 'employer_match'
	| 'other';

/**
 * Contribution source metadata - single source of truth for labels and behavior
 */
export const CONTRIBUTION_SOURCES: Record<
	ContributionSource,
	{ label: string; description: string; affectsAvailable: boolean }
> = {
	payroll_deduction: {
		label: 'Payroll Deduction',
		description: 'Pre-tax (401k, etc.)',
		affectsAvailable: false
	},
	bank_transfer: {
		label: 'Bank Transfer',
		description: 'From checking account',
		affectsAvailable: true
	},
	interest: {
		label: 'Interest',
		description: 'Interest earned',
		affectsAvailable: false
	},
	employer_match: {
		label: 'Employer Match',
		description: '401k match, etc.',
		affectsAvailable: false
	},
	other: {
		label: 'Other',
		description: 'Other source',
		affectsAvailable: true
	}
} as const;

export interface SavingsAccount {
	id?: number;
	name: string;
	accountType: SavingsAccountType;
	icon?: string;
	color?: string;
	sortOrder: number;
	currentBalance?: number; // Only tracked for 'savings' type
	targetAmount?: number; // Goal target (e.g., $10,000)
	targetDate?: Date; // Goal deadline (e.g., Dec 31, 2026)
	createdAt: Date;
	updatedAt: Date;
}

export interface SavingsContribution {
	id?: number;
	date: Date;
	accountId: number;
	amount: number;
	source: ContributionSource;
	notes?: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface Settings {
	id: number; // Always 1 (singleton)
	partnerName: string;
	defaultSplitType: 'percentage' | 'fixed';
	defaultSplitValue: number;
	currency: string;
	theme: 'light' | 'dark' | 'system';
	dismissedRecurring: string[]; // Normalized merchant names to hide from recurring detection
	cancelledSubscriptions: CancelledSubscription[]; // Subscriptions user has marked as cancelled
	confirmedActiveSubscriptions: string[]; // Normalized merchant names user confirmed are still active (override staleness)
	iCloudBackupEnabled: boolean; // Whether to copy backups to iCloud Drive
	lastAutoSuggestedMonth?: string; // "YYYY-MM" format - tracks when recurring suggestions were last shown
	completedGoals: CompletedGoal[]; // Archived savings goals that have been completed
	notificationsEnabled: boolean; // Master toggle for all notifications (opt-in)
	dailyReminderEnabled: boolean; // Whether to send daily expense reminder
	dailyReminderTime: string; // "HH:MM" 24h format for daily reminder
	weeklyReviewEnabled: boolean; // Whether to send weekly review prompt (Monday 9am)
	monthlyBudgetSetupEnabled: boolean; // Whether to send monthly budget setup prompt (1st of month)
	migrationVersion?: number; // Tracks which migrations have been applied (skip all if current)
}

// Default categories from your spreadsheets
// Warm Ledger color palette - muted, earthy tones
export const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
	{ name: 'Car', icon: '🚗', color: '#7C8B99', isActive: true, sortOrder: 1, isEssential: true },
	{ name: 'Cash withdrawals', icon: '💵', color: '#6B8E6B', isActive: true, sortOrder: 2, isEssential: false },
	{ name: 'Clothes & accessories', icon: '👕', color: '#C49BA0', isActive: true, sortOrder: 3, isEssential: false },
	{ name: 'Coffee & snacks', icon: '☕', color: '#A67B5B', isActive: true, sortOrder: 4, isEssential: false },
	{ name: 'Donations', icon: '💝', color: '#D4A59A', isActive: true, sortOrder: 5, isEssential: false },
	{ name: 'Electronics', icon: '📱', color: '#6B7B8C', isActive: true, sortOrder: 6, isEssential: false },
	{ name: 'Fitness & wellness', icon: '🏋️', color: '#5B8A8A', isActive: true, sortOrder: 7, isEssential: false },
	{ name: 'Fun & hobbies', icon: '🎮', color: '#9B8AA6', isActive: true, sortOrder: 8, isEssential: false },
	{ name: 'Gas', icon: '⛽', color: '#D4915D', isActive: true, sortOrder: 9, isEssential: true },
	{ name: 'Gifts', icon: '🎁', color: '#C9A9A9', isActive: true, sortOrder: 10, isEssential: false },
	{ name: 'Groceries', icon: '🛒', color: '#5B8C5A', isActive: true, sortOrder: 11, isEssential: true },
	{ name: 'Grooming', icon: '💇', color: '#7BA3A3', isActive: true, sortOrder: 12, isEssential: false },
	{ name: 'Health', icon: '🏥', color: '#B87070', isActive: true, sortOrder: 13, isEssential: true },
	{ name: 'Home', icon: '🏠', color: '#8B7B99', isActive: true, sortOrder: 14, isEssential: false },
	{ name: 'Household supplies', icon: '🧹', color: '#8A847C', isActive: true, sortOrder: 15, isEssential: true },
	{ name: 'Insurance', icon: '🛡️', color: '#6B8299', isActive: true, sortOrder: 16, isEssential: true },
	{ name: 'Parking & tolls', icon: '🅿️', color: '#9C9588', isActive: true, sortOrder: 17, isEssential: true },
	{ name: 'Pet', icon: '🐈‍⬛', color: '#C4956A', isActive: true, sortOrder: 18, isEssential: true },
	{ name: 'Rent', icon: '🏢', color: '#7B6B8C', isActive: true, sortOrder: 19, isEssential: true },
	{ name: 'Restaurants', icon: '🍽️', color: '#C45D3A', isActive: true, sortOrder: 20, isEssential: false },
	{ name: 'Travel', icon: '✈️', color: '#5B8B8B', isActive: true, sortOrder: 21, isEssential: false },
	{ name: 'Utilities', icon: '💡', color: '#C9A855', isActive: true, sortOrder: 22, isEssential: true }
];

// Derived lookup maps for migrations (single source of truth)
export const CATEGORY_COLORS: Record<string, string> = Object.fromEntries(
	DEFAULT_CATEGORIES.map((c) => [c.name, c.color!])
);

export const CATEGORY_ESSENTIAL: Record<string, boolean> = Object.fromEntries(
	DEFAULT_CATEGORIES.map((c) => [c.name, c.isEssential])
);

// Default settings
export const DEFAULT_SETTINGS: Settings = {
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
};

// Default savings accounts
export const DEFAULT_SAVINGS_ACCOUNTS: Omit<SavingsAccount, 'id' | 'createdAt' | 'updatedAt'>[] = [
	{ name: 'Emergency Fund', accountType: 'savings', icon: '☔', color: '#5B8C5A', sortOrder: 1, currentBalance: 0 },
	{ name: 'High-Yield Savings', accountType: 'savings', icon: '🌱', color: '#D4915D', sortOrder: 2, currentBalance: 0 },
	{ name: '401(k)', accountType: 'retirement', icon: '🌅', color: '#C45D3A', sortOrder: 3 },
	{ name: 'Roth IRA', accountType: 'retirement', icon: '🌳', color: '#7B9E87', sortOrder: 4 },
	{ name: 'Brokerage', accountType: 'investment', icon: '🪴', color: '#8B7355', sortOrder: 5 }
];
