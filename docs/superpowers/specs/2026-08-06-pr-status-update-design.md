# Design: PR status update from SAP ME5A export

## Context

GitHub issue #3 ("Update Pr status"): PR sheet `STATUS` is only ever changed one row at a time (`receiveOrder_`, or by hand in the sheet). The user instead wants to upload the same kind of SAP ME5A `.xlsx` export already used by the SAP verify feature (`docs/superpowers/specs/2026-07-25-sap-me5a-verify-design.md`) and have the app bulk-update `STATUS` (and, when applicable, `PO No.`) for every matching PR line item, driven by the export's `Release indicator` column.

Confirmed real column names from `template/ME5A.XLSX` (same file, beyond the 5 columns the verify feature already reads):
- `Release indicator` — sample data shows values `Y` and `Z` (no `X` observed in the sample, but the issue names it as a valid case)
- `Purchase order` — the PO number, populated when a requisition has progressed to a PO (blank in the sample data, but the mechanism must handle it)

## Scope

Client-side parse/preview (`index.html`) + one new `Code.gs` `doPost` action for the actual write. Explicitly NOT in scope: partial application of a batch (it's all-or-nothing per reviewed row, but rows are independent — a failure on one row doesn't block the others), retrying failed rows automatically, any change to the existing SAP verify feature.

## Indicator → status mapping

| `Release indicator` | New `STATUS` | Also writes `PO No.`? |
|---|---|---|
| `X` or `Y` | `Pr` | no |
| `Z` | `PO` | yes — from the row's `Purchase order` cell |
| anything else (blank, unrecognized) | — | row silently excluded from the preview, no error (explicit user decision — this file legitimately contains many non-actionable rows) |

## Matching key

`prNo + matCode + qty` — same composite fields `receiveOrder_` already uses to disambiguate the PR sheet's known duplicate-row cases (split POs against one requisition line), read from the export's `Purchase Requisition` / `Material` / `Quantity requested` columns (already parsed for the verify feature) against the app's in-memory `purchaseOrders`.

- Exactly 1 system match → candidate row.
- 0 matches → excluded from the write, counted separately in the preview as "ไม่พบในระบบ" so it isn't silently dropped without explanation.
- >1 matches → excluded, same "ไม่พบในระบบ"-style bucket (never guess which row to touch — matches `receiveOrder_`'s refuse-on-ambiguity convention).

**Already-`RECEIVED` guard:** if the matched system order's `normalizedStatus` is `RECEIVED`, the row is excluded from the write regardless of what the export says (explicit user decision — a receive event is a one-way door, the export must never regress it back to `Pr`/`PO`). Checked both client-side (to keep it out of the preview) and again server-side under the lock (defense in depth — the export was parsed before the confirm click, so a receive could have happened in between).

## UI

**Trigger:** a "Status" button next to the existing "Verify" button in the Orders tab header (`index.html`, same row as `index.html:463-467`), same hidden-file-input pattern, `accept=".xlsx"`.

**On file selected:**
1. Parse via the same `XLSX.read()` path the verify feature uses; reuse its required-column check for the 3 matching columns, plus require `Release indicator` (missing `Purchase order` is NOT required — only `Z`-indicator rows need it, checked per-row instead).
2. Filter to detail rows (non-blank `Material`, same convention as `parseSapExport_`).
3. For each row: look up the indicator mapping, match against `purchaseOrders`, apply the RECEIVED guard, and sort into either the pending-changes list or the excluded count.
4. Open a preview modal (same shell/close convention as `modal-sapVerifyResults`): a table — Pr No. / Mat Code / ชื่อ / สถานะเดิม → สถานะใหม่ / PO No. (blank unless the new status is `PO`) — one row per pending change, plus a summary line with the excluded count ("ไม่พบในระบบหรือรับของแล้ว N รายการ"). A "ยืนยัน" button in the footer; closing without confirming (X or Escape) discards everything, matching the verify modal's discard-on-close convention.
5. If there are zero pending changes, the modal still opens showing "ไม่มีรายการที่ต้องอัปเดต" plus the excluded count, so the user gets feedback instead of nothing happening.

**On confirm:** POST the full pending-changes list in one request; on success, reconcile each order's local `status`/`normalizedStatus`/`poNo` (in the in-memory `purchaseOrders`/render state) from the server's per-row result, close the modal, toast a summary ("อัปเดตสถานะสำเร็จ N รายการ"). On failure, toast a generic error, leave local state untouched (nothing was optimistically changed before the confirm POST, unlike `receiveOrder`/`adjustStockQty`'s pattern — here the preview step already serves as the "are you sure" moment, so there's no separate optimistic-then-rollback phase).

## Server: `Code.gs`

New `doPost` action `updatePrStatus`, handler `updatePrStatus_(updates)` where `updates` is `Array<{prNo, matCode, qty, status, poNo}>`:

1. One `LockService.getScriptLock()` for the whole batch (not one per row — this is one export upload, one logical operation).
2. Read the `PR` sheet once (`getDataRange().getValues()`), resolve headers once.
3. For each update: find the row by `Pr No.` + `MAT CODE` + `QTY.` (string-compared, matching this file's existing convention for ID comparison — `CLAUDE.md`: "write handlers use string-compared IDs since Sheets values and POST payload values can differ in type"). 0 or >1 matches → skip, record as `{prNo, matCode, error: "not found"}` in the result. Exactly 1 match → re-check that row's current `STATUS` isn't `RECEIVED`/`ได้รับแล้ว`/`OK`/`SUCCESS` (same values `normalizeOrderStatus` treats as the RECEIVED bucket) — if it is, skip with `{prNo, matCode, error: "already received"}`. Otherwise set `STATUS` to `status`, and if `status === "PO"` and `poNo` is non-blank, also set `PO No.`.
4. Return `{success: true, updated: [...], skipped: [...]}` — client uses `updated` to reconcile, ignores `skipped` beyond the toast count already computed client-side from the preview.

## Error handling

- Corrupt/non-xlsx file, or missing one of the 3 required matching columns → same toast pattern as the verify feature (named missing column, no modal).
- Network/timeout on the confirm POST → generic error toast, `console.error`, modal stays open so the user can retry confirm without re-uploading.
- Everything else (not-found, already-received, unrecognized indicator) is a silent per-row exclusion, not a user-facing error — the preview's summary counts are the only signal, matching the user's explicit preference over surfacing every excluded row individually.

## Deployment note

`updatePrStatus_`/the new `doPost` branch only take effect once `Code.gs` is manually redeployed to the Apps Script project (per `CLAUDE.md` — this repo isn't `clasp`-synced). Flagging this now since the same gap already caused the feedback-label feature to silently not work end-to-end.

## Testing

No test framework in this project (matches all prior specs). Manual verification: upload a copy of `template/ME5A.XLSX` with one `Y` row's Pr No./Mat Code edited to match a real live `Pr`/`Pending`-status PR row — confirm it appears in the preview as `Pr No./Mat Code → Pr`; edit another to `Z` with a `Purchase order` value and matching Pr No./Mat Code — confirm it previews as `→ PO` with that PO number shown; confirm a row matching an already-`RECEIVED` PR row is excluded and counted, not shown; confirm the summary counts add up (pending + excluded = total detail rows in the sheet); confirm closing the modal without confirming leaves the live sheet untouched; confirm clicking "ยืนยัน" actually updates `STATUS` (and `PO No.` where applicable) in the live sheet and the Orders table reflects the new status without a full page reload.
