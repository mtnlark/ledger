# Net Worth Tracking + SimpleFIN Integration — Implementation Plan

Status: **Implemented** (June 2026; all phases — kept as the design record) · Owner: Lev

## 1. Goal

Add Monarch-style **net worth tracking** to Ledger: a single view of all asset and
liability account balances, charted over time. Balances are entered manually and/or
pulled automatically from **SimpleFIN Bridge** for the four real institutions
(Harvard FCU, Chase, Empower Retirement, Fidelity).

### Non-goals (explicitly out of scope for v1)
- **No transaction import.** SimpleFIN returns transactions, but Ledger already has a
  full manual transaction + categorization system. Auto-importing would collide with
  it (dedup, categorization, split handling). v1 is **balances only**. Revisit later.
- **No money movement.** SimpleFIN is read-only by design; we keep it that way.
- **No Plaid.** SimpleFIN covers all four institutions, so Plaid's heavier integration
  (Link SDK, OAuth redirect, deep-linking) is unnecessary.
- **No liabilities tracker (v1).** No debt to track; credit cards are paid in full each
  month (small, transient ~$3k). `accountClass` stays in the schema for future-proofing,
  but the v1 UI is **assets-only**.

## 2. Key design decisions

| Decision | Choice | Why |
|---|---|---|
| Aggregator | SimpleFIN Bridge | Covers all 4 accounts; bank auth happens on the Bridge's site, not in our app. One `reqwest` GET. ~$18/yr. |
| Where API calls run | Rust (`src-tauri`), via `reqwest` | Keeps the access URL (which embeds credentials) out of the WebView and out of `data.json`. Bypasses Tauri's network capability allowlist. |
| Access-URL storage | macOS Keychain (`keyring` crate) | The access URL is a credential. It must **never** land in `data.json` or backups — see §6. |
| New account model | `LinkedAccount` (separate from `SavingsAccount`) | Net worth spans assets *and* liabilities and isn't tied to savings goals/contributions. Avoids disrupting existing savings logic. Unification is a future option, not now. |
| Net-worth history | `BalanceSnapshot` table | Plaid/SimpleFIN give point-in-time balances; we store our own snapshots to chart change over time. Source-agnostic (manual or synced). |
| Sync trigger | App-open + manual "Refresh" button | Balance pulls hit the real bank; no aggressive polling. No webhooks (local app has no public URL). |
| Per-account resilience | `lastSyncStatus` per account | Fidelity is flagged flaky on SimpleFIN. One account failing must not block others; it falls back to last-known balance or manual entry. |

## 3. Data model

### New types (`src/lib/db/constants.ts`)

```typescript
type AccountClass = 'asset' | 'liability';

type LinkedAccountType =
  | 'checking' | 'savings' | 'credit'
  | 'investment' | 'retirement' | 'loan' | 'other';

type BalanceSource = 'manual' | 'simplefin';

type SyncStatus = 'ok' | 'stale' | 'error' | 'never';

interface LinkedAccount {
  id?: number;
  name: string;                 // user-facing, e.g. "Chase Checking"
  institution: string;          // "Chase", "Fidelity", ...
  accountClass: AccountClass;   // asset | liability (drives net-worth sign)
  accountType: LinkedAccountType;
  currentBalance: number;       // latest known balance (signed positive; class controls +/-)
  source: BalanceSource;        // manual or simplefin
  simplefinId?: string;         // upstream account id, when source === 'simplefin'
  lastSyncedAt?: Date;
  lastSyncStatus: SyncStatus;
  sortOrder: number;
  isActive: boolean;            // hide closed accounts without deleting history
  createdAt: Date;
  updatedAt: Date;
}

interface BalanceSnapshot {
  id?: number;
  accountId: number;            // references LinkedAccount.id
  balance: number;
  source: BalanceSource;
  capturedAt: Date;             // dedup to at most one "official" snapshot per account per day
}
```

> **Net worth** = Σ(asset balances) − Σ(liability balances), over `isActive` accounts.

### Dexie schema (`src/lib/db/index.ts`)
Add the two tables in a **new** `this.version(5).stores({...})` block (current max is
`version(4)`). Carry forward all existing table definitions unchanged, and add:

```
linkedAccounts:  '++id, institution, accountClass, accountType, sortOrder, isActive'
balanceSnapshots: '++id, accountId, capturedAt, [accountId+capturedAt]'
```

Also add `linkedAccounts!` and `balanceSnapshots!` `EntityTable` fields to the
`LedgerDB` class and export the new types from `db/index.ts`.

