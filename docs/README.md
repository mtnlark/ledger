# Ledger Documentation

Ledger is a macOS desktop application for personal budget tracking with expense splitting, category insights, and savings tracking. Built with SvelteKit and Tauri for a native, local-first experience.

## Viewing the Docs

```bash
# Serve documentation locally
npm run docs

# Then open http://localhost:3000
```

## Quick Start

### For Users

1. Download the latest `.dmg` from Releases
2. Drag `Ledger.app` to Applications
3. Open Ledger and start tracking expenses

### For Developers

```bash
# Install dependencies
npm install

# Run in development (web only)
npm run dev

# Run with Tauri (native app)
npm run tauri:dev

# Build production app
npm run tauri:build
```

## Key Features

- **Dashboard** - Cash flow summary, transaction management, quick-add
- **Budget** - Per-category spending limits with visual progress tracking
- **Savings** - Track contributions to savings, retirement, and investment accounts
- **Insights** - Charts, trends, anomaly detection, and month-in-review
- **Shared Expenses** - Split expenses with a partner and track settlements
- **Local-First** - All data stored on your device, no cloud required

## Technology Stack

| Layer | Technology |
|-------|------------|
| Framework | SvelteKit + Svelte 5 |
| Desktop | Tauri v2 |
| Styling | Tailwind CSS v4 |
| Database | Dexie.js (IndexedDB) |
| Persistence | JSON files |
| Charts | Chart.js |

## Data Location

All data is stored locally:

```
~/Library/Application Support/app.ledger.desktop/
├── data.json       # All app data
└── backups/        # Auto-timestamped backups (max 10)
```

Optional iCloud backup available in Settings.
