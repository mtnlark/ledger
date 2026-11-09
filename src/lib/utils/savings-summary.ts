import { sumCurrency } from './currency';

/** Signed cash savings stays compatible with forecasts and saved goal calculations. */
export function summarizeSavings(events: { amount: number; source: string }[]) {
	const cash = events.filter(c => c.source === 'bank_transfer' || c.source === 'other');
	return {
		added: sumCurrency(events.filter(c => c.amount > 0).map(c => c.amount)),
		withdrawals: sumCurrency(cash.filter(c => c.amount < 0).map(c => -c.amount)),
		cashContributions: sumCurrency(cash.filter(c => c.amount > 0).map(c => c.amount)),
		netSaved: sumCurrency(events.map(c => c.amount)),
		netCashSaved: sumCurrency(cash.map(c => c.amount))
	};
}