> No app-level migration (`migrationVersion`) bump needed — tables start empty, no data
> transform. Dexie handles the schema upgrade itself.

### The six lock-step touchpoints (checklist)
Adding a persisted entity must update **all** of these or you get silent data loss:

- [ ] `src/lib/db/index.ts` — `version(5)` schema + `EntityTable` fields + type exports
- [ ] `src/lib/storage/types.ts` — add `linkedAccounts?` + `balanceSnapshots?` to `StoredData`
- [ ] `src/lib/storage/tauri-adapter.ts` → `loadDataIntoDexie` — clear + bulkPut with Date conversion
- [ ] `src/lib/storage/tauri-adapter.ts` → `saveToFile` — add to the `Promise.all` + data object
- [ ] `src/lib/storage/index.ts` → `getAllData` — include in export
- [ ] `src/lib/storage/index.ts` → `replaceAllData` — clear + bulkPut on import/restore

(Date fields needing conversion on load/import: `lastSyncedAt`, `createdAt`, `updatedAt`,
`capturedAt`.)

## 4. Phased plan

Each phase is independently shippable. **Phase 1–2 deliver the full feature with manual
entry**, so net worth works before any SimpleFIN code exists. Per CLAUDE.md, write tests
first for pure functions (TDD).

### Phase 1 — Data model + storage plumbing  ·  ~0.5 day
- Add types, Dexie `version(5)`, and wire all six touchpoints above.
- New store `src/lib/stores/linkedAccounts.ts` (mirror `savingsAccounts.ts`): `liveQuery`
  list, `add/update/delete`, reorder, `persistData()` after each write.
- `recordBalance(accountId, balance, source)`: updates `currentBalance` **and** writes a
  deduped `BalanceSnapshot` (one per account per day; overwrite same-day).
- Pure calc module `src/lib/utils/net-worth.ts`: `calculateNetWorth(accounts)`,
  `netWorthHistory(snapshots)` (daily series for the chart).
- **Tests:** net-worth sum with mixed asset/liability, snapshot same-day dedup, empty state.

### Phase 2 — Net worth UI (manual entry, no aggregator)  ·  ~1 day
- New route `src/routes/networth/+page.svelte`; add "Net Worth" to `SideNav.svelte`.
- Components (reuse existing patterns):
  - `NetWorthCard.svelte` — current total + asset/liability split (mirror `CashFlowCard`).
  - `NetWorthChart.svelte` — line chart over snapshots via `ChartWrapper` + `chart-theme`.
  - `LinkedAccountCard.svelte` — per-account row w/ balance, type, sync badge.
  - `AddLinkedAccountModal` / `EditLinkedAccountModal` — manual entry (reuse `ModalContainer`,
    `isSubmitting` pattern, footer order Cancel-left/primary-right).
- **Shippable here:** full Monarch-style net worth with manual balances.

### Phase 3 — SimpleFIN Rust client (against demo URL first)  ·  ~1 day
- `src-tauri/Cargo.toml`: add `reqwest` (json + rustls-tls), `keyring`, `base64`.
- New `src-tauri/src/simplefin.rs` with `#[tauri::command]`s:
  - `simplefin_claim_setup_token(setup_token) -> String` — base64-decode → POST to the
    claim URL → return the access URL.
  - `simplefin_fetch_accounts(access_url) -> AccountsResponse` — GET `{url}/accounts`.
  - `simplefin_store_access_url` / `simplefin_get_access_url` / `simplefin_clear` —
    Keychain via `keyring`.
- Register via `.invoke_handler(tauri::generate_handler![...])` in `lib.rs` (none today).
- **Build + test against SimpleFIN's public demo access URL** (no signup, no cost) to prove
  real JSON parsing before touching live accounts.
- **Tests:** Rust unit test deserializing a captured demo `/accounts` JSON fixture.

### Phase 4 — Sync integration  ·  ~1 day
- `src/lib/services/simplefin.ts`: thin `invoke()` wrappers + a **pure mapper**
  `mapSimplefinAccount(raw) -> { balance, simplefinId, ... }` (unit-testable from fixtures).
- Linking flow (in Settings): paste setup token → claim → list upstream accounts → user
  maps each to a `LinkedAccount` (or auto-create), set `source: 'simplefin'` + `simplefinId`.
