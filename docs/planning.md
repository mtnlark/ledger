# Personal planning desk

Planning connects monthly budget estimates, confirmed expenses, and savings goals without creating recorded activity during a preview.

## Monthly budget and forecast

The dashboard separates recorded spending (through today), upcoming commitments (future entries and unmatched schedules), committed savings, and remaining monthly budget. Savings plans reserve the portion not already covered by entered contributions. Future-dated contributions remain reserved. Payroll deductions, interest, and employer matches do not reduce the monthly spending budget; withdrawals return money to it.

The expected month-end remainder subtracts estimated remaining ordinary spending from that remaining budget. Its explanation includes the historical remainder range, based on the minimum and maximum remaining-day spending in up to six completed months. The central estimate uses the median. Completed zero-spending months inside the recorded history are included. Scheduled bills, subscriptions, expected one-offs, and refunds are excluded from the ordinary baseline; refunds and one-offs remain in actual spending totals. Explicit future variable entries offset the estimate so they count once.

With no historical baseline, ordinary spending can be projected by day starting on day eight; early-month estimates include only recorded activity and confirmed plans. Future forecasts use recent completed history, rather than extrapolating early rent or assuming that distant future months have a new history. These are budget estimates, not bank cash or payment-timing forecasts. Missing records and uncertain bill estimates still affect accuracy.

## Commitments

Accepted recurring suggestions become editable schedules. Each has an anchor date, fixed or estimated full amount, category, sharing settings, and monthly, semiannual, annual, or one-time frequency. Day 31 clamps to a short month's last day without changing the anchor. Category allocations are retained for split recurring bills.

Existing purchases match schedules once at the purchase level, including category splits. Automatic matches require the merchant, category, same month, date proximity (seven days), and a close fixed amount (5%); variable bills can differ in amount. Explicit schedule links and occurrence dates support payments made outside the due month. Unmatched overdue commitments remain reserved in the current/future budget. Past-month totals reflect recorded history.

Record a payment from Planning with its actual amount and date, or explicitly link an existing entry in its editor. Simulator purchases require an explicit payment link by default, so a preview cannot absorb a nearby recorded purchase. Schedule editing can enable automatic matching. Removing a plan preserves recorded payments.

## Scenarios and goals

The purchase simulator compares a one-time purchase, monthly expense, or savings-plan change. It shows the month-end remainder and goal dates with savings unchanged or revised. The income assumption is editable and is not written to the monthly budget. A temporary savings override ends after the selected month and the original plan resumes. Applying a scenario requires reviewing and confirming the exact schedules/contribution plans. No transactions or contributions are inserted by applying it.

Goal projections use as-of allocated balances, future entered contributions, explicit monthly plans, and one available pool after expected expenses. When requests exceed that pool, all savings plans share it proportionally; goals cannot each claim the entire remainder. External payroll/interest/employer funding is separate. No completion estimate is shown when a goal cannot complete within the 50-year projection horizon. Savings account cards retain historical contribution-based status and link to the combined planner.

Several savings goals can reference the same bank account through `SavingsAccount.linkedAccountId`. Allocated balances are explicit. Assigning/editing allocations cannot claim more than the latest bank balance. Contributions continue updating savings intentions; a bank sync never overwrites them. Planning displays the latest bank balance, its date/status, combined allocations, and an unexplained difference requiring review. A difference does not establish that a transfer is pending. Later contributions or bank-balance changes can create a difference that needs review.

## Review, entry, and financial events

Weekly review has three decisions: confirm completeness through a chosen date (including zero-spending weeks), review an expense as an expected one-off or review bills, and adjust upcoming plans using the estimate. Completeness is persisted separately from entry activity; a recent completeness confirmation suppresses the stale-entry nudge.

“Repeat” opens today's entry with the full purchase's sharing, category splits, notes, and tags, ready for review. Save an explicit named template from an entry's editor and select it in Add Transaction. Global notes and individual split notes survive entry, splitting, and editing.

Refunds are separate negative transactions linked to the original purchase allocation. Cumulative partner-share rounding ensures that a fully refunded shared purchase nets to zero. Refunds cannot exceed the purchase. Financial amounts on refunds are fixed; an unallocated event can be removed and corrected. Savings withdrawals are negative contributions with `kind: 'withdrawal'`, reduce goal funding, and cannot overdraw a savings allocation.

Settlement payments have amounts, dates, optional notes, and allocations. Partial reimbursements leave the remaining share outstanding. Refunds credit a partner's unpaid share; refunds after reimbursement can be repaid through a “sent” payment. Settlement events do not change spending. Existing batch marking remains available for legacy settlement records. Referenced purchases and split allocation IDs are protected from deletion/replacement so refund and payment history stays intact.

## Persistence and verification

`Settings.planning` is an optional, backward-compatible collection of schedules, savings plans, templates, settlement payments, and the completeness date. Financial events extend existing transaction/contribution records. Local date strings in plans preserve calendar dates; existing serialization revives recorded dates. All mutations use Ledger's serialized database/disk acknowledgment path, and backup validation checks planning shapes and references.

Unit and rendered component tests cover rent, variable bills, matching, future savings, shared goal funding, temporary plans, preview purity/confirmation, split templates, refunds, withdrawals, settlements, and stale bank allocations. `tools/native-smoke/prepare-planning.mjs` creates a disposable native dev workspace and separate app identifier; its automatic route verifies the UI, event calculations, strict disk readback, and a native restart. It never reads or modifies the main Ledger data.
