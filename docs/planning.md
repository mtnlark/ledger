# Month-end spending forecast

Current implementation: [dashboard](../src/routes/+page.svelte), [forecast card](../src/lib/components/BudgetForecastCard.svelte), [inferred bills](../src/lib/stores/forecast.ts) and [pure calculations](../src/lib/planning/forecast.ts). [Architecture](architecture.md) documents the persistence rules that also apply to saved planning data.

Ledger keeps its familiar dashboard, transaction entry, savings, shared expenses, and weekly summary. The Planning tab, scenario previews, unified goal planner, review actions, templates, repeat buttons, and financial-event creation forms have been removed.

The current-month dashboard shows **Expected month-end spending**: your share of recorded expenses, upcoming entries and estimated bills, plus remaining everyday spending. “How this is estimated” stays collapsed and shows the breakdown, historical spending range, reserved savings, and expected budget remainder. This is a budget estimate, not a forecast of bank balances or payment timing.

## Bills and recorded payments

`stores/forecast.ts` reuses existing recurring detection, subscription settings, cancellations, confirmed-active overrides, and fixed recurring amounts. The inferred schedules exist only for the calculation; they never create saved plans or transactions. Stale patterns are excluded unless confirmed active. Existing recurring suggestions still add reviewable transactions through their familiar workflow.

`planning/forecast.ts` matches bills to purchases once, including category splits. Automatic matching uses merchant, category and nearby dates; fixed subscription amounts also require a close amount. Detected bill amounts are estimates, so an actual variable payment replaces the estimate. Explicit saved schedule links take precedence, including payments recorded in another month. Automatic candidates are indexed by month and normalized merchant; purchase dates, amounts and categories are prepared once per refresh. Matching keeps the original purchase order when candidate scores tie. Future payments count as upcoming entries rather than an additional bill reservation. Unmatched bills remain in the estimate after their expected day. Past months do not reserve unpaid estimates; the dashboard forecast appears only for the current month.

## Everyday spending and savings

The ordinary baseline uses the median spending over the equivalent remaining days in up to six completed months. Completed zero-spending months within recorded history are included. Matched recurring bills, subscriptions, saved expected one-offs and refunds are excluded from this baseline. For a historical recurring merchant/category match, the entire qualifying purchase is excluded, including every category allocation of a split. A separate purchase at the same merchant stays eligible when none of its categories qualify. All recorded expenses and refunds still count in actual spending totals. Future ordinary entries offset the remaining estimate to prevent double counting. With no completed history, the fallback starts after day seven and extrapolates ordinary spending only.

The range uses the minimum and maximum historical remaining-day amounts. It describes past variation, not a confidence interval. With limited history, the explanation makes the reduced coverage clear.

Savings contributions from `bank_transfer` and `other`, including future entries, stay reserved. Previously saved monthly savings plans reserve only the portion not already entered. Payroll deductions, interest and employer matches do not reduce the spending budget. Withdrawals release money for their month and appear as **From savings** beside positive reserved savings in the disclosure. The forecast’s `savings` field remains signed (cash contributions minus withdrawals), preserving saved goal calculations. Optional category funding allocates the released money once; it changes allowances, not spending estimates. Income and category rollover determine the estimated budget remainder after spending and savings.

## Refresh and save acknowledgments

The dashboard uses one awaited refresh after transaction edits, additions, deletions, recurring batches and subscription cancellation, and on navigation, undo and Quick Add events. It always reloads history, including an initially empty ledger. [The dashboard loader](../src/lib/stores/dashboard.ts) rebuilds inferred bills and calculates the forecast from plain store results before publishing the complete view; filtering and modal state do not recalculate it through reactive transaction proxies.

Dashboard and Budget requests carry a generation and selected month. A superseded request or one finishing after unmount cannot publish state or errors. Budget also listens for the existing transaction-change event and refreshes spending, suggestions, contributions and rollover together. A view refresh failure after a durable save reports a refresh error and leaves the save successful, so retrying a view never replays the financial operation. Disk-save failures continue to use the persistence barrier and snapshot retry.

Regression evidence, production-compiled benchmark results and native verification are recorded in [forecast audit verification](forecast-audit.md). Historical integrity evidence in [audit-fixes.md](audit-fixes.md) remains unchanged.

## Saved-data compatibility

Existing `Settings.planning` schedules, savings plans, templates, settlements and completeness dates remain preserved and validated. Existing refunds, withdrawals, bank references and payment allocations retain their financial effects and reference protections. The UI simplification does not delete or migrate user records. The calculation and compatibility stores remain covered by tests.

`tools/native-smoke/prepare-planning.mjs` creates a separate native dev app with fixture data and verifies the actual dashboard, forecast disclosure, navigation, familiar entry form, durable saves through the real entry handlers, immediate forecast refresh, light/dark rendering, keyboard focus and restart. Stop dev processes before rebuilding production.

Regression coverage lives in `src/lib/planning/forecast.test.ts`, `src/lib/stores/forecast.test.ts`, `src/lib/components/BudgetForecastCard.test.ts` and the compatibility tests in `src/lib/stores/planning.test.ts` and `src/tests/utils/form-split-migration.test.ts`. Run focused tests with `npm run test:run -- <test-path>`; follow [native smoke instructions](../tools/native-smoke/README.md) for real filesystem/restart checks.
