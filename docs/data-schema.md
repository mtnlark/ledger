# Ledger Data Schema

## Overview

Ledger uses Dexie.js (IndexedDB wrapper) for runtime queries and JSON files for persistence. On app startup, IndexedDB is cleared and reloaded from `data.json`.

**File Location**: `~/Library/Application Support/app.ledger.desktop/data.json`

---

## Tables

### transactions

Primary table for all income and expense records.

| Field | Type | Description |
|-------|------|-------------|
| `id` | number (auto) | Primary key |
| `date` | Date | Transaction date |
| `merchant` | string | Merchant/payee name |
| `amount` | number | Transaction amount (positive) |
| `categoryId` | number | Foreign key to categories |
| `isShared` | boolean | Whether split with partner |
| `splitType` | 'percentage' \| 'fixed' | How to calculate partner share |
| `splitValue` | number | Split amount (% or $) |
| `partnerShare` | number | Calculated partner portion |
| `isSettled` | boolean | Whether partner share is settled |
| `settledDate` | Date? | When settled |
| `isEssential` | boolean | Needs (true) vs wants (false) |
| `isSubscription` | boolean | Recurring subscription payment |
| `subscriptionFrequency` | 'monthly' \| 'annual'? | Subscription billing cycle |
| `parentTransactionId` | number? | Links split child to parent |
| `isSplitParent` | boolean? | True if split into children |
| `notes` | string? | Optional notes |
| `createdAt` | Date | Record creation timestamp |
| `updatedAt` | Date | Last update timestamp |

**Indexes**: `id`, `date`, `merchant`, `categoryId`, `isShared`, `isSettled`, `parentTransactionId`, `[date+merchant+amount]`

---

### categories

Expense and income categories.

| Field | Type | Description |
|-------|------|-------------|
| `id` | number (auto) | Primary key |
| `name` | string | Category name |
| `icon` | string? | Emoji icon |
| `color` | string? | Hex color for charts |
| `isActive` | boolean | Whether shown in UI |
| `sortOrder` | number | Display order |
| `isEssential` | boolean | Default needs/wants for transactions |

**Indexes**: `id`, `name`, `isActive`, `sortOrder`

**Default Categories** (22):
Car, Cash withdrawals, Clothes & accessories, Coffee & snacks, Donations, Electronics, Fitness & wellness, Fun & hobbies, Gas, Gifts, Groceries, Grooming, Health, Home, Household supplies, Insurance, Parking & tolls, Pet, Rent, Restaurants, Travel, Utilities

---

### monthlyBudgets

Monthly income and savings tracking.

| Field | Type | Description |
|-------|------|-------------|
| `id` | number (auto) | Primary key |
| `month` | string | Month key ("YYYY-MM") |
| `income` | number | Total income for month |
| `savedAmount` | number | **DEPRECATED** - Use SavingsContribution |
| `notes` | string? | Optional notes |

**Indexes**: `id`, `month` (unique)

---

### categoryBudgets

Per-category spending limits.

| Field | Type | Description |
|-------|------|-------------|
| `id` | number (auto) | Primary key |
| `month` | string | Month key ("YYYY-MM") |
| `categoryId` | number | Foreign key to categories |
| `budgetAmount` | number | Target spending limit (must be >= 0) |
| `createdAt` | Date | Record creation timestamp |
| `updatedAt` | Date | Last update timestamp |

**Validation**: `budgetAmount` cannot be negative (throws error).

**Indexes**: `id`, `[month+categoryId]` (unique compound)

---

### savingsAccounts

Savings, retirement, and investment accounts.

| Field | Type | Description |
|-------|------|-------------|
| `id` | number (auto) | Primary key |
| `name` | string | Account name |
| `accountType` | 'savings' \| 'retirement' \| 'investment' | Account category |
| `icon` | string? | Emoji icon |
| `color` | string? | Hex color |
| `sortOrder` | number | Display order |
| `currentBalance` | number? | Current balance (savings type only) |
| `createdAt` | Date | Record creation timestamp |
| `updatedAt` | Date | Last update timestamp |

**Indexes**: `id`, `name`, `accountType`, `sortOrder`

**Default Accounts**:
- Emergency Fund (savings)
- High-Yield Savings (savings)
- 401(k) (retirement)
- Roth IRA (retirement)
- Brokerage (investment)

---

### savingsContributions

