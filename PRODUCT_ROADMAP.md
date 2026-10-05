# Ledger product roadmap

Reviewed against the current code in October 2026. Groups 1–9 of the [original roadmap](docs/history/product-roadmap.md) are complete; that document is an archived design record, not a list of remaining tasks. Git history is the full changelog.

## Current product direction

Keep Ledger focused on manual transaction tracking, category budgets, savings goals, shared expenses and actual net-worth balances. The dashboard's current-month spending forecast explains recorded expenses, upcoming entries/bills, estimated everyday spending, reserved savings and expected budget remainder.

The separate Planning tab, scenario previews, pooled goal planner, completeness workflow, templates/repeat actions and financial-event creation forms were removed when the UI was simplified. Saved extended data remains validated, preserved and reflected in financial calculations. Do not restore removed workflows or delete compatibility data as incidental cleanup. See [forecast behavior](docs/planning.md).

## Shipped capabilities

| Area | Current result | Reference |
| --- | --- | --- |
| Durable data and recovery | Queued atomic mutations, checksummed JSON, backup/restore previews, save-failure retry barrier and preserved repair originals | [Architecture](docs/architecture.md), [audit evidence](docs/audit-fixes.md) |
| Budgeting | Monthly income, category budgets, threshold alerts, opt-in surplus rollover and one-month deficit adjustment | `src/lib/stores/categoryBudget.ts`, `src/lib/utils/budget-rollover.ts` |
| Savings | Contribution sources, goals/projections, account moves/deletion and goal-suggestion dismissal | `src/lib/stores/savingsAccounts.ts`, `src/lib/stores/savingsContributions.ts` |
| Transactions | Category splits, tags/search, progressive grouped pagination, recurring suggestions and undo | `src/lib/stores/transactions.ts`, `src/lib/components/TransactionList.svelte` |
| Insights | Five tabs, category/merchant/tag reports, unusual-spend detection, category variance, savings/year summaries and wealth context | `src/lib/insights/`, `src/lib/components/insights/` |
| Subscriptions | Multiple subscriptions per merchant, price-supersession detection, cancellation/confirmed-active overrides | `src/lib/utils/string-helpers.ts`, `src/lib/stores/subscriptionSettings.ts` |
| Net worth | Assets/liabilities, daily balance snapshots, balances-only SimpleFIN, reconnect and freshness/error status | [Net-worth design](NET_WORTH_PLAN.md) |
| Native app | Menu-bar Quick Add with durable acknowledgment, shortcuts, opt-in reminders and window hide/reopen lifecycle | `src/lib/services/quick-add.ts`, `src/lib/notifications/`, `src-tauri/src/lib.rs` |
| Dashboard forecast | Payment-aware bill reservations plus a historical ordinary-spending estimate; no separate planning UI | [Forecast](docs/planning.md) |
| UI and performance | Warm Ledger themes, reusable forms/modals, lazy insight/chart/import chunks, transaction-version memoization and cached recurring detection | [Architecture](docs/architecture.md) |

The original milestone migration stamp was 10; the current app migration stamp is 11. Schema/migration/format versions are distinct and are maintained at their source locations, described in [the persistence checklist](docs/architecture.md#changing-persisted-data).

## Unprioritized candidates

These preserve earlier ideas; none is an authorized implementation task or an ordered backlog.

- Transaction categorization rules beyond historical merchant autofill.
- CSV/OFX statement import with mapping and duplicate review.
- Exportable reports if the existing CSV/JSON workflows are insufficient.
- Year-over-year spending comparisons when enough history exists.
- Full transaction-list virtualization if grouped pagination still shows measurable lag.
- Component extraction when a concrete change exposes duplication or excessive complexity.
- Multi-currency behavior, if needed; a stored currency preference alone does not provide conversion/account-currency handling.
- Optional intent/actual reconciliation reporting. Saved bank references exist for compatibility; any new user-facing workflow needs a specific product decision and must preserve both balances independently.

Priorities come from the user's next request. Preserve the current UI scope and data invariants while making targeted improvements. Current engineering/test/release guidance lives in [AGENTS.md](AGENTS.md) and [development.md](docs/development.md).
