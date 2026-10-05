# Integrity audit implementation record

Historical evidence for commit `8a740b5` and its verification run. Timings and test counts below describe that revision, not the current suite or pending work. Current behavior and commands are maintained in [architecture.md](architecture.md) and [development.md](development.md).

The seven implementation stages below map each audit finding to its prevention code and regression coverage. Historical financial changes remain opt-in; the user's current ledger was not altered during development.

| Stage | Findings | Change and evidence |
| --- | --- | --- |
| 1. Startup and recovery | 4 | `tauri-adapter.ts` separates I/O from content corruption, retries primary reads, validates before replacement, blocks writes after initialization failure, and verifies damaged originals. Filesystem fault tests reproduced the older-backup rollback and premature IndexedDB deletion before the fix. |
| 2. Durable records | 1, 13 | Transaction/contribution forms require dates. Queued store operations validate merged records, amounts, and references, including splits and bulk reassignment. Validation and serialization finish before any file writes/rotation; primary legacy reference compatibility is retained. Split parents use an ID map. Regression tests reproduced invalid dates/amounts/references and unsafe saves. |
| 3. Categories and savings | 2, 3, 5, 11, 15 | Account deletion cascades contributions atomically; category deletion rejects historical transaction/budget references and UI offers deactivation. Transfers reverse old and apply new savings amounts using currency helpers. Local calendar deadlines retain a period today or later this month. Contribution grouping appends to new arrays. Store and rendered form tests cover these cases and rollback. |
| 4. Transactions | 6, 8, 9, 10 | Tag reads, transformations, writes, and cache updates share the mutation queue. Detected fixed-share splits reuse purchase-level shares; cancellation/reactivation uses purchase amounts. Undo dispatches refresh after persistence. Interleaving tests reproduced lost edits; purchase and mounted dashboard tests cover corrected behavior. |
| 5. SimpleFIN | 7, 16 | Reconnect uses source plus external ID, preserves IDs/history, and rejects duplicate active mappings inside the queue. Local servers reproduced stalled headers and bodies for claims and fetches. One HTTP client uses 10-second connect/30-second total timeouts with retries disabled. Store/UI tests cover settled busy/status state and another sync after timeout. |
| 6. Reminders | 12 | A current-day async query runs only when due, excludes hidden/deleted rows, prevents overlap, discards old generations/day results, and retries eligibility failures. Fake-clock and database tests cover logging/deletion, midnight, stop/replacement, and duplicate ticks. |
| 7. Historical review | 14 and repair contract | Settings previews structured diagnostics and approved changes for current data and explicitly selected damaged files. Originals live outside pruning/recovery. Strict validation, stale fingerprint rejection, atomic rollback, save failure handling, and native restart/restore are covered. Split child indexing preserves allocation order and eligibility restrictions. |

The new historical review requires all date and reference defects to be resolved before application. Missing categories retain their IDs through inactive placeholders. Orphaned savings contributions require either explicit deletion or an account name, type, and confirmed balance. Balance context never establishes an opening balance. Ambiguous, settled, deleted, or incomplete purchases remain blocked from fixed-share correction and require an explicit edit in the ledger.

The full original snapshot is preserved before a repair. A selected damaged file is also preserved byte-for-byte in a checksummed envelope. Originals are never overwritten by the app, pruned as backups, or selected automatically for recovery. A failed preservation/readback blocks the repair. Successful database changes whose disk save fails remain in the session behind the existing Retry barrier; retry saves the snapshot without replaying repairs.

Benchmark results are median milliseconds from five measured runs after warmup on this Mac. Input sizes count transactions or contributions. The frozen pre-fix algorithms live only under `tools/benchmarks`; the benchmark asserts output equivalence but imposes no timing thresholds on ordinary tests.

| Records | Validation before → after | Split review before → after | Contribution grouping before → after |
| ---: | ---: | ---: | ---: |
| 3,000 | 9.30 → 4.37 | 26.24 → 7.66 | 5.10 → 0.14 |
| 9,000 | 59.26 → 10.74 | 96.72 → 22.94 | 38.48 → 0.08 |
| 27,000 | 474.99 → 32.35 | 703.09 → 67.69 | 780.23 → 0.23 |

Validation and split review approximately triple when input triples at larger sizes. Contribution grouping is below one millisecond after the fix and dominated by measurement/JIT effects at small sizes. Run `npm run test:run -- --config tools/benchmarks/vitest.config.ts` separately from the normal unit suite.

Native production timeout smoke tests confirmed both claims and fetches settle at approximately 30.0 seconds for stalled headers and bodies. These deliberately slow checks are opt-in: `cargo test --offline --manifest-path src-tauri/Cargo.toml production_ -- --ignored --nocapture`. Ordinary offline Rust tests use shorter injected timeouts on the same request paths.

Final verification passed `npm run lint`, `npm run check` (zero errors or warnings), `npm run test:run` (1,750 tests across 92 files), and `npm run build`. Offline Rust tests passed five ordinary tests; both opt-in production timeout smoke tests also passed separately. `cargo clippy --offline --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` passed. Native fixture phases completed all nine save/relaunch, repair, preservation, and restore checks using a separate app identifier.
