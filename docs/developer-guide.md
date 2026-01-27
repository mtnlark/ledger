# Ledger Developer Guide

## Prerequisites

- **Node.js** 18+
- **Rust** (for Tauri) - install via [rustup](https://rustup.rs/)
- **Xcode Command Line Tools** - `xcode-select --install`

## Setup

```bash
# Clone the repository
git clone <repo-url>
cd ledger

# Install dependencies
npm install

# Run in development
npm run dev          # Web only (port 5174)
npm run tauri:dev    # Native app with hot reload
```

## Project Structure

```
ledger/
├── src/
│   ├── app.html              # HTML template
│   ├── app.css               # Tailwind + design tokens
│   ├── lib/
│   │   ├── db/               # Dexie schema & migrations
│   │   ├── storage/          # File persistence layer
│   │   ├── stores/           # Svelte stores (data operations)
│   │   ├── insights/         # Memoized calculations
│   │   ├── components/       # Reusable UI components
│   │   └── utils/            # Helper functions
│   ├── routes/               # SvelteKit pages
│   └── tests/                # Test setup
├── src-tauri/                # Rust/Tauri backend
├── docs/                     # Documentation
└── static/                   # Static assets
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start web dev server |
| `npm run tauri:dev` | Start Tauri dev (native) |
| `npm run build` | Build web assets |
| `npm run tauri:build` | Build production DMG |
| `npm run test` | Run tests (watch mode) |
| `npm run test:run` | Run tests once |
| `npm run test:coverage` | Generate coverage report |
| `npm run check` | TypeScript type checking |

## Architecture Overview

### Data Flow

```
UI Components
    ↓ Svelte 5 runes ($state, $effect)
Stores (src/lib/stores/)
    ↓ CRUD operations
Dexie (IndexedDB)
    ↓ persistData()
JSON File (data.json)
```

### Key Concepts

1. **JSON is Source of Truth** - `data.json` is the canonical data store
2. **Dexie is Runtime Cache** - IndexedDB cleared on startup, loaded from JSON
3. **Version-Based Invalidation** - TransactionCache.version triggers insight recalculation
4. **Local-First** - No network calls, all data on device

See [architecture.txt](./architecture.txt) for detailed diagram.

---

## Svelte 5 Patterns

### Runes

```typescript
// Props
let { transaction, onSave } = $props<{
  transaction: Transaction;
  onSave: (t: Transaction) => void;
}>();

// State
let amount = $state(0);
let isLoading = $state(false);

// Derived
let isValid = $derived(amount > 0);
let formatted = $derived.by(() => formatCurrency(amount));

// Effects
$effect(() => {
  if (selectedMonth) {
    loadTransactions(selectedMonth);
  }
});
```

### Store Usage

```typescript
import { addTransaction, getTransactionsByMonth } from '$lib/stores/transactions';

// Read (reactive via liveQuery)
let transactions = $state<Transaction[]>([]);
$effect(() => {
  getTransactionsByMonth(month).then(t => transactions = t);
});

// Write (auto-persists)
await addTransaction({ merchant: 'Coffee', amount: 5, ... });
```

---

## Adding Features

### New Store

1. Create `src/lib/stores/myFeature.ts`:

```typescript
import { db } from '$lib/db';
import { persistData } from '$lib/storage';

export async function addItem(data: MyItem) {
  const id = await db.myTable.add(data);
  await persistData();
  return id;
}

export async function getItems() {
  return db.myTable.toArray();
}
```

2. Add table to `src/lib/db/index.ts`:

```typescript
// In schema
myTable: '++id, name, createdAt'

// In interface
myTable: EntityTable<MyItem, 'id'>;
```

### New Component

1. Create `src/lib/components/MyComponent.svelte`:

```svelte
<script lang="ts">
  interface Props {
    value: string;
    onChange?: (value: string) => void;
  }

  let { value, onChange }: Props = $props();
</script>

<div class="my-component">
  {value}
</div>

<style>
  .my-component {
    /* Component-scoped styles */
  }
</style>
```

### New Modal

Use `ModalContainer` for consistent modal behavior (focus trap, backdrop click, escape key):

```svelte
<script lang="ts">
  import ModalContainer from '$lib/components/ModalContainer.svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();
</script>

<ModalContainer {isOpen} title="My Modal" titleId="my-modal-title" {onClose}>
  <form class="p-6 space-y-4">
    <!-- Modal content here -->
  </form>
</ModalContainer>
```

`ModalContainer` provides:
- Focus trap (keyboard navigation stays in modal)
- Escape key to close
- Click outside to close
- Configurable max-width (`sm`, `md`, `lg`, `xl`)
- Optional close button via `showCloseButton` prop

### New Route

1. Create `src/routes/mypage/+page.svelte`:

```svelte
<script lang="ts">
  import HeaderNav from '$lib/components/HeaderNav.svelte';
</script>

<HeaderNav title="My Page" />

<main class="p-6">
  <!-- Page content -->
</main>
```

2. Add to SideNav in `src/lib/components/SideNav.svelte`

---

## Testing

### Setup

Tests use Vitest with jsdom environment. Setup in `src/tests/setup.ts`.

### Writing Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import MyComponent from './MyComponent.svelte';

describe('MyComponent', () => {
  it('renders value', () => {
    render(MyComponent, { props: { value: 'test' } });
    expect(screen.getByText('test')).toBeInTheDocument();
  });
});
```

### Running Tests

```bash
npm run test           # Watch mode
npm run test:run       # Single run
npm run test:coverage  # With coverage
```

---

## Code Conventions

### Naming

- **Files**: kebab-case (`my-component.svelte`, `date-helpers.ts`)
- **Components**: PascalCase (`MyComponent`)
- **Functions**: camelCase (`formatCurrency`, `handleClick`)
- **Constants**: SCREAMING_SNAKE (`MAX_BACKUPS`, `CURRENCY_EPSILON`)

### TypeScript

- Explicit return types on exported functions
- Interface over type for object shapes
- Avoid `any`, use `unknown` when needed

### Styling

- Tailwind utilities for most styling
- Design tokens in `app.css` (`--color-primary-500`, etc.)
- Component-scoped `<style>` for complex/unique styles

### Currency Handling

Always use utilities from `src/lib/utils/currency.ts`:

```typescript
import { roundCurrency, currencyEquals, sumCurrency, roundCoefficient } from '$lib/utils/currency';

// Round to 2 decimals (currency values)
roundCurrency(33.333);  // 33.33

// Compare with tolerance
currencyEquals(10.0, 10.001);  // true

// Sum array with rounding
sumCurrency([0.1, 0.2, 0.3]);  // 0.60

// Round coefficients/ratios (default 4 decimals)
roundCoefficient(0.12345);  // 0.1235
```

**Important**: Use `roundCoefficient()` for ratios, variance, and decimal percentages—NOT `roundCurrency()`.

---

## Design System

### Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-primary-500` | #C45D3A | Primary actions, links |
| `--color-primary-600` | #B5522F | Hover states |
| `--color-cream` | #FAF8F5 | Background |
| `--color-charcoal` | #2D2A26 | Text |
| `--color-success-500` | #5B8C5A | Positive states |
| `--color-warning-500` | #D4915D | Warnings |
| `--color-danger-500` | #C17B7B | Errors, destructive |

### Typography

| Font | Variable | Usage |
|------|----------|-------|
| Fraunces | `font-display` | Headings |
| DM Sans | `font-sans` | Body text |
| DM Mono | `font-mono` | Amounts, code |

### Spacing

Use Tailwind's spacing scale: `p-4`, `m-2`, `gap-6`, etc.

---

## Insights Engine

### Memoization

The InsightsEngine uses version-based caching:

```typescript
// Single-key cache (global calculations)
const _getYTDStats = memoByVersion(rawGetYTDStats);

// Multi-key cache (per-month calculations)
const _getSpending = memoByVersionMultiKey(rawGetSpending, 12);
```

Cache invalidates automatically when `TransactionCache.version` changes.

### Adding Insights

1. Create calculation in `src/lib/insights/calculations/`:

```typescript
export function calculateMyInsight(
  transactions: Transaction[],
  categories: Category[]
): MyInsightResult {
  // Pure calculation, no side effects
  return { ... };
}
```

2. Add memoized wrapper in `InsightsEngine`:

```typescript
private _getMyInsight = memoByVersionMultiKey(calculateMyInsight);

getMyInsight(transactions: Transaction[], key: string) {
  return this._getMyInsight(this.version, key, transactions, ...);
}
```

---

## Storage Layer

### Persistence

All writes go through `persistData()`:

```typescript
import { persistData, withPersistence } from '$lib/storage';

// Manual persistence
await db.transactions.add(data);
await persistData();

// Auto-persistence wrapper
await withPersistence(async () => {
  await db.transactions.add(data);
});
```

### Backups

- Created automatically (debounced 1 min)
- Max 10 retained in `backups/` folder
- Optional iCloud sync when enabled

### Testing Without Tauri

In tests, `isTauri()` returns false and persistence is skipped:

```typescript
// storage/index.ts
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}
```

---

## Build & Release

### Development Build

```bash
npm run tauri:dev
```

### Production Build

```bash
npm run tauri:build
```

Output:
- **App**: `src-tauri/target/release/bundle/macos/Ledger.app`
- **DMG**: `src-tauri/target/release/bundle/dmg/Ledger_0.1.0_aarch64.dmg`

### Tauri Configuration

Edit `src-tauri/tauri.conf.json` for:
- App metadata (name, version, identifier)
- Window settings
- Build configuration
- Plugin permissions

---

## Troubleshooting

### Tauri Build Fails

```bash
# Update Rust
rustup update

# Clean and rebuild
cd src-tauri && cargo clean && cd ..
npm run tauri:build
```

### Type Errors

```bash
# Full type check
npm run check

# Sync SvelteKit types
npm run check -- --watch
```

### Database Issues

```bash
# Clear IndexedDB (browser dev tools)
# Application → Storage → IndexedDB → Delete database
```

### Hot Reload Not Working

```bash
# Restart dev server
npm run tauri:dev
```
