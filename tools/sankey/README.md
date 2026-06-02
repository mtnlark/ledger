# Money-Flow Sankey generator

Generates a **self-contained, Monarch-style Sankey chart** of your Ledger finances
as a single HTML file (D3 + d3-sankey are inlined, so it works offline and the data
is baked in). Not part of the app — it's a standalone reporting tool.

## Regenerate

```bash
python3 tools/sankey/gen_sankey.py && open ledger-sankey.html
```

- Reads **live data** from `~/Library/Application Support/app.ledger.desktop/data.json`
  on every run, so just re-run any time to refresh.
- Output: `ledger-sankey.html` at the repo root (untracked artifact; overwritten each run).
- `d3.min.js` / `d3-sankey.min.js` are bundled here; if missing, the script re-downloads
  them from jsDelivr (the only time it needs internet).

## Current scope: year-to-date

`gen_sankey.py` filters every stream to the **current calendar year** (`date[:4] == YEAR`),
including the full current month. To change scope, edit the YTD filter block near the top:

- **All history** ("since I started"): drop the filter — set `txns/budgets/contribs`
  back to the unfiltered `d[...]` lists.
- **Strict through today**: add a `date <= today` cap (note: you'll likely want to
  prorate or drop the current month's income to keep the diagram balanced).

## How the flows are computed (kept faithful to the app's own accounting)

| Flow | Rule |
|------|------|
| **Income** | Sum of monthly-budget `income` (net / take-home). |
| **Spending** | Per category, **user's share** only: `amount − partnerShare` for shared txns, else `amount`. Excludes `isDeleted` and `isSplitParent` (children carry the real amounts). Mirrors `calculateTotalSpent()`. |
| **Savings** | Contributions whose source `affectsAvailable` — i.e. `bank_transfer` + `other`. Pre-tax payroll, employer match, and interest are **excluded** (they don't flow from take-home pay; folding them in would unbalance the diagram). |
| **General Savings** | The surplus (income neither spent nor moved to a tracked account) is folded in as a node under the Savings hub. |

## Layout notes (why it looks the way it does)

- **Two middle hubs — `Savings` and `Spending`.** Every leaf is reached via a hub in the
  same column, so no link spans more than one column. This is what eliminates the
  ribbon crossings (long bypass links draw *through* whatever sits in the skipped column).
  It is **not** a Needs/Wants grouping — categories are still flat and individual.
- **`nodeSort`** = `(a,b) => (a.group - b.group) || (b.value - a.value)`: savings side
  (`group 0`) sits above the spending side (`group 1`); within a group, by amount desc.
- Colors come from each category's own `color`; "Warm Ledger" palette for hubs.

## Possible future tweaks (discussed, not yet done)

- Roll categories below a $ threshold into a single **"Other"** node to declutter.
- A faint **Savings / Spending divider** between the two right-column groups.
- Per-month view instead of an aggregate.