- `syncBalances()`: per account, fetch → `recordBalance(..., 'simplefin')` → set
  `lastSyncedAt` + `lastSyncStatus: 'ok'`; on failure set `'error'`, keep last balance,
  **don't throw** (Fidelity-flaky-safe). Triggered on app-open + a manual "Refresh" button.
- **Tests:** mapper with demo fixtures; sync marks one failed account `error` while others
  succeed.

### Phase 5 — Polish, docs, ship  ·  ~0.5 day
- Stale/error sync badges + "update manually" affordance per account.
- `npm run check` clean (svelte-check tripwire); `npm run test` green.
- Update `CLAUDE.md` (structure + features) and `PRODUCT_ROADMAP.md`.
- Standard workflow: tests → docs → commit → build → deploy.

## 5. Capabilities & dependencies
- **No Tauri capability change** needed for the Rust→SimpleFIN calls (network from Rust
  bypasses the WebView allowlist). Optional: `shell:open` if we add an "Open SimpleFIN
  Bridge" button to the linking flow.
- New Rust crates: `reqwest`, `keyring`, `base64`. No new JS runtime deps (Chart.js,
  modals, etc. already present).

## 6. Security notes (important)
- **The SimpleFIN access URL embeds credentials.** It goes in the **Keychain only** —
  never in `LinkedAccount`, `StoredData`, `data.json`, or backups.
- This matters because **backups copy to iCloud** when enabled
  (`tauri-adapter.ts: copyBackupToICloud`). Putting the access URL in app data would leak
  a bank-read credential to iCloud. Keychain avoids this entirely.
- SimpleFIN is read-only; the access URL is revocable from the Bridge if ever exposed.

## 7. Relationship to the existing Savings system (intent vs. actual)

This is the crux of how read-only balances coexist with the current setup.

**Two different truths, deliberately kept apart:**

- `SavingsAccount.currentBalance` is an **intent / committed** balance. Adding a
  contribution — including a *future-dated* one within the current month — immediately
  reduces `available` (`available = income − saved`, where `saved` =
  `getContributionsAffectingAvailable`, `budget.ts:67`) **and** bumps `currentBalance` via
  `updateAccountBalance` (`savingsContributions.ts:27`), whether or not the money has
  physically moved. This powers "treat next paycheck's planned savings as already spent."
- `LinkedAccount.currentBalance` (from SimpleFIN) is the **actual / cleared** bank
  balance — ground truth, knows nothing about intent.

**Rules that keep them from corrupting each other:**

1. SimpleFIN actual balances feed **net worth only**.
2. SimpleFIN **never writes to `SavingsAccount.currentBalance`**. Overwriting it would
   (a) erase the forward-looking "planned as spent" signal and (b) corrupt goal math —
   `getGoalStatus`/`projectGoalCompletion` read `currentBalance` vs `targetAmount`, and
   contributions already mutate it independently.
3. The manual contribution system **stays essential and unchanged**. The bank can't tell
   you which paycheck dollars are earmarked for savings; only your recorded intent can.
   Real balances complement it, they don't replace it.

**Consequence:** a real-world account (e.g. an Ally savings) may appear twice — as a
`SavingsAccount` (planning + goals) and a `LinkedAccount` (net worth + actual balance).
That duplication is the accepted price of separating intent from reality in v1.

**Optional v2 (not now):** add `LinkedAccount.savingsAccountId` to *link* the two
non-destructively and surface the delta — "planned − actual = committed but not yet
settled" (i.e. pending transfers). Purely additive; never overwrites.

## 8. Open questions for review
1. ~~Separate "Net Worth" page vs. fold into "Savings"?~~ **Resolved:** separate page.
2. ~~Liabilities now or later?~~ **Resolved: assets-only v1.** No debt; credit cards paid
   in full monthly (~$3k transient) aren't worth a liability tracker. `accountClass` stays
   in the schema for future-proofing, but the v1 UI omits liabilities.
3. **Snapshot cadence:** plan uses one snapshot per account per day (overwrite same-day).
   Good enough for a net-worth trend line? Or do you want every change retained?
4. **Sync frequency:** app-open + manual only, or also a "once per day max" auto-refresh?
5. **Reconciliation (v2):** put the optional intent-vs-actual delta view (§7) on the
   roadmap, or leave the two systems fully parallel?

## 9. Effort estimate
~4 days total, front-loaded so the **manual-entry feature ships after ~1.5 days** (Phases
1–2) and automation lands incrementally after. Riskiest unknown is live SimpleFIN behavior
for Fidelity — de-risked by building against the demo URL first and designing for
per-account failure.
