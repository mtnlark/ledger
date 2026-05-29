/**
 * Result of a validation check
 */
export interface ValidationResult {
	isValid: boolean;
	error?: string;
}

/**
 * Result of split value validation
 */
interface SplitValueValidationResult extends ValidationResult {
	correctedValue?: number;
}

/**
 * Split line data structure
 */
export interface SplitLine {
	categoryId: number;
	amount: number;
}

/**
 * Result of split lines validation
 */
interface SplitLinesValidationResult extends ValidationResult {
	total: number;
	remaining: number;
}

/**
 * Validate transaction amount
 */
export function validateAmount(amount: number): ValidationResult {
	if (amount <= 0) {
		return { isValid: false, error: 'Amount must be greater than 0' };
	}
	return { isValid: true };
}

/**
 * Validate merchant name
 */
export function validateMerchant(merchant: string): ValidationResult {
	if (!merchant.trim()) {
		return { isValid: false, error: 'Merchant is required' };
	}
	return { isValid: true };
}

/**
 * Validate category selection
 */
export function validateCategory(categoryId: number): ValidationResult {
	if (categoryId <= 0) {
		return { isValid: false, error: 'Category is required' };
	}
	return { isValid: true };
}

/**
 * Validate split value based on type
 * @param splitType 'percentage' or 'fixed'
 * @param splitValue The split value to validate
 * @param amount The total transaction amount (for fixed type validation)
 * @returns Validation result with optional corrected value
 */
export function validateSplitValue(
	splitType: 'percentage' | 'fixed',
	splitValue: number,
	amount: number
): SplitValueValidationResult {
	if (splitType === 'percentage') {
		if (splitValue < 0) {
			return { isValid: false, correctedValue: 0 };
		}
		if (splitValue > 1) {
			return { isValid: false, correctedValue: 1 };
		}
		return { isValid: true };
	} else {
		// fixed type
		if (splitValue < 0) {
			return { isValid: false, correctedValue: 0 };
		}
		if (splitValue > amount) {
			return { isValid: false, correctedValue: amount };
		}
		return { isValid: true };
	}
}

/**
 * Validate split lines for split-by-category transactions
 * @param splits Array of split lines
 * @param totalAmount The total transaction amount that splits must sum to
 * @returns Validation result with totals
 */
export function validateSplitLines(
	splits: SplitLine[],
	totalAmount: number
): SplitLinesValidationResult {
	// Calculate totals
	const total = splits.reduce((sum, line) => sum + (line.amount || 0), 0);
	const remaining = totalAmount - total;

	// Need at least 2 lines
	if (splits.length < 2) {
		return {
			isValid: false,
			error: 'At least 2 split lines are required',
			total,
			remaining
		};
	}

	// All lines must have a category
	if (splits.some((line) => line.categoryId <= 0)) {
		return {
			isValid: false,
			error: 'All split lines must have a category selected',
			total,
			remaining
		};
	}

	// All lines must have a positive amount
	if (splits.some((line) => line.amount <= 0)) {
		return {
			isValid: false,
			error: 'All split lines must have an amount greater than 0',
			total,
			remaining
		};
	}

	// Total must match (with small tolerance for rounding)
	if (Math.abs(remaining) >= 0.01) {
		return {
			isValid: false,
			error: `Split amounts must equal ${totalAmount.toFixed(2)}`,
			total,
			remaining
		};
	}

	return { isValid: true, total, remaining };
}

/**
 * Check if a date is in the future
 * @param date The date to check
 * @returns true if the date is after today
 */
export function validateFutureDate(date: Date): boolean {
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const checkDate = new Date(date);
	checkDate.setHours(0, 0, 0, 0);

	return checkDate > today;
}

/**
 * Validate a complete transaction form submission
 * @returns Object with validation results for each field
 */
export function validateTransactionForm(data: {
	merchant: string;
	amount: number;
	categoryId: number;
	isSplitMode: boolean;
	splits?: SplitLine[];
	isFutureDate?: boolean;
	futureDateConfirmed?: boolean;
}): { isValid: boolean; errors: Record<string, string> } {
	const errors: Record<string, string> = {};

	// Merchant validation
	const merchantResult = validateMerchant(data.merchant);
	if (!merchantResult.isValid && merchantResult.error) {
		errors.merchant = merchantResult.error;
	}

	// Amount validation
	const amountResult = validateAmount(data.amount);
	if (!amountResult.isValid && amountResult.error) {
		errors.amount = amountResult.error;
	}

	// Category validation (only if not in split mode)
	if (!data.isSplitMode) {
		const categoryResult = validateCategory(data.categoryId);
		if (!categoryResult.isValid && categoryResult.error) {
			errors.category = categoryResult.error;
		}
	}

	// Split lines validation (only in split mode)
	if (data.isSplitMode && data.splits) {
		const splitResult = validateSplitLines(data.splits, data.amount);
		if (!splitResult.isValid && splitResult.error) {
			errors.splits = splitResult.error;
		}
	}

	// Future date validation
	if (data.isFutureDate && !data.futureDateConfirmed) {
		errors.date = 'Future date must be confirmed';
	}

	return {
		isValid: Object.keys(errors).length === 0,
		errors
	};
}
