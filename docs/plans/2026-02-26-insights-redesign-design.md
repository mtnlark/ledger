# Insights Page Redesign — Design Document

**Date:** 2026-02-26
**Status:** Approved
**Context:** UX audit identified 10 areas for improvement; this design addresses all of them.

---

## Overview

The Insights page has solid foundations but needs refinement in visual hierarchy, information density, and consistency. This redesign:

1. Establishes SmartTakeaways as the clear "hero" element
2. Reduces redundancy (velocity duplication, duplicate charts)
3. Improves scannability with color indicators and grouped sections
4. Standardizes patterns (empty states, typography, colors)
5. Adds a new edit modal for detected recurring bills

---

## Section 1: Visual Hierarchy & Overview Tab

### 1.1 SmartTakeaways as Hero

Elevate SmartTakeaways visually:
- Add left accent border: `border-l-4 border-primary-400`
- Increase headline from `text-lg` to `text-xl`
- Keep existing `bg-primary-50/40` background for retrospective mode

### 1.2 QuickStatsRow Color Indicators

Add colored text indicators to the existing 3-card layout:

**Budget categories (X/Y on track):**
- Green (`text-success-600`): All on track (X = Y)
- Yellow (`text-warning-600`): ≥ half on track (X ≥ Y/2, but X < Y)
- Red (`text-danger-600`): Less than half on track (X < Y/2)

**Savings rate:**
- Green (`text-success-600`): Any savings (> 0%)
- Neutral (`text-charcoal`): 0% savings

### 1.3 "Where It Goes" — Top Categories Bar Chart

Replace pie chart with ranked horizontal bars (top 5 categories):

```
Where It Goes
─────────────────────────────────────
🛒 Groceries        ████████████  $620  25%
🍽️ Restaurants      ████████      $412  17%
🏠 Rent             ███████       $350  14%
🎉 Fun              █████         $245  10%
   Other (8)        ████████████  $823  34%
```

- Reuse gradient fill-bar pattern from Top Merchants
- "Other" row groups remaining categories with count
- Clicking "Other" navigates to Spending tab

---

## Section 2: Spending Tab Changes

### 2.1 SpendingThisMonth — Velocity Badge Only

**Remove:** The entire "Spending Pace" card section

**Keep:** Velocity badge in header with improved context:
- Change label from "faster" / "slower" to "faster pace" / "slower pace"
- Keep existing color logic (warning/success/muted based on significance)

### 2.2 CategoryDeepDives — Simplify & Add Treemap

**Remove:**
- `CategoryBreakdownChart` pie chart (replaced by treemap)
- "Range $X–$Y" from stats line

**Keep:**
- Category selector (will become chip picker — see Section 5)
- Variability badge (color change in Section 5)
- Simplified stats line: `$289/mo ± $127`
- Category trend chart
- Month-over-month comparison

**Add:** Treemap visualization for category breakdown
- Shows all categories with spending > $0
- Each rectangle labeled with emoji + amount
- Color intensity based on spending proportion
- Replaces the removed pie chart

---

## Section 3: Recurring Tab Changes

### 3.1 Grouped Section Headers

Replace flat subscription list with grouped headers:

```
Monthly · $127/mo
─────────────────────────────────────
[subscription cards...]

Semi-Annual · $60/6mo (~$10/mo)
─────────────────────────────────────
[subscription cards...]

Annual · $432/yr (~$36/mo)
─────────────────────────────────────
[subscription cards...]
```

- Header style: `text-sm font-semibold text-charcoal-soft` with subtle bottom border
- Monthly equivalent shown in parentheses for semi-annual/annual

### 3.2 Possibly Inactive — More Prominent

- Wrap section header in warning banner: `bg-warning-50 rounded-lg px-4 py-2`
- Keep existing card styling for individual items

### 3.3 Detected Bills — Edit Modal (New Feature)

Replace X dismiss button with edit modal:

**Trigger:** Click on detected bill row or explicit "Edit" button

**Modal contents:**
```
┌─────────────────────────────────────────────┐
│  Edit Detected Bill                      X │
├─────────────────────────────────────────────┤
│  ConEd                                      │
│  Detected: ~$142/mo (varies)                │
│                                             │
│  ○ Keep as detected (variable amount)       │
│  ○ Set fixed amount: [________]             │
│  ○ Remove from recurring list               │
│                                             │
│            [Cancel]  [Save]                 │
└─────────────────────────────────────────────┘
```

