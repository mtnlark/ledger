# Month-end spending forecast

Ledger keeps its familiar dashboard, transaction entry, savings, shared expenses, and weekly summary. The Planning tab, scenario previews, unified goal planner, review actions, templates, repeat buttons, and financial-event creation forms have been removed.

The current-month dashboard shows **Expected month-end spending**: your share of recorded expenses, upcoming entries and estimated bills, plus remaining everyday spending. “How this is estimated” stays collapsed and shows the breakdown, historical spending range, reserved savings, and expected budget remainder. This is a budget estimate, not a forecast of bank balances or payment timing.

## Bills and recorded payments

`stores/forecast.ts` reuses existing recurring detection, subscription settings, cancellations, confirmed-active overrides, and fixed recurring amounts. The inferred schedules exist only for the calculation; they never create saved plans or transactions. Stale patterns are excluded unless confirmed active. Existing recurring suggestions still add reviewable transactions through their familiar workflow.

`planning/forecast.ts` matches bills to purchases once, including category splits. Automatic matching uses merchant, category and nearby dates; fixed subscription amounts also require a close amount. Detected bill amounts are estimates, so an actual variable payment replaces the estimate. Explicit saved schedule links take precedence. Future payments count as upcoming entries rather than an additional bill reservation. Unmatched bills remain in the estimate after their expected day. Past months do not reserve unpaid estimates; the dashboard forecast appears only for the current month.

## Everyday spending and savings

The ordinary baseline uses the median spending over the equivalent remaining days in up to six completed months. Completed zero-spending months within recorded history are included. Matched recurring bills, subscriptions, saved expected one-offs and refunds are excluded from this baseline. All recorded expenses and refunds still count in actual spending totals. Future ordinary entries offset the remaining estimate to prevent double counting. With no completed history, the fallback starts after day seven and extrapolates ordinary spending only.

The range uses the minimum and maximum historical remaining-day amounts. It describes past variation, not a confidence interval. With limited history, the explanation makes the reduced coverage clear.

Savings contributions from `bank_transfer` and `other`, including future entries, stay reserved. Previously saved monthly savings plans reserve only the portion not already entered. Payroll deductions, interest and employer matches do not reduce the spending budget. Income and category rollover determine the estimated budget remainder after spending and savings.

## Saved-data compatibility

Existing `Settings.planning` schedules, savings plans, templates, settlements and completeness dates remain preserved and validated. Existing refunds, withdrawals, bank references and payment allocations retain their financial effects and reference protections. The UI simplification does not delete or migrate user records. The calculation and compatibility stores remain covered by tests.

`tools/native-smoke/prepare-planning.mjs` creates a separate native dev app with fixture data and verifies the actual dashboard, forecast disclosure, navigation, familiar entry form, durable saves and restart. Stop dev processes before rebuilding production.
