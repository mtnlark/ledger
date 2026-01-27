# Ledger User Guide

## Getting Started

### Installation

1. Download the `.dmg` file from Releases
2. Open the DMG and drag `Ledger.app` to your Applications folder
3. Launch Ledger from Applications

### First Launch

On first launch, Ledger creates a data file with:
- 22 default expense categories
- Default settings for expense splitting
- Sample savings accounts (Emergency Fund, 401k, etc.)

---

## Dashboard

The Dashboard is your home screen for managing transactions and viewing cash flow.

### Cash Flow Card

Shows your monthly financial summary:
- **Income** - Total income for the month
- **Saved** - Contributions to savings accounts
- **Available** - Income minus savings (what you can spend)
- **Spent** - Total expenses for the month
- **Surplus/Deficit** - Available minus spent

### Adding Transactions

**Quick Add (Recommended)**
1. Click the floating `+` button or press `Cmd+N`
2. Enter amount, merchant, and category
3. Press Enter or click Add

**Full Form**
1. Expand the "Add Transaction" section
2. Fill in all fields including optional notes
3. Toggle shared expense options if splitting with partner
4. Click Add Transaction

### Transaction List

- Transactions are grouped by date
- Click a transaction to edit
- Use the checkbox to select multiple for bulk actions
- Search by merchant name using the search bar

### Filtering

- **Month Picker** - Navigate between months
- **Category Filter** - Show only specific categories
- **Search All Time** - Toggle to search entire history

### Bulk Actions

Select multiple transactions to:
- Delete selected
- Change category for all selected
- Mark as settled (for shared expenses)

---

## Budget

Set monthly spending limits for each category.

### Setting a Budget

1. Navigate to Budget page
2. Click "Add Budget" on any category
3. Enter the target amount
4. Budget appears with progress bar

### Budget Status

| Color | Status | Meaning |
|-------|--------|---------|
| Green | On Track | Under 80% of budget |
| Yellow | Approaching | 80-99% of budget |
| Red | Over | 100%+ of budget |

### Tips

- Use "Copy from Previous Month" to quickly set up recurring budgets
- The summary card shows total budgeted vs. total spent
- Click any category to edit or remove its budget

---

## Savings

Track contributions to savings, retirement, and investment accounts.

### Account Types

| Type | Balance Tracked | Examples |
|------|-----------------|----------|
| Savings | Yes | Emergency fund, vacation fund |
| Retirement | No | 401(k), IRA, Roth IRA |
| Investment | No | Brokerage, index funds |

### Contribution Sources

| Source | Affects Available | Description |
|--------|-------------------|-------------|
| Bank Transfer | Yes | Manual transfer from checking |
| Payroll Deduction | No | Pre-tax/automatic deduction |
| Interest | No | Interest earned on account |
| Employer Match | No | 401(k) match |
| Other | Yes | Any other source |

### Adding Contributions

1. Click the `+` button on an account card
2. Enter amount, date, and source
3. Add optional notes
4. Click Add

### Savings Rate

Your savings rate is calculated as:
```
Savings Rate = (Total Contributions / Income) × 100
```

Only contributions that affect your available spending (bank transfers, other) are counted in some calculations.

---

## Insights

View spending patterns, trends, and smart takeaways.

### Current Month (Highlights)

Forward-looking insights for the current month:
- **Pace Projection** - Where you'll end up if spending continues
- **Spending Anomalies** - Unusual spending in categories
- **Category Shifts** - Changes vs. previous month
- **Top Merchants** - Where you spend most

### Past Months (Month in Review)

Retrospective analysis with:
- **Hero Stat** - Most important insight (best/worst month, milestones)
- **Spending Section** - Total spent, vs. average, category breakdown
- **Savings Section** - Contributions, savings rate, achievements
- **Highlights** - Notable patterns and anomalies

### Charts

- **Category Breakdown** - Pie/donut chart of spending by category
- **Monthly Trends** - Line chart of spending over time
- **Needs vs. Wants** - Essential vs. discretionary spending
- **Calendar Heatmap** - Daily spending intensity

### YTD Summary

Year-to-date statistics:
- Total spent
- Monthly average
- Highest/lowest spending months
- Category totals

---

## Shared Expenses

Track expenses split with a partner.

### Setting Up

1. Go to Settings
2. Enter your partner's name
3. Set default split (percentage or fixed amount)

### Marking Expenses as Shared

When adding a transaction:
1. Toggle "Shared expense"
2. Choose split type (percentage or fixed)
3. Enter split value (e.g., 50% or $25)
4. Partner's share is calculated automatically

### Settlement

1. Go to the Shared page
2. View outstanding balance
3. Select transactions to settle
4. Click "Mark as Settled"

The balance shows who owes whom based on unsettled transactions.

---

## Settings

### Profile

- **Partner Name** - Name shown in shared expense features
- **Default Split** - Pre-filled when marking expenses as shared

### Categories

Manage your expense categories:
- **Add** - Create new categories with icon and color
- **Edit** - Change name, icon, color, or essential status
- **Reorder** - Drag to change sort order
- **Delete** - Remove unused categories

### Theme

Choose your visual preference:
- Light
- Dark
- System (follows macOS)

### Data Management

**Export**
- JSON export creates a full backup of all data

**Import**
- Excel import (`.xlsx`) for bulk transaction import
- JSON import to restore from backup

**iCloud Backup**
- Toggle to copy backups to iCloud Drive
- Syncs across Macs with same iCloud account

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Focus search |
| `Cmd+N` | Quick add transaction |
| `Cmd+/` | Show shortcuts help |
| `Esc` | Close modal/dialog |

---

## Data & Privacy

### Local-First

All data stays on your device:
- No accounts or sign-up required
- No data sent to servers
- No analytics or tracking

### Backups

Automatic backups are created:
- Before each save (debounced to 1 per minute)
- Stored in `~/Library/Application Support/app.ledger.desktop/backups/`
- Maximum 10 backups retained (oldest deleted)

### iCloud (Optional)

When enabled in Settings:
- Backups copied to `~/Library/Mobile Documents/com~apple~CloudDocs/Ledger/`
- Single file (overwrites each time)
- Requires iCloud Drive enabled on your Mac

---

## Troubleshooting

### Data Not Saving

1. Check disk space
2. Verify write permissions to Application Support folder
3. Try restarting the app

### Missing Transactions

1. Check the month picker (might be viewing wrong month)
2. Try "Search All Time" toggle
3. Check category filter

### App Won't Launch

1. Right-click app → Open (bypasses Gatekeeper first time)
2. Check System Preferences → Security & Privacy
3. Try reinstalling from DMG

### Restore from Backup

1. Quit Ledger
2. Navigate to `~/Library/Application Support/app.ledger.desktop/backups/`
3. Copy desired backup to `data.json` (rename it)
4. Relaunch Ledger
