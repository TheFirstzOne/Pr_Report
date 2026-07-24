# Design: Order receiving write-back

## Context

The Orders tab reads `PR` sheet rows read-only. `STATUS` (RECEIVED/Pending/DEL./Cancle/Pr/PO/blank) is only ever set by editing the sheet directly, and receiving goods never touches `STOCK` — `addStock` (the existing manual "เพิ่มพัสดุ" button) and closing out a PO are two disconnected flows. This spec adds a "รับของแล้ว" button that does both in one write: marks the PR line item received and bumps the matching STOCK item's quantity.

Live data profile (pulled from the `PR` sheet, gid `1646453870`, 1256 rows), used to size this design:
- **Status distribution**: RECEIVED (1061), Pr (98), Pending (25), Cancle (23), DEL. (17), PO (16), blank (16)
- **No column is unique per row**: `PO No.` repeats up to 19×, `Pr No.` up to 19×, even `PO No. + Pr No. + MAT CODE` has 9 duplicate groups, and adding `QTY.` narrows it to 11 (mostly blank-`MAT CODE` rows that never show the button anyway)
- **Blank `MAT CODE`**: 7 rows — nothing to bump in STOCK for these

## Scope

Client-side button + one new `Code.gs` `doPost` action. No new sheet columns (see "Row identity" below — considered and rejected in favor of a simpler match strategy), no changes to the `PR_APPROVAL`/`PO_APPROVAL` stages or any approval workflow, no partial-quantity receiving.

## Row identity (why no new column)

A new unique-ID column on the `PR` sheet was considered, but the `PR` sheet's rows are added by an external bot this app doesn't control, so a new column would either need that bot updated (out of this app's reach) or a self-healing backfill scheme — both more complex than necessary. Instead, `receiveOrder_` matches a line item by the combination of `PO No. + Pr No. + MAT CODE + QTY.`:
- Exactly 1 match → proceed.
- 0 matches → error, "ไม่พบรายการ กรุณารีเฟรชและลองใหม่."
- More than 1 match → refuse the write outright (never guess), error "พบข้อมูลซ้ำ กรุณารีเฟรชและลองใหม่."

This is a safe-failure design: the rare ambiguous case (11 of 1256 rows, mostly blank-`MAT CODE` rows already excluded by the button-visibility rule) fails loudly instead of silently writing to the wrong row.

## UI

**Button visibility** — a new "Actions" column in the Orders table (`renderOrdersTable()`), showing "รับของแล้ว" when:
- `order.normalizedStatus` is anything except `RECEIVED` or `CANCELLED` (i.e. `PR_APPROVAL`, `PO_APPROVAL`, `PENDING`, `SHIPPING` all qualify — matches the existing `normalizeOrderStatus()` buckets), **and**
- `order.matCode` is non-blank.

Clicking shows an in-flight state ("กำลังบันทึก...", disabled) identical in spirit to the existing `toggleVerify`/`adjustStockQty` in-flight treatment.

## Server: `Code.gs`

New `doPost` action `receiveOrder`, under `LockService.getScriptLock()`:
1. Read the `PR` sheet fresh. Match the row via the 4-field combo (see above).
2. Set that row's `STATUS` cell to `RECEIVED`.
3. Bump `STOCK` for `matCode` by `qty`, reusing `addStock_`'s existing exists-vs-new logic. To avoid nested-lock issues, `addStock_`'s body is extracted into a lock-free `addStockCore_(item, sheet, data, headers)` helper; the existing `addStock` action and the new `receiveOrder_` both acquire their own lock and then call `addStockCore_`. If `matCode` isn't already in STOCK, a new row is created using the PR row's `Category`/`DESCRIPTION`/`UNIT`/`QTY.` (all present in the sheet), with `safety factor` (reorder threshold) defaulted to `0` — PR has no equivalent field; this is a known, accepted gap (an operator would need to set a real reorder threshold manually afterward for that new item).

## Client: `index.html`

Mirrors the existing `adjustStockQty`/`addStock` optimistic-write pattern:
1. Optimistic update — set the order's local `status`/`normalizedStatus` to RECEIVED, bump the matching `stockParts` entry's qty locally (or add a new one if not found), re-render.
2. New `inFlightReceiving` Set, keyed by the same composite string used for server-side matching (`` `${poNo}|${prNo}|${matCode}|${qty}` ``), guarding against double-click — same role `inFlightRequests`/`inFlightStock` already play elsewhere.
3. POST `{action: "receiveOrder", poNo, prNo, matCode, qty}` — no `Content-Type` header, matching every other write action in this file.
4. Success → reconcile the STOCK entry's qty to the server's authoritative value (same as `addStock`'s reconcile step).
5. Failure (not-found or ambiguous-match) → roll back both optimistic changes, fixed Thai-message toast (no raw `err.message` interpolation, matching the established convention), `console.error(err)`.
6. `finally` → clear the in-flight key, re-render.

## Error handling

- Network/timeout failures: same rollback + toast pattern as every other write action in this file — no new failure mode.
- 0-match and >1-match server responses are treated identically to any other `{error: "..."}` response from `doPost` — the client already has a generic error-toast path for this shape.

## Testing

No test framework in this project (matches prior work). Manual verification: click "รับของแล้ว" on a Pending/DEL./Pr/PO-status row with a real `MAT CODE` — confirm STATUS becomes RECEIVED in the sheet and STOCK qty increases by the right amount (both for an existing STOCK item and, separately, for a `matCode` not yet in STOCK); confirm the button doesn't appear for RECEIVED/Cancle rows or blank-`MAT CODE` rows; confirm double-clicking during the in-flight window doesn't double-submit; confirm a deliberately-forced ambiguous match (same PO+PR+MAT+QTY on two test rows) refuses the write with the expected error and doesn't touch either row.
