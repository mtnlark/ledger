# Ledger

Ledger is a desktop budgeting app for macOS, built with SvelteKit and Tauri using a local-first architecture. I designed it for myself to replace the spreadsheet-based budgeting I'd been doing for a long time; it handles expense tracking, category budgets, and savings goals, but it adds insights alongside a few features I wanted and couldn't find good versions of elsewhere (namely flexible expense splitting with a partner, and ability to split one transaction into multiple categories).

Since it's an app geared toward the workflows of one person (me), it's a bit quirky. The interface is organized around how I personally use it: manual day-to-day transaction entry and management; budget, savings, and shared expense views with progress bars and alerts; and an insights page with patterns like spending and saving trends and YTD review.

## Features

- **Dashboard**: Cash flow summary, transaction management with search/filters, quick-add FAB
- **Budget Tracking**: Per-category spending limits with visual progress bars and alerts
- **Savings**: Track contributions with goal projections
- **Insights**: Spending and saving trends, anomaly detection, month- and year-in-review summaries
- **Shared Expenses**: Split expenses with a partner and track settled expenses
- **Tags**: Hashtag-based tagging (`#vacation`, `#wedding`, etc.) with filtering and bulk management
- **Undo System**: Recoverable deletions with 5-second undo window

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | [SvelteKit](https://kit.svelte.dev/) + [Svelte 5](https://svelte.dev/) with runes (`$state`, `$derived`, `$props`) |
| **Desktop** | [Tauri v2](https://tauri.app/) for native macOS app |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) with custom design system |
| **Database** | [Dexie.js](https://dexie.org/) (IndexedDB) for in-memory queries |
| **Persistence** | JSON file storage with atomic writes and checksum validation |
| **Charts** | [Chart.js](https://www.chartjs.org/) with treemap and annotation plugins |
| **Testing** | [Vitest](https://vitest.dev/) with 70+ test files |

## Architecture Highlights

### Local-First Design
All data stays on-device in `~/Library/Application Support/app.ledger.desktop/` with optional iCloud sync. JSON file with automatic backups.

### Memoized Insights Engine
The insights system uses version-based memoization tied to a transaction cache. Calculations only rerun when the underlying data changes, not on every render.

### Atomic Persistence
Writes go to a temp file first, then atomic rename. If the app crashes mid-write, recovery reads from the most recent valid backup automatically.

### Split Transaction Linking
Parent-child relationships for split transactions enable proper aggregation in insights while preserving the full audit trail.

(Is it overkill for an app that only I use? Perhaps. But I had fun)

## Project Structure

```
src/
├── lib/
│   ├── components/      # Svelte components
│   ├── stores/          # Svelte stores for data operations
│   ├── insights/        # Memoized calculation engine
│   ├── storage/         # Persistence layer with Tauri adapter
│   ├── notifications/   # Native macOS notifications (WIP 👹)
│   └── utils/           # Helpers (currency, dates, validation)
├── routes/              # SvelteKit pages (Dashboard, Budget, Savings, Insights, Settings)
└── tests/               # Integration tests
src-tauri/               # Rust backend for Tauri
```

See [CLAUDE.md](./CLAUDE.md) for detailed architecture documentation.

## Development

```bash
# Install dependencies
npm install

# Run in development (web only)
npm run dev

# Run with Tauri (native macOS app)
npm run tauri:dev

# Build production app
npm run tauri:build

# Run tests
npm run test
```

## License

[MIT](./LICENSE)
