# Design: Dynamic reorder point from lead time + usage estimate

## Context

The "ใกล้หมด" (low-stock) warning system — the top banner, the "แสดงเฉพาะอะไหล่ใกล้หมด" filter, the Stock table's "วิกฤต/ใกล้หมด" badge, and the confirm() warning on the `−` button — all compare `part.qty <= part.reorder`, where `reorder` is the flat `safety factor` column value. This is a fixed number per item with no relationship to how fast that item actually gets used or how long it takes to restock, so the warning can fire too late for slow-lead-time items or too early for fast-lead-time ones.

No real consumption-history data exists anywhere in the sheets today (checked: the `requests` sheet is free-text purchase requests, not linked to STOCK by MAT code, and the Stock tab's ± buttons overwrite `Qty.` directly with no movement log). Building real usage-rate tracking is a separate, larger project, explicitly deferred — this spec uses a manual per-item estimate instead, usable immediately.

## Scope

Client-side only (`index.html`). No `Code.gs` changes, no new write action — this is a pure read/display feature. No movement-log/consumption-tracking (deferred). No new UI for entering lead time or usage estimate — both are filled in directly in the Google Sheet, the same way `safety factor` already is today.

## Data

Two new STOCK sheet columns, filled in manually per item, both optional (blank/0 = "not using this for that item yet"):
- `lead time (days)`
- `avg monthly usage`

`csvToStock_` reads both via `headers.indexOf(...)`, matching the existing header-name-lookup convention (not positional), defaulting to `0` when the column is missing or the cell is blank.

## Formula

A new computed field per stock item, `dynamicReorderPoint`:

```javascript
const hasLeadTimeData = part.leadTimeDays > 0 && part.avgMonthlyUsage > 0;
const dynamicReorderPoint = hasLeadTimeData
  ? Math.ceil((part.avgMonthlyUsage / 30) * part.leadTimeDays) + part.reorder
  : part.reorder;
```

`reorder` (the existing `safety factor` column) is reused as the safety-stock buffer added on top of lead-time demand — no third new column. When either new field is blank/0 for an item, `dynamicReorderPoint` falls back to exactly `reorder`, matching today's behavior — this lets the fields be filled in item-by-item without affecting items that haven't been set up yet.

## Where it plugs in

Every existing `part.qty <= part.reorder` comparison in `index.html` switches to `part.qty <= part.dynamicReorderPoint`:
- The top banner's low-stock item count.
- The "แสดงเฉพาะอะไหล่ใกล้หมด" filter.
- The Stock table's "วิกฤต/ใกล้หมด" badge.
- The confirm() warning shown when the `−` button would drop qty below threshold.

## Display

The Stock table's existing "จุดปลอดภัยขั้นต่ำ" column shows `dynamicReorderPoint` (the number actually driving the warnings) instead of the raw `reorder` value. When `hasLeadTimeData` is true for a row, add a `title` tooltip attribute on that cell showing the breakdown, e.g. `lead time 7 วัน × เบิกเฉลี่ย 30/เดือน + buffer 5 = 12` — so the number that triggers warnings is never silently different from what's displayed without explanation. When `hasLeadTimeData` is false, the cell just shows the plain `reorder` number as today, no tooltip.

## Error handling

None new — this is pure client-side arithmetic over data that already loaded successfully via the existing CSV fetch path. No new failure mode.

## Testing

No test framework in this project (matches prior work). Manual verification: an item with no lead-time/usage data shows the same reorder point and warnings as today (regression check); an item with both fields filled in shows a higher/lower computed reorder point than its raw safety factor, with a tooltip showing the breakdown, and the low-stock banner/filter/badge/confirm-warning all reflect the computed value, not the raw one.
