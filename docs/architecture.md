# System Architecture

This diagram shows the complete data flow and component relationships in Ledger.

## Overview

Ledger follows a **local-first architecture** where:
- **JSON file** (`data.json`) is the source of truth
- **Dexie/IndexedDB** provides fast runtime queries (cleared on each startup)
- **Version-based memoization** automatically invalidates cached calculations

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           LEDGER - SYSTEM ARCHITECTURE                                   │
│                        SvelteKit + Tauri Desktop Application                            │
└─────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    UI LAYER                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐    │
│  │                          App Shell (+layout.svelte)                              │    │
│  │  ┌────────────┐  ┌────────────────────────────────────────────────────────────┐ │    │
│  │  │  SideNav   │  │                    Route Pages                              │ │    │
│  │  │            │  │  ┌───────────┐ ┌────────┐ ┌─────────┐ ┌────────┐ ┌────────┐│ │    │
│  │  │ • Dashboard│  │  │ Dashboard │ │ Budget │ │ Savings │ │Insights│ │ Shared ││ │    │
│  │  │ • Budget   │  │  │           │ │        │ │         │ │        │ │        ││ │    │
│  │  │ • Savings  │  │  │CashFlow   │ │Category│ │Account  │ │Charts  │ │Settle  ││ │    │
│  │  │ • Insights │  │  │TxnList    │ │Budgets │ │Cards    │ │Insights│ │Tracker ││ │    │
│  │  │ • Shared   │  │  │QuickAdd   │ │Progress│ │History  │ │Heatmap │ │Balance ││ │    │
│  │  │ • Settings │  │  │BulkAction │ │Alerts  │ │Modals   │ │YTD     │ │        ││ │    │
│  │  │            │  │  └───────────┘ └────────┘ └─────────┘ └────────┘ └────────┘│ │    │
│  │  └────────────┘  └────────────────────────────────────────────────────────────┘ │    │
│  │                  ┌────────────────────────────────────────────────────────────┐ │    │
│  │                  │                   ToastContainer                           │ │    │
│  │                  └────────────────────────────────────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           │ Svelte 5 Runes ($state, $derived, $effect)
                                           │ + liveQuery() subscriptions
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                               STATE MANAGEMENT LAYER                                     │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              Svelte Stores (src/lib/stores/)                      │   │
│  │  ┌─────────────┐ ┌────────────┐ ┌───────────┐ ┌─────────────┐ ┌───────────────┐  │   │
│  │  │transactions │ │ categories │ │  budget   │ │  settings   │ │savingsAccounts│  │   │
│  │  │             │ │            │ │           │ │  (singleton)│ │               │  │   │
│  │  │• add        │ │• getActive │ │• getByMth │ │• partner    │ │• CRUD         │  │   │
│  │  │• update     │ │• reorder   │ │• upsert   │ │• splitDef   │ │• balanceTrack │  │   │
│  │  │• delete     │ │• CRUD      │ │• cashFlow │ │• theme      │ │               │  │   │
│  │  │• bulkOps    │ │            │ │           │ │• iCloud     │ │               │  │   │
│  │  └─────────────┘ └────────────┘ └───────────┘ └─────────────┘ └───────────────┘  │   │
│  │  ┌───────────────────┐ ┌────────────────┐ ┌─────────────┐ ┌──────────────────┐   │   │
│  │  │savingsContribution│ │ categoryBudget │ │selectedMonth│ │      toast       │   │   │
│  │  │                   │ │                │ │  (UI state) │ │  (notifications) │   │   │
│  │  │• byAccount        │ │• byMonth       │ │             │ │                  │   │   │
│  │  │• byMonth          │ │• upsert        │ │• get/set    │ │• success/error   │   │   │
│  │  └───────────────────┘ └────────────────┘ └─────────────┘ └──────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                          │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐   │
│  │                        Transaction Cache (src/lib/stores/transactionCache.ts)     │   │
│  │  ┌──────────────────────────────────────────────────────────────────────────┐    │   │
│  │  │   Map<id, Transaction>  │  version: number  │  Async initialization lock │    │   │
│  │  │                         │  (invalidation)   │  (prevents race conditions)│    │   │
│  │  └──────────────────────────────────────────────────────────────────────────┘    │   │
│  │  • add() → version++    • update() → version++    • remove() → version++         │   │
│  │  • bulkUpdate()         • bulkRemove()            • initializeAsync()            │   │
│  └──────────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           │ withPersistence() wrapper
                                           │ auto-saves after mutations
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              INSIGHTS ENGINE (src/lib/insights/)                         │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐   │
│  │                      InsightsEngine Singleton                                     │   │
│  │  ┌────────────────────────────────────────────────────────────────────────────┐  │   │
│  │  │              Memoization Layer (version-based invalidation)                 │  │   │
│  │  │   ┌─────────────────────────┐  ┌────────────────────────────────────────┐  │  │   │
│  │  │   │   memoByVersion<T>()    │  │     memoByVersionMultiKey<T>()         │  │  │   │
│  │  │   │   (single-key cache)    │  │     (LRU cache, max 12 entries)        │  │  │   │
│  │  │   │                         │  │     Key = month ("YYYY-MM")            │  │  │   │
│  │  │   │   • YTD stats           │  │     • Spending by category             │  │  │   │
│  │  │   │   • Category averages   │  │     • Anomalies (z-score)              │  │  │   │
│  │  │   │                         │  │     • Pace projection                  │  │  │   │
│  │  │   │                         │  │     • Velocity comparison              │  │  │   │
│  │  │   └─────────────────────────┘  └────────────────────────────────────────┘  │  │   │
│  │  └────────────────────────────────────────────────────────────────────────────┘  │   │
│  │                                                                                   │   │
│  │  ┌────────────────────────────────────────────────────────────────────────────┐  │   │
│  │  │                       Calculation Modules (/calculations/)                  │  │   │
│  │  │  ┌──────────┐ ┌───────────┐ ┌──────────────┐ ┌────────────┐ ┌───────────┐  │  │   │
│  │  │  │ spending │ │needs-wants│ │category-shift│ │  anomalies │ │   pace    │  │  │   │
│  │  │  └──────────┘ └───────────┘ └──────────────┘ └────────────┘ └───────────┘  │  │   │
│  │  │  ┌──────────┐ ┌───────────┐ ┌──────────────┐ ┌────────────┐ ┌───────────┐  │  │   │
│  │  │  │ velocity │ │top-merchant││ ytd-stats    │ │month-review│ │   stats   │  │  │   │
│  │  │  └──────────┘ └───────────┘ └──────────────┘ └────────────┘ └───────────┘  │  │   │
│  │  └────────────────────────────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           │ Dexie liveQuery() for reactive queries
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                               DATABASE LAYER (src/lib/db/)                               │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐   │
│  │                          Dexie.js (IndexedDB Wrapper)                             │   │
│  │                         ⚠️ Cleared on every app startup                           │   │
│  │  ┌──────────────────────────────────────────────────────────────────────────┐    │   │
│  │  │                              Tables (v4 Schema)                          │    │   │
│  │  │  ┌─────────────┐ ┌────────────┐ ┌───────────────┐ ┌─────────────────┐   │    │   │
│  │  │  │transactions │ │ categories │ │monthlyBudgets │ │ categoryBudgets │   │    │   │
│  │  │  │             │ │            │ │               │ │                 │   │    │   │
│  │  │  │idx: id,date │ │idx: id,name│ │idx: month     │ │idx: [month+cat] │   │    │   │
│  │  │  │merchant,cat │ │isActive    │ │               │ │                 │   │    │   │
│  │  │  │isShared,etc │ │sortOrder   │ │               │ │                 │   │    │   │
│  │  │  └─────────────┘ └────────────┘ └───────────────┘ └─────────────────┘   │    │   │
│  │  │  ┌─────────────┐ ┌────────────────────┐ ┌─────────────────────────────┐  │    │   │
│  │  │  │  settings   │ │  savingsAccounts   │ │  savingsContributions       │  │    │   │
│  │  │  │  (singleton)│ │                    │ │                             │  │    │   │
│  │  │  │  id: 1      │ │idx: id,name,type   │ │idx: id,date,accountId,src   │  │    │   │
│  │  │  └─────────────┘ └────────────────────┘ └─────────────────────────────┘  │    │   │
│  │  └──────────────────────────────────────────────────────────────────────┘    │   │
│  │                                                                               │   │
│  │  ┌────────────────────────────────────────────────────────────────────────┐  │   │
│  │  │                        migrations.ts (Idempotent)                       │  │   │
│  │  │  v1: Core schema  │  v2: Category budgets  │  v3: Subscriptions        │  │   │
│  │  │  v4: Savings accounts & contributions                                   │  │   │
│  │  └────────────────────────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           │ persistData() / initializeStorage()
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                            STORAGE LAYER (src/lib/storage/)                              │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐   │
│  │                         Storage Abstraction (index.ts)                            │   │
│  │  ┌───────────────────────────────────────────────────────────────────────────┐   │   │
│  │  │  initializeStorage()  │  persistData()  │  withPersistence<T>()           │   │   │
│  │  │  getAllData()         │  replaceAllData() (import)                         │   │   │
│  │  └───────────────────────────────────────────────────────────────────────────┘   │   │
│  │                                      │                                            │   │
│  │                    ┌─────────────────┴─────────────────┐                          │   │
│  │                    ▼                                   ▼                          │   │
│  │  ┌─────────────────────────────┐     ┌─────────────────────────────────────┐     │   │
│  │  │   Tauri Environment         │     │      Test Environment               │     │   │
│  │  │   (tauri-adapter.ts)        │     │      (in-memory only)               │     │   │
│  │  │                             │     │                                     │     │   │
│  │  │  • Load Tauri APIs (lazy)   │     │  • No file persistence              │     │   │
│  │  │  • Clear IndexedDB          │     │  • Dexie in-memory                  │     │   │
│  │  │  • Read data.json           │     │                                     │     │   │
│  │  │  • loadDataIntoDexie()      │     │                                     │     │   │
│  │  │  • Run migrations           │     │                                     │     │   │
│  │  └─────────────────────────────┘     └─────────────────────────────────────┘     │   │
│  └──────────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           │ @tauri-apps/plugin-fs
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                               FILE SYSTEM (Tauri Native)                                 │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐   │
│  │           ~/Library/Application Support/app.ledger.desktop/                       │   │
│  │  ┌─────────────────────────────────────────────────────────────────────────────┐ │   │
│  │  │  data.json                         │  Source of Truth                       │ │   │
│  │  │  ├── transactions: [...]           │  (Dexie loaded from this on startup)   │ │   │
│  │  │  ├── categories: [...]             │                                        │ │   │
│  │  │  ├── monthlyBudgets: [...]         │  All dates stored as ISO strings       │ │   │
│  │  │  ├── categoryBudgets: [...]        │  Converted to Date objects on load     │ │   │
│  │  │  ├── settings: {...}               │                                        │ │   │
│  │  │  ├── savingsAccounts: [...]        │                                        │ │   │
│  │  │  └── savingsContributions: [...]   │                                        │ │   │
│  │  └─────────────────────────────────────────────────────────────────────────────┘ │   │
│  │  ┌─────────────────────────────────────────────────────────────────────────────┐ │   │
│  │  │  backups/                          │  Auto-created (debounced 1 min)        │ │   │
│  │  │  ├── backup-2024-01-15T10-30-00.json │  Max 10 retained                     │ │   │
│  │  │  ├── backup-2024-01-14T09-15-00.json │  Oldest auto-deleted                 │ │   │
│  │  │  └── ...                           │                                        │ │   │
│  │  └─────────────────────────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                          │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐   │
│  │           ~/Library/Mobile Documents/com~apple~CloudDocs/Ledger/                  │   │
│  │  ┌─────────────────────────────────────────────────────────────────────────────┐ │   │
│  │  │  ledger-backup.json                │  iCloud Backup (optional)              │ │   │
│  │  │  (single file, overwritten)        │  Requires iCloud Drive enabled         │ │   │
│  │  └─────────────────────────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Startup Sequence

