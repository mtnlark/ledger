# Ledger

A personal budget tracking desktop app for macOS. Track expenses, split costs with a partner, set category budgets, and gain insights into your spending habits.

## Features

- **Transaction Tracking** — Log expenses with merchant, category, and notes. Import from Excel spreadsheets.
- **Expense Splitting** — Split shared expenses with a partner and track who owes what.
- **Category Budgets** — Set monthly spending limits per category with visual progress tracking.
- **Insights Dashboard** — View spending breakdowns, trends, and smart highlights about your habits.
- **Subscription Tracking** — Identify recurring charges and track active subscriptions.
- **Local-First** — All data stored on your device. No accounts, no cloud sync, no tracking.

## Tech Stack

- [SvelteKit](https://svelte.dev/) + [Svelte 5](https://svelte.dev/blog/svelte-5-is-alive)
- [Tauri v2](https://tauri.app/) (Rust backend)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [Chart.js](https://www.chartjs.org/)
- [Dexie.js](https://dexie.org/) for in-memory queries

## Requirements

- macOS (Apple Silicon or Intel)
- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (for building Tauri)

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri:dev

# Run tests
npm run test
```

## Building

```bash
# Build production app
npm run tauri:build
```

The built app will be at `src-tauri/target/release/bundle/macos/Ledger.app`

## Data Storage

Data is stored locally at:
```
~/Library/Application Support/app.ledger.desktop/
├── data.json      # All app data
└── backups/       # Auto-timestamped backups
```

## License

MIT
