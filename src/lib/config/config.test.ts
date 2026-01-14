import { describe, it, expect } from 'vitest';
import { config } from './index';

describe('config', () => {
	describe('category defaults', () => {
		it('has default icon', () => {
			expect(config.category.defaultIcon).toBe('📝');
		});

		it('has default color', () => {
			expect(config.category.defaultColor).toBe('#8A847C');
		});

		it('has default name', () => {
			expect(config.category.defaultName).toBe('Unknown');
		});
	});

	describe('budget thresholds', () => {
		it('has approaching threshold in dollars', () => {
			expect(config.budget.approachingThreshold).toBe(5);
		});

		it('has epsilon for floating point comparison', () => {
			expect(config.budget.epsilon).toBe(0.5);
		});
	});

	describe('recurring detection', () => {
		it('has max variance threshold (50%)', () => {
			expect(config.recurring.maxVariance).toBe(0.5);
		});

		it('has fixed variance threshold (15%)', () => {
			expect(config.recurring.fixedVarianceThreshold).toBe(0.15);
		});

		describe('interval patterns', () => {
			it('has monthly interval range', () => {
				expect(config.recurring.intervals.monthly.min).toBe(25);
				expect(config.recurring.intervals.monthly.max).toBe(35);
			});

			it('has semi-annual interval range', () => {
				expect(config.recurring.intervals.semiAnnual.min).toBe(160);
				expect(config.recurring.intervals.semiAnnual.max).toBe(200);
			});

			it('has annual interval range', () => {
				expect(config.recurring.intervals.annual.min).toBe(350);
				expect(config.recurring.intervals.annual.max).toBe(380);
			});
		});
	});

	describe('subscription staleness', () => {
		it('has monthly stale threshold in days', () => {
			expect(config.subscription.monthlyStaleDays).toBe(60);
		});

		it('has annual stale threshold in months', () => {
			expect(config.subscription.annualStaleMonths).toBe(13);
		});
	});

	describe('date parsing', () => {
		it('has two-digit year cutoff', () => {
			expect(config.date.twoDigitYearCutoff).toBe(50);
		});
	});

	describe('insights thresholds', () => {
		describe('anomaly detection', () => {
			it('has minimum average for anomaly detection', () => {
				expect(config.insights.anomaly.minAverage).toBe(20);
			});

			it('has ratio threshold for flagging anomalies', () => {
				expect(config.insights.anomaly.ratioThreshold).toBe(1.5);
			});

			it('has max anomalies to show', () => {
				expect(config.insights.anomaly.maxToShow).toBe(2);
			});
		});

		describe('category shift detection', () => {
			it('has early month cutoff in days', () => {
				expect(config.insights.shift.earlyMonthCutoff).toBe(15);
			});

			it('has early month ratio threshold', () => {
				expect(config.insights.shift.earlyMonthRatio).toBe(0.2);
			});

			it('has minimum difference for shift', () => {
				expect(config.insights.shift.minDifference).toBe(30);
			});

			it('has minimum amount for consideration', () => {
				expect(config.insights.shift.minAmount).toBe(20);
			});
		});

		describe('velocity comparison', () => {
			it('has percent change threshold', () => {
				expect(config.insights.velocity.percentThreshold).toBe(5);
			});
		});

		describe('top merchant', () => {
			it('has minimum visits threshold', () => {
				expect(config.insights.topMerchant.minVisits).toBe(2);
			});
		});

		describe('takeaways', () => {
			it('has max takeaways count', () => {
				expect(config.insights.takeaways.maxCount).toBe(3);
			});

			it('has months to average', () => {
				expect(config.insights.takeaways.monthsToAverage).toBe(3);
			});
		});
	});
});
