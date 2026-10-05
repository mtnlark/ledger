# Working on Ledger

Ledger is a personal, local-first macOS desktop app: SvelteKit 2 / Svelte 5, TypeScript, Tailwind CSS 4, and Tauri 2 / Rust. Transactions are manual or Excel-imported; SimpleFIN reads balances only. Preserve the familiar budgeting workflow and the user's financial history.

## Start here

- Check `git status --short --branch` before editing; preserve existing work and local commits.
- Read the relevant code and nearby tests before choosing an approach. Verify reported behavior with evidence; if a fix fails, revisit the hypothesis.
- This file is the shared instruction source for coding agents. `CLAUDE.md` points here. Update the relevant documentation when behavior, commands, or invariants change.
- Complete the requested scope. Commit, push, build a desktop release, or install it when the task calls for those actions; a documentation edit does not require deployment.

| Need | Read |
| --- | --- |
| Product overview and documentation index | [README.md](README.md) |
| Setup, checks, native testing, build and installation | [docs/development.md](docs/development.md) |
| Storage, data invariants, source map and UI conventions | [docs/architecture.md](docs/architecture.md) |
| Month-end forecast and saved planning compatibility | [docs/planning.md](docs/planning.md) |
| Net worth, balance sync and credentials | [NET_WORTH_PLAN.md](NET_WORTH_PLAN.md) |
| Shipped work and unprioritized ideas | [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) |
| Integrity audit evidence | [docs/audit-fixes.md](docs/audit-fixes.md) |

`docs/history/` contains archived proposals, including superseded commands and component names. Read it only for historical context; it is not an implementation checklist. Git history is the full changelog.

Machine-local permission caches such as `.claude/settings.local.json` record previous grants, not current workflow requirements. Historical command bodies in those files are not project instructions.

## Development and verification

Run commands from the repository root. Node 22 matches CI. Use `npm ci` when dependencies need installing.

```bash
npm run dev                    # browser UI at localhost:5174
npm run tauri:dev              # native app; starts Vite itself
npm run lint
npm run check
npm run test:run               # finite run; npm test is watch mode
npm run build                  # frontend only, output in build/
npm run tauri:build            # native release; builds frontend automatically
```