Individual contributions to savings accounts.

| Field | Type | Description |
|-------|------|-------------|
| `id` | number (auto) | Primary key |
| `date` | Date | Contribution date |
| `accountId` | number | Foreign key to savingsAccounts |
| `amount` | number | Contribution amount |
| `source` | ContributionSource | How contribution was made |
| `notes` | string? | Optional notes |
| `createdAt` | Date | Record creation timestamp |
| `updatedAt` | Date | Last update timestamp |

**ContributionSource Values**:

| Source | Affects Available | Description |
|--------|-------------------|-------------|
| `payroll_deduction` | No | Pre-tax automatic deduction |
| `bank_transfer` | Yes | Manual transfer from checking |
| `interest` | No | Interest earned |
| `employer_match` | No | 401(k) employer match |
| `other` | Yes | Other source |

> **Tip**: Use the `CONTRIBUTION_SOURCES` constant from `$lib/db` for labels, descriptions, and `affectsAvailable` flags.

**Indexes**: `id`, `date`, `accountId`, `source`, `[accountId+date]`

---

### settings

Application settings (singleton, always id=1).

| Field | Type | Description |
|-------|------|-------------|
| `id` | 1 | Always 1 (singleton) |
| `partnerName` | string | Name for shared expense partner |
| `defaultSplitType` | 'percentage' \| 'fixed' | Default split method |
| `defaultSplitValue` | number | Default split amount |
| `currency` | string | Currency code (e.g., "USD") |
| `theme` | 'light' \| 'dark' \| 'system' | UI theme preference |
| `dismissedRecurring` | string[] | Merchants hidden from recurring detection |
| `cancelledSubscriptions` | CancelledSubscription[] | Tracked cancelled subscriptions |
| `confirmedActiveSubscriptions` | string[] | Override staleness detection |
| `iCloudBackupEnabled` | boolean | Copy backups to iCloud |

**CancelledSubscription**:
```typescript
{
  merchant: string;      // Normalized merchant name
  cancelledDate: string; // ISO date string
}
```

---

## Schema Migrations

Located in `src/lib/db/migrations.ts`. All migrations are idempotent.

| Version | Changes |
|---------|---------|
| v1 | Core schema (transactions, categories, monthlyBudgets, settings) |
| v2 | Added categoryBudgets table |
| v3 | Added subscription fields (isSubscription, subscriptionFrequency) |
| v4 | Added savingsAccounts and savingsContributions tables |

---

## JSON File Structure

```json
{
  "transactions": [...],
  "categories": [...],
  "monthlyBudgets": [...],
  "categoryBudgets": [...],
  "settings": {...},
  "savingsAccounts": [...],
  "savingsContributions": [...]
}
```

### Date Serialization

- **In Memory**: JavaScript `Date` objects
- **In JSON**: ISO 8601 strings (`"2024-01-15"`)
- **Parsing**: Uses `parseStoredDate()` to avoid timezone shift

---

## Relationships

```
transactions
    └── categoryId → categories.id
    └── parentTransactionId → transactions.id (self-reference for splits)

categoryBudgets
    └── categoryId → categories.id

savingsContributions
    └── accountId → savingsAccounts.id
```

---

## Indexes Explained

### Composite Indexes

**`[date+merchant+amount]` on transactions**
- Detects duplicate transactions during import
- Fast lookup for "does this exact transaction exist?"

**`[month+categoryId]` on categoryBudgets**
- Unique constraint: one budget per category per month
- Fast lookup for category's budget in a specific month

**`[accountId+date]` on savingsContributions**
- Fast queries for contributions to an account in date order

### Query Patterns

```typescript
// Get transactions for a month
db.transactions
  .where('date')
  .between(startOfMonth, endOfMonth)
  .toArray();

// Get category budget
db.categoryBudgets
  .where('[month+categoryId]')
  .equals([month, categoryId])
  .first();

// Get contributions for account
db.savingsContributions
  .where('accountId')
  .equals(accountId)
  .toArray();
```

---

## localStorage Keys

UI state persisted separately from main data:

| Key | Type | Description |
|-----|------|-------------|
| `ledger-sidebar-expanded` | boolean | Sidebar collapse state |
| `ledger-cashflow-expanded` | boolean | Cash flow card state |
| `ledger-addform-expanded` | boolean | Transaction form state |
| `ledger-insight-{title}` | boolean | Insight group states |