1. `+layout.svelte` calls `initializeStorage()`
2. Tauri adapter clears IndexedDB (fresh start)
3. Read `data.json` from disk
4. Parse JSON, convert ISO dates → Date objects
5. Load all data into Dexie tables
6. Run idempotent migrations
7. Seed defaults if first run
8. UI components subscribe via `liveQuery()`

### Mutation Flow

```
User Action → Store Function → Dexie Write → Cache Update (version++)
                                    │
                                    ▼
                           persistData() → JSON.stringify() → write data.json
                                    │
                                    ▼ (debounced)
                           createBackup() → backups/ + iCloud (if enabled)
                                    │
                                    ▼
                           liveQuery() triggers → UI re-renders
                           InsightsEngine invalidates (version changed)
```

## Key Patterns

| Pattern | Description |
|---------|-------------|
| **Local-First** | JSON file = truth, Dexie = runtime queries, no network |
| **Version-Based Memoization** | `cache.version++` auto-invalidates InsightsEngine |
| **Incremental Cache** | Never reload full dataset; add/update/remove only |
| **Reactive Subscriptions** | Dexie `liveQuery()` + Svelte `$effect()` |
| **Storage Abstraction** | `isTauri()` switches between file persistence and in-memory |
| **Date Handling** | Memory: Date objects, JSON: ISO strings, `parseStoredDate()` avoids TZ shift |
