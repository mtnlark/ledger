/**
 * Centralized configuration for the Ledger app.
 * All magic numbers and hardcoded values should be defined here.
 */

export const config = {
	/**
	 * Category display defaults when category is not found
	 */
	category: {
		defaultIcon: '📝',
		defaultColor: '#8A847C',
		defaultName: 'Unknown'
	},

	/**
	 * Budget alert thresholds
	 */
	budget: {
		/** Threshold for "approaching budget" alert (within $X of limit) */
		approachingThreshold: 5,
		/**
		 * Epsilon for floating point comparison.
		 * Using $0.50 because formatCurrency rounds to whole dollars,
		 * so any amount < $0.50 would display as $0
		 */
		epsilon: 0.5
	},

	/**
	 * Recurring expense detection thresholds
	 */
	recurring: {
		/** Maximum coefficient of variation to be considered recurring (50%) */
		maxVariance: 0.5,
		/** Variance threshold below which amount is "fixed" vs "variable" (15%) */
		fixedVarianceThreshold: 0.15,
		/** Interval patterns for frequency detection (in days) */
		intervals: {
			monthly: { min: 25, max: 35 },
			semiAnnual: { min: 160, max: 200 },
			annual: { min: 350, max: 380 }
		}
	},

	/**
	 * Subscription staleness detection
	 */
	subscription: {
		/** Days without charge before monthly subscription is considered stale */
		monthlyStaleDays: 60,
		/** Months without charge before annual subscription is considered stale */
		annualStaleMonths: 13
	},

	/**
	 * Date parsing configuration
	 */
	date: {
		/** 2-digit years below this are 2000s, at or above are 1900s */
		twoDigitYearCutoff: 50
	},

	/**
	 * Insights and smart takeaways thresholds
	 */
	insights: {
		/** Anomaly detection settings */
		anomaly: {
			/** Minimum 3-month average to detect anomalies ($) */
			minAverage: 20,
			/** Ratio above which to flag as anomaly (1.5 = 50% higher) */
			ratioThreshold: 1.5,
			/** Maximum number of anomalies to show */
			maxToShow: 2
		},
		/** Category shift detection settings */
		shift: {
			/** Days into month to consider "early" */
			earlyMonthCutoff: 15,
			/** Ratio threshold for early month skip (current/previous) */
			earlyMonthRatio: 0.2,
			/** Minimum dollar difference to show shift */
			minDifference: 30,
			/** Minimum amount in either month to consider */
			minAmount: 20
		},
		/** Spending velocity comparison */
		velocity: {
			/** Minimum percent change to show comparison */
			percentThreshold: 5
		},
		/** Top merchant detection */
		topMerchant: {
			/** Minimum visits to show merchant */
			minVisits: 2
		},
		/** General takeaways settings */
		takeaways: {
			/** Maximum number of takeaways to display */
			maxCount: 3,
			/** Number of months to average for comparisons */
			monthsToAverage: 3
		}
	}
} as const;

/** Type for the config object */
export type AppConfig = typeof config;
