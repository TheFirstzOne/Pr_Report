# Design: Filters for the Orders (PR) Tab

## Context

The Orders tab (`content-orders` in `index.html`) currently renders all 369 real `PR` rows in one flat table with no way to narrow it down. `Ref/dashboard.html` (a different, older project) has a combined filter toolbar — free-text search, a single-select month dropdown, and a multi-select status filter (checkboxes with "select all / clear all") that all AND together. This spec ports that *interaction pattern* to the Orders tab — not Ref's markup or CSS, which belongs to a visually unrelated design system. The new filter toolbar is built with the same Tailwind utility classes already used throughout `index.html`.

Real data profile (pulled live from the deployed sheet, via `?action=orders`), used to size the UI:
- **Status**: RECEIVED (321), Pending (18), DEL. (4), Cancle (4) — 4 values
- **Category**: JIG & FIXTURE (106), ACCES (97), MAINTENANCE (80), PROJECT (62), blank (8)
- **Vendor**: 9 distinct named vendors + blank (265 of 369 rows have no vendor recorded)
- **Date range**: 1/5/2026 to 3/6/2026

## Scope

Client-side filtering only — no server changes, no changes to `Code.gs`. All 369 order rows are already loaded into the `purchaseOrders` array by `loadAllData()`; filtering narrows what `renderOrdersTable()` displays, nothing more. No sort feature in this round (explicitly deferred).

## UI

A filter toolbar row added above the existing Orders table (inside `content-orders`, above the `<!-- Purchase Orders Table -->` card):

- **Search input** — matches `itemName`, `prNo`, `poNo`, or `matCode`, substring, case-insensitive.
- **Month dropdown** (single-select) — options built at render time from the distinct `M/YYYY` values actually present in `purchaseOrders` (not a hardcoded month list), plus a default "ทุกเดือน" (all).
- **Status filter** (multi-select checkbox dropdown) — options are the distinct real values (RECEIVED, Pending, DEL., Cancle), each with its own "เลือกทั้งหมด / ล้างทั้งหมด" pair, same interaction as Ref's status filter.
- **Category filter** (multi-select checkbox dropdown) — same interaction, options built from distinct real `category` values, with blank category shown as an explicit "(ไม่ระบุ)" option rather than silently dropped.
- **Vendor filter** (multi-select checkbox dropdown) — same interaction, options built from distinct real `vendor` values plus "(ไม่ระบุ)" for blank.
- **"ล้างตัวกรองทั้งหมด"** (reset all) button — clears search text and resets all four filters to "everything selected."
- **"แสดง N จาก M รายการ"** counter, updated live as filters change.

## Behavior

All five criteria combine with AND logic — matching a search term AND matching the selected month AND status in the selected set AND category in the selected set AND vendor in the selected set. An empty selected-set for any multi-select is treated as "no filter" (show all), matching Ref's default-all behavior, not "show nothing."

The three existing stat cards (รออนุมัติจัดซื้อ / อยู่ระหว่างจัดส่ง / จัดส่งและตรวจรับสำเร็จ) continue to be computed from the full, unfiltered `purchaseOrders` array — filtering the table never changes those numbers.

Filters persist across a manual data refresh (clicking "รีเฟรชข้อมูล" re-fetches `purchaseOrders` and re-applies the current filter state) rather than resetting to "show all."

## Implementation shape

- Filter state lives in five module-level variables: `orderSearchText` (string), `orderSelectedMonth` (string, `"all"` default), `orderSelectedStatuses`, `orderSelectedCategories`, `orderSelectedVendors` (each a `Set`, empty = "all").
- A new `applyOrderFilters()` function derives `filteredOrders` from `purchaseOrders` + current filter state, then calls the render step and updates the "แสดง N จาก M" counter.
- `renderOrdersTable()` is split: the table-body-rendering portion now reads from a `filteredOrders` parameter/array instead of `purchaseOrders` directly; the three stat-card lines stay reading `purchaseOrders` and move into (or stay called from) `renderAll()`/`renderOrdersTable()` unchanged.
- Each filter control's `oninput`/`onchange`/checkbox-click handler calls `applyOrderFilters()`.
- The month/status/category/vendor option *lists* themselves are rebuilt from `purchaseOrders` once per `loadAllData()` cycle (a `populateOrderFilterOptions()` step), since the real sheet's distinct values could change between refreshes.

## Error handling

None new — this is pure client-side array filtering over data that already loaded successfully; there's no new failure mode to handle beyond the existing fetch-error banner.

## Testing

No test framework in this project (matches prior work). Manual browser verification: search alone, month alone, each multi-select alone, several combined, reset button, and confirming filters survive a refresh click — enumerated as explicit steps in the implementation plan.