- Radio button selection
- "Set fixed amount" reveals input when selected
- "Remove from recurring list" = current dismiss behavior
- Uses existing `ModalContainer` and button patterns

---

## Section 4: Year in Review Tab Changes

### 4.1 Remove Mini Heatmap

Delete "Last 30 days" mini heatmap preview from YTDSummary (lines 129-143). Full calendar heatmap is sufficient.

### 4.2 Tags Section — Default Collapsed

Wrap "Tags This Year" in `InsightGroup`:
- Title: "Tags This Year"
- Preview: Top 2 tags with totals (e.g., "#vacation $1,240 · #gifts $380")
- `defaultExpanded={false}`

### 4.3 Remove Duplicate Needs vs Wants Row

Delete the compact "All-time needs vs wants" summary from YTDSummary (lines 199-207). `NeedsWantsInsights` component shows the same data with more detail.

### 4.4 Restyle NeedsWantsInsights Bar Colors

Update bar visualization to match personal/shared color scheme:
- Needs: `bg-neutral-500`
- Wants: `bg-primary-400`

Keep all existing detailed breakdown (category lists, trend chart, etc.).

---

## Section 5: Polish & Consistency

### 5.1 Empty States — Standardize

| Component | Current | Change |
|-----------|---------|--------|
| RecurringInsights | Uses EmptyState | No change |
| SavingsInsights | Uses EmptyState | No change |
| SpendingThisMonth | Sections don't render | Add inline EmptyState for Top Merchants |
| CategoryDeepDives | "Select a category" text | Add EmptyState if no transactions |

Empty states render inline (compact), not full card height.

### 5.2 Color Usage — Variable Badge

In CategoryDeepDives variability classification:
- Steady: `bg-success-500` (green) — no change
- Moderate: `bg-warning-500` (yellow) — no change
- Variable: `bg-neutral-500` (gray) — **changed from red**

### 5.3 Typography Scale — Standardize

| Level | Usage | Style |
|-------|-------|-------|
| Section header | "Spending This Month" | `text-xl font-display font-medium` |
| Subsection header | "Top Merchants" | `text-sm font-semibold text-charcoal-soft` |
| Big numbers | "$2,450" | `text-2xl font-mono font-medium` |
| Labels | "47 transactions" | `text-xs text-charcoal-muted` |

Audit subsection headers and standardize to `text-sm font-semibold`.

### 5.4 Interaction Affordances

**InsightGroup header:**
- Add `cursor-pointer` to clickable header button

**Category selector (CategoryDeepDives):**
- Replace `<select>` with horizontal chip picker
- Pills scroll horizontally
- Selected: `bg-primary-500 text-white`
- Unselected: `bg-surface-alt`
- Shows emoji + name, current spend in smaller text

**Expand/collapse (SmartTakeaways):**
- Change "See more" / "Show less" from text link to pill button
- Style: `px-3 py-1 rounded-full bg-surface-alt hover:bg-cream-dark`

---

## Components Affected

| Component | Changes |
|-----------|---------|
| `+page.svelte` (insights) | Remove CategoryBreakdownChart from Overview |
| `SmartTakeaways.svelte` | Hero styling, pill button for expand |
| `QuickStatsRow.svelte` | Color indicators |
| `SpendingThisMonth.svelte` | Remove Spending Pace card, update velocity label |
| `CategoryDeepDives.svelte` | Remove pie chart, add treemap, simplify stats, chip picker |
| `CategoryBreakdownChart.svelte` | Create new TopCategoriesBar variant or new component |
| `RecurringInsights.svelte` | Grouped headers, prominent inactive, edit modal |
| `YTDSummary.svelte` | Remove mini heatmap, remove needs/wants row |
| `NeedsWantsInsights.svelte` | Update bar colors |
| `InsightGroup.svelte` | Add cursor-pointer |
| **New:** `EditDetectedBillModal.svelte` | Modal for detected bill editing |
| **New:** `CategoryChipPicker.svelte` | Horizontal scrolling chip selector |
| **New:** `Treemap.svelte` | Treemap visualization component |
| **New:** `TopCategoriesBar.svelte` | Horizontal bar chart for top 5 categories |

---

## Out of Scope

- Dashboard changes (separate effort)
- Budget page changes
- Savings page changes
- Mobile/responsive improvements (desktop-first app)
