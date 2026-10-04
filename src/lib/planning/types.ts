import type { Transaction } from '$lib/db';

export interface ExpenseSchedule {
	id: string;
	merchant: string;
	date: string; // Local YYYY-MM-DD; anchor day is preserved in short months.
	frequency: 'once' | 'monthly' | 'semi-annual' | 'annual';
	amount: number;
	amountType: 'fixed' | 'variable';
	categoryId: number;
	isShared: boolean;
	splitType: 'percentage' | 'fixed';
	splitValue: number;
	notes?: string;
	allocations?: { categoryId: number; amount: number; notes?: string }[];
	active: boolean;
	autoMatch?: boolean;
}

export interface SavingsPlan {
	id: string;
	accountId: number;
	amount: number;
	startMonth: string;
	endMonth?: string;
}

export interface EntryTemplate {
	id: string;
	name: string;
	entry: Pick<Transaction, 'merchant' | 'amount' | 'categoryId' | 'isShared' | 'splitType' | 'splitValue' | 'isEssential' | 'isSubscription' | 'subscriptionFrequency' | 'notes' | 'isExpectedOneOff'>;
	splits?: { categoryId: number; amount: number; notes?: string }[];
}

export interface SettlementPayment {
	id: string;
	date: string;
	amount: number;
	direction?: 'received' | 'sent';
	notes?: string;
	allocations: { transactionId: number; amount: number }[];
}

export interface PlanningData {
	schedules: ExpenseSchedule[];
	savingsPlans: SavingsPlan[];
	templates: EntryTemplate[];
	settlements: SettlementPayment[];
	completeThrough?: string;
}

export const emptyPlanning = (): PlanningData => ({ schedules: [], savingsPlans: [], templates: [], settlements: [] });
