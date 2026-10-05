# Net worth and SimpleFIN — current design

Status: implemented. Reviewed against the code in October 2026. This file records current behavior; the [original phased proposal](docs/history/net-worth-plan.md) is preserved for historical context.

## Purpose and source map

Net worth tracks actual asset and liability balances entered manually or read from SimpleFIN. Transactions remain manual/Excel-imported; the integration reads balances only and moves no money.

| Responsibility | Source |
| --- | --- |
| Types and defaults | [db/constants.ts](src/lib/db/constants.ts) |
| Account operations and daily snapshots | [stores/linkedAccounts.ts](src/lib/stores/linkedAccounts.ts) |
| Sum/history and account-class helpers | [utils/net-worth.ts](src/lib/utils/net-worth.ts) |
| Frontend mapping, sync and launch throttle | [services/simplefin.ts](src/lib/services/simplefin.ts) |
| HTTP, token claim and Keychain | [Rust simplefin.rs](src-tauri/src/simplefin.rs) |
| Command registration and app lifecycle | [Rust lib.rs](src-tauri/src/lib.rs) |
| Account UI | [Net Worth page](src/routes/networth/+page.svelte), [LinkedAccountModal](src/lib/components/LinkedAccountModal.svelte) |
| Linking and reconnecting | [ConnectedAccountsSection](src/lib/components/settings/ConnectedAccountsSection.svelte) |

## Accounts, balances and history

`LinkedAccount` and `BalanceSnapshot` are separate persisted Dexie tables. Net worth sums active asset balances and subtracts active liability balances. Account type determines class: credit/loan are liabilities; checking/savings/investment/retirement/other are assets. The current UI supports both classes.

The model stores liability balances as positive amounts owed; the sync mapper normalizes upstream negative debt with `Math.abs`. `recordBalance` updates the latest balance and upserts one snapshot per account per **local calendar day**. Same-day changes overwrite that snapshot. `applyBalanceSync` records a whole batch atomically. History forward-fills per-account balances using capture timestamps, not the bank's upstream timestamp.

The Net Worth page has a total/30-day delta, history chart, asset/liability groups, type breakdown, sync status, and manual editing/reordering. ⌘6 navigates there. Deleting an account deletes its snapshots and clears saved savings-account links to it; reconnecting a retained manual account preserves its ID and history.

## Rust command and credential boundary

The registered commands are:

| Command | Input | Result |
| --- | --- | --- |
| `simplefin_link` | Setup token; an access URL is also accepted for the demo flow | Account response after claim/fetch and credential storage |
| `simplefin_is_linked` | None | Boolean link status |
| `simplefin_unlink` | None | Removes the Keychain credential and cached copy |
| `simplefin_fetch_accounts` | None | Account response using the stored credential |

Rust claims the token, fetches balances and stores the access URL in macOS Keychain service `app.ledger.desktop.simplefin`, entry `access_url`. It also caches it in process memory. The credential is never **returned** to JavaScript; fetch does not accept it as a frontend argument. A supplied demo URL may pass through the linking input, but it must not be saved in application records.

Do not implement the original proposal's get/store-access-URL commands. Credentials belong outside `LinkedAccount`, `StoredData`, logs, JSON exports and local/iCloud backups. Token claims consume a one-use token and are never automatically retried.

A shared Rust HTTP client has a 10-second connection timeout and a 30-second total timeout covering headers and body; automatic retries are disabled. Keychain calls run through blocking tasks. Frontend calls use Tauri `invoke`; browser-only mode cannot exercise the real connection.

## Sync behavior

The main window starts launch sync after storage initialization. It is throttled with `ledger-simplefin-last-sync` using a **UTC date string** (`toISOString().slice(0, 10)`), and manual Refresh bypasses that throttle. It is not a background timer or rolling 24-hour schedule.

Overlapping `syncBalances` calls share one promise. Targets must be active, have source `simplefin`, and have an external ID. Active external mappings are unique; retained manual accounts can explicitly reconnect.

Mapping strictly validates decimal balance strings and positive finite upstream timestamps. Regressed upstream timestamps are rejected. Each successful account stores:

- `currentBalance`: validated, rounded amount;
- `upstreamBalanceAt`: bank-reported balance time;
- `lastSyncedAt`: successful fetch/capture time;
- `lastSyncStatus`: `ok` or `stale` (upstream balance older than 72 hours).

Missing/unreadable accounts keep their last-good balances and receive stale/error statuses. One account failure does not prevent valid updates for the others. All statuses, balances and snapshots commit in one transaction and disk save. Database/disk failures propagate, so callers cannot report a successful durable save. The shared promise is released even after a timeout/failure so another attempt can run.

## Savings intent and actual balances

`SavingsAccount.currentBalance` is a manually recorded allocation for goals; `LinkedAccount.currentBalance` is actual bank value. Adding even a future-dated current-month cash contribution reserves spending money and updates savings-type balances immediately. Bank sync does not know that intent.

Keep these rules:

1. SimpleFIN updates linked accounts/snapshots only, never savings balances or contributions.
2. Goals and contribution accounting retain their independent records.
3. Saved `SavingsAccount.linkedAccountId` references and explicit allocation logic remain supported for compatibility. They do not authorize automatic bank-to-savings balance replacement.
4. The simplified UI has no reconciliation/allocation creation workflow; preserving its saved data does not justify restoring that workflow without a product request.

The original proposal's optional `LinkedAccount.savingsAccountId` is not the implemented model. See [forecast compatibility](docs/planning.md) for the other preserved financial events.

## Verification and persistence changes

Coverage lives in `src/lib/utils/net-worth.test.ts`, `src/lib/stores/linkedAccounts.test.ts`, `src/lib/services/simplefin.test.ts`, `src/lib/services/simplefin-sync.test.ts`, rendered connected-account tests and the Rust tests in `simplefin.rs`. Tests use synthetic responses/local HTTP servers rather than live bank accounts.

For new persisted fields/tables, use the [current persistence checklist](docs/architecture.md#changing-persisted-data). Full/incremental serialization and strict restore validation are centralized; the original six-touchpoint proposal predates that refactor. See [development.md](docs/development.md) for Rust checks and opt-in production timeout tests.