For Rust changes, ensure `build/` exists (`mkdir -p build` is CI's compile-only setup), then run:

```bash
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

- During development, run focused tests, e.g. `npm run test:run -- src/lib/stores/transactions.test.ts`. For application changes, finish with lint, type/Svelte checks and the full frontend suite; add Rust checks for Rust changes.
- Add meaningful regression coverage for changed financial, persistence, concurrency or migration behavior. Reproduce bugs in a test before fixing them when practical. Rendered component tests matter when the failure is in a user workflow.
- Documentation-only changes need command/source and link checks, not new application tests or a production build. Report what was actually checked.
- Browser mode lacks native file persistence, tray, notifications and Keychain. Use [isolated native smoke fixtures](tools/native-smoke/README.md) for those behaviors. Normal `tauri:dev` uses the production app identifier and data directory; it is not an isolated fixture app.
- Avoid routine cache deletion. `npm run build` does not produce a `.app`; use `tauri:build`. See development docs for targeted cleanup and installation.

## Data rules

- The desktop JSON file is durable truth; Dexie / IndexedDB is the runtime query layer. Startup selects and validates data before atomically replacing Dexie. Do not clear IndexedDB or seed defaults ahead of file validation.
- Use store operations and `runMutation(tables, operation)` from `src/lib/storage/mutation.ts` for normal writes. Include every table read or written in the transaction. Read-modify-write operations belong inside the queue. Nested store calls share the outer transaction and save acknowledgment.
- A disk failure can occur **after** the database commit. Respect `PersistenceError.applied` and the save barrier. Retry the current snapshot via `retryPersistence()`; replaying the original operation can duplicate money or records. Never report success before the disk save resolves.
- Restore and historical repair use preview, revalidation, original/recovery backup, atomic replacement and cache/view refresh. Preserve that flow. A readable primary file may retain legacy dangling references with warnings; restore and recovery candidates must pass strict validation.
- Adding persisted fields/tables requires checking types, Dexie schema, full/incremental serialization, adapter table lists, backup validation, import/export/restore, date revival and migrations. Use the [persistence checklist](docs/architecture.md#changing-persisted-data); the old six-touchpoint plan is obsolete.
- `Settings.planning` and saved refunds, withdrawals, bank references and payment allocations remain supported. Removed creation forms do not justify deleting their records, validation, calculations or reference protections.
- The main window is the single writer. Quick Add reads shared Dexie and submits a request ID to the main window; it must not initialize storage, write records or run background sync/reminders. Acknowledgment follows durable save; timeout retries reuse the request ID.
- Do not modify live financial files or Keychain entries to test code. Use synthetic fixtures and separate app identifiers. Keep user data and generated financial reports out of commits.

## Financial rules

- Use `src/lib/utils/currency.ts` (`roundCurrency`, `sumCurrency`, `getUserAmount`, comparison helpers). Compare unrounded percentages at thresholds; round for display. Percentage `splitValue` is a coefficient: `0.5` means 50%; fixed `splitValue` is the partner's dollar amount.
- Spending counts the user's share and excludes soft-deleted rows and hidden split parents. Use existing purchase grouping and integer-cent allocation helpers so split children do not duplicate totals or multiply fixed partner shares.
- Transaction/contribution dates are local calendar days. Use `parseLocalDate`, `parseStoredDate`, `formatDateForInput` and the month helpers in `$lib/db`; reserve UTC/ISO instants for timestamps. Do not parse a date-only input with `new Date('YYYY-MM-DD')`.
- Only `bank_transfer` and `other` contributions affect available spending money. Future contributions remain reserved. Preserve withdrawal signs and contribution balance reversal when moving or deleting records.
- `SavingsAccount` describes intent/goals; `LinkedAccount` describes actual balances. Bank sync must never overwrite savings balances. Liabilities store positive debt balances and subtract by account class. Use `recordBalance` / `applyBalanceSync` for snapshot consistency.
- Referenced categories are deactivated rather than deleted. Savings account deletion cascades contributions atomically. Purchase IDs referenced by refunds or payments must survive edits.
- Forecast schedules inferred from recurring detection exist only in memory; they must not create transactions or saved plans. Keep actual payments, future entries, bills and savings reservations counted once. See [forecast details](docs/planning.md).

## Implementation conventions

- Preserve surrounding formatting; Svelte/TypeScript generally use tabs, Rust and CSS use spaces. Use Svelte 5 runes and existing store/component patterns. ESLint requires keyed `{#each}` blocks.
- Keep pure calculations in utilities, `insights/calculations/` or `planning/`; put database operations in stores. Keep storage UI-agnostic using registered callbacks.
- Settings writes share `src/lib/db/settings.ts`; avoid recreating the settings/subscription compatibility import cycle.
- Update/invalidate transaction, tag, merchant and recurring caches after mutations as existing stores do. Bulk data replacement uses `refreshDataCaches(true)` to refresh mounted views.
- Match `src/app.css` theme tokens and existing modal/form components. Verify light/dark themes, keyboard access and focus behavior for UI changes. Category/account emoji belong in pickers/management and the treemap; display rows use color dots.
- Tailwind 4 uses `@tailwindcss/vite` and CSS-first `@theme`, not a legacy content config. Check source detection and computed styles before adding overrides; prefer existing theme utilities.
- SimpleFIN credentials stay behind the Rust/Keychain boundary. Commands return balances or link status, never the access URL. Do not put credentials in logs, data files or backups.
- Python helpers here use the standard library; run them with `python3`. If dependencies become necessary, install them in a virtual environment, never globally.
