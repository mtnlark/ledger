# Forecast and refresh audit verification

Verified on November 1, 2026, on this Mac with Node 22.15.0. This records the six forecast/dashboard/Budget/account-removal fixes following `bb00dfeb53ba1ff5c65390273084ba602d5ea3f9`. The earlier [integrity audit record](audit-fixes.md) remains historical evidence for its own revision.

## Changes and regression evidence

| Finding | Prevention and coverage |
| --- | --- |
| Empty-ledger dashboard history stays empty after the first entry | All writes await one dashboard refresh, which always loads history. The mounted dashboard test freezes time on day three and verifies the first $42 expense immediately changes projected spending from $0 to $42. |
| Inferred bills become stale after mutations | The refresh rebuilds inference before calculating and publishing the complete view. A bill dated well after its historical due day produces $2,100 instead of $4,100. Mounted coverage continues through editing, deletion and cancellation; existing recurring-batch and undo tests also pass. |
| Historical split bills inflate everyday spending | A recurring merchant/category match excludes every allocation of the qualifying purchase. Fixed and percentage sharing tests use a $2,000 split and retain a separate $42 purchase at the same merchant in a different category. |
| Repeated forecast scans are expensive | One refresh owns an index of local dates, amounts, categories, purchases, month/merchant candidates and explicit schedule links. Inference and calculation share it; the dashboard calculates from plain results before assigning reactive state. Candidate ordering, one-to-one matching, fixed tolerances, variable payments and explicit cross-month links retain coverage. |
| Budget misses Quick Add events | Budget listens for `ledger:transactions-changed` and reloads spending, suggestions, contributions and rollover through its guarded refresh. The mounted test saves a $110 expense against a $100 budget and verifies spending, $10 overage and the category alert. |
| Removing synced accounts fails in the outer mutation | The unlink scope includes `savingsAccounts`. Rendered tests mock credential commands and verify deletion of accounts/snapshots plus savings-reference cleanup, retention of IDs/history in Keep mode, and rollback of all three tables after a deletion failure. |

Both pages use request generations and check the selected month before publication. Delayed-response tests cover overlapping requests, month changes and unmounts, including listener removal and suppression of obsolete errors. A failed refresh after a durable addition or edit does not turn the successful write into a failed submission; a later event refreshes the saved row without duplicating it. Disk-save failures retain the existing persistence barrier and retry semantics.

Saved schedules, cross-month explicit payments, refunds, future entries, overdue bills, savings reservations and saved planning compatibility remain covered. Persisted schemas, exported financial records and Rust commands are unchanged.

Primary regressions: [mounted refresh workflows](../src/tests/components/audit-refresh.test.ts), [dashboard actions](../src/tests/stores/dashboardActions.test.ts), [forecast calculations](../src/lib/planning/forecast.test.ts), [inference](../src/lib/stores/forecast.test.ts), [recurring batches](../src/tests/components/dashboard-recurring.test.ts), [undo](../src/tests/components/dashboard-undo.test.ts) and [connected accounts](../src/lib/components/__tests__/ConnectedAccountsSection.test.ts).

## Production-compiled measurements

Run `node tools/benchmarks/run-forecast.mjs`. The runner uses Vite's production SSR compilation with minification, jsdom and in-memory fake IndexedDB. Frozen matching/calculation and inference algorithms from the pre-fix revision live under `tools/benchmarks/baseline-forecast*.ts`. It asserts calculation, inference and complete refresh output equivalence on the benchmark fixture; the changed split exclusion has separate regression expectations.

Each size spans 36 months, with 45 recurring merchants (one purchase per merchant per month) and unique everyday purchases filling the remaining rows. All benchmark purchases are standalone so the corrected split behavior does not invalidate equivalence. The recurring banner is dismissed in settings for both refresh measurements. Both calculation columns below include index construction in the new implementation. Inference includes its own index construction when measured independently; the complete dashboard refresh shares one index between inference and calculation.

“First” is the first timed invocation after correctness checks, not a cold process/startup measurement. “Repeated” is the median of five subsequent invocations. Before each first refresh measurement, the transaction cache is invalidated; repeated refreshes reuse store caches while rebuilding the forecast index. Refresh measures complete dashboard data loading, inference and calculation, excluding DOM paint, native file startup and durable writes. Baseline calculations use plain arrays too; the extra cost of the former dashboard's reactive transaction proxies is excluded.

Milliseconds, before → after:

| Transactions | Measurement | Calculation | Bill inference | Complete data refresh |
| ---: | --- | ---: | ---: | ---: |
| 3,000 | First | 85.21 → 3.03 | 16.22 → 7.61 | 112.85 → 17.78 |
| 3,000 | Repeated | 81.68 → 4.52 | 19.48 → 7.38 | 101.86 → 8.67 |
| 9,000 | First | 235.74 → 14.55 | 42.96 → 21.72 | 299.25 → 44.76 |
| 9,000 | Repeated | 231.90 → 12.50 | 41.58 → 22.27 | 270.35 → 25.91 |
| 27,000 | First | 710.98 → 37.51 | 132.89 → 76.41 | 1021.49 → 138.00 |
| 27,000 | Repeated | 690.04 → 34.84 | 133.85 → 69.09 | 902.65 → 78.55 |

Repeated calculation improved by 94.6% at 9,000 and 95.0% at 27,000 transactions; the 9,000 result is below the 100 ms target. Repeated complete refresh improved by 90.4% and 91.3%, respectively. Calculation with an already shared index took 0.49, 0.51 and 0.54 ms at the three sizes (first measured: 0.77, 0.73 and 0.80 ms). These are measurements of this synthetic workload, not universal latency guarantees. Timing thresholds are absent from normal CI tests. The runner writes raw results to `.svelte-kit/forecast-benchmark/results.json`.

## Implementation verification run

- Focused regression suites passed, followed by `npm run lint`, `npm run check` (zero errors/warnings), `npm run test:run -- --maxWorkers=2` (1,801 tests in 99 files) and `npm run build`.
- The first unrestricted-worker full run had one timeout in the unrelated historical-review component test during concurrent native compilation. That file passed alone, and the complete two-worker rerun passed without changing that test or its implementation.
- The isolated native fixture submitted a moved $135 bill and a $42 ordinary purchase through the actual dashboard forms, observed immediate forecast updates and modal dismissal, and read both acknowledged entries from strictly validated disk data. Relaunch verified all 17 synthetic records and the updated estimate. Disclosure defaults, light/dark theme tokens, viewport fit, category selection by keyboard and modal/disclosure focus also passed.
- The final native result is `ok: true, restarted: true` under the separate identifier `app.ledger.planningdev09010b061f9e`; preparation details remain in `/private/tmp/ledger-planning-dev-manifest.json`. The fixture app and Vite server were stopped afterwards. Credential operations were mocked in connected-account tests; the native forecast fixture invokes none.

These implementation checks used synthetic data and no live Keychain entries. Release builds and installation follow the separate workflow in [development.md](development.md); native fixtures share the Rust build cache, so installation always requires a fresh build with production configuration.
