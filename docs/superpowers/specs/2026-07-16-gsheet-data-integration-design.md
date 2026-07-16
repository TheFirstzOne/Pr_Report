# Design: Wire index.html to Live Google Sheet Data

## Context

`index.html` is an existing, fully-built dashboard mockup (5 tabs: Stock, Orders/PR, RFQ, Budget, Quotation History) seeded with hardcoded mock arrays. The spreadsheet is [1oOzyZxcfzzfirdeOKUO1m9S6NjXKFUFgkfhNzNZqtV8](https://docs.google.com/spreadsheets/d/1oOzyZxcfzzfirdeOKUO1m9S6NjXKFUFgkfhNzNZqtV8), shared "anyone with link." This spec covers replacing the mock data with live reads from that sheet. No UI redesign — the existing layout, styling, and render functions stay as-is; only the data source changes.

`Ref/` (Code.gs, Report-Status.gs, Report-Summary.gs, dashboard.html) is a different, older project (different spreadsheet ID, PR-expense-only dashboard). It's referenced here only as a style precedent for Apps Script + Sheets patterns — none of its code or the Telegram integration carries over.

## Scope: v1 is read-only

No writes back to the sheet. All "add/approve/simulate" buttons currently in the mockup (Add Stock, Approve Quotation, Simulate Vendor Response, Issue New RFQ) are out of scope for v1 — display-only dashboard.

## Architecture

Two independent pieces, no build tooling:

1. **`Code.gs`** — a Google Apps Script project bound to the spreadsheet, deployed as a Web App. It is a thin, read-only JSON API — no HTML templating, no `google.script.run`.
   - `doGet(e)` dispatches on `e.parameter.action`: `stock`, `requests`, `quotes`, `budget`, `orders`, or `all` (all five in one response, used for initial page load).
   - Each handler reads a sheet with `getDataRange().getValues()`, maps the header row to object keys, and returns `ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON)`.
   - No auth logic — deployed as "Execute as Me, Anyone with access," matching the sheet's existing sharing.
   - Deployment is manual on the user's side (open spreadsheet → Extensions → Apps Script → paste `Code.gs` → Deploy → Web app). This can't be driven from here since it requires interactive Google OAuth.

2. **`index.html`** — stays a static file, structurally unchanged. The five hardcoded arrays (`stockParts`, `rfqList`, `quoteHistory`, `projectsBudget`, `purchaseOrders`) are replaced by a `loadAllData()` function that fetches `{EXEC_URL}?action=all`, then calls the existing render functions (`renderStockTable()`, `renderBudgetInfo()`, etc.) with the fetched data. The exec URL is a config constant the user pastes in after deploying.
   - Loads once on page open, plus a "Refresh" button in the header to re-fetch. No polling.
   - On fetch failure: an inline error banner (not a blank/frozen table) with the raw error message from `Code.gs`.

## Data mapping

Real sheet headers (confirmed by reading the live sheet):

| Sheet | Real columns |
|---|---|
| `STOCK` | CATEGORY, MAT CODE, DESCRIPTION, Qty., Unit, safety factor, Remark |
| `requests` | req_id, created_at, who, role, part, qty, remark, needs_review, status, photo_url, urgent |
| `QuotationHistory` | ลำดับ, ชื่อสินค้า, จำนวน, หน่วย, ราคาต่อหน่วย, ราคารวม, บริษัทผู้เสนอราคา, ใบเสนอราคาเลขที่, วันที่ |
| `Budget` | No., IO, ASSET, COST CENTER, DESCRIPTION, BUDGET, USED, CURRENT |
| `PR` | DATE, Priority, PO No., Pr No., MAT CODE, ORDER, QTY., UNIT, PRICES, TOTAL PRICE, Remark, STATUS, APPROVAL, DESCRIPTION, Category, VENDOR |

### Stock tab
Direct mapping to `CATEGORY → category, MAT CODE → id, DESCRIPTION → name, Qty. → qty, Unit → unit, safety factor → reorder, Remark → remark`. The mockup's `location` field (ตู้ A1-ชั้น 1) has no source column and is dropped from v1. Low-stock flag: `qty <= reorder`, same logic already in the mockup.

### Budget tab
Two parts, both already have UI slots in the mockup:
- **Per-project table**: 1:1 mapping from `Budget` sheet (`No. → no, IO → io, ASSET → asset, COST CENTER → costCenter, DESCRIPTION → desc, BUDGET → budget, USED → used, CURRENT → current`).
- **Monthly spend chart**: computed from `PR` sheet, grouping `TOTAL PRICE` by month of `DATE` (same aggregation pattern as the reference project's `Report-Summary.gs`), feeding the existing chart component.

### Orders (PR) tab
Direct 1:1 mapping: `DATE → date, PO No. → poNo, Pr No. → prNo, MAT CODE → matCode, ORDER → itemName, QTY. → qty, UNIT → unit, PRICES → unitPrice, TOTAL PRICE → totalCost, STATUS → status, Category → category, VENDOR → vendor`.

### Quotation History tab
Direct 1:1 mapping: `ลำดับ → id, ชื่อสินค้า → itemName, จำนวน → qty, หน่วย → unit, ราคาต่อหน่วย → unitPrice, ราคารวม → totalCost, บริษัทผู้เสนอราคา → supplier, ใบเสนอราคาเลขที่ → rfqRef, วันที่ → date`. Sheet is currently empty — tab shows its existing empty state until data is entered.

**Approval-status column dropped.** The mockup's "สถานะอนุมัติ" badge and "อนุมัติสั่งซื้อ" button are driven by a `status` field with no source column in `QuotationHistory` — left as-is, every real row would incorrectly render as "ปฏิเสธ" (rejected) since `status` would always be undefined. Both the status column and the action column are removed from this tab for v1. Approval-status tracking is a possible future feature, out of scope here.

### RFQ tab (re-skinned columns, same purpose)
The mockup's original RFQ tab modeled *per-request supplier-quote tracking* (RFQ number, "sent to N suppliers", "ได้รับเสนอราคาแล้ว/รอรับใบเสนอราคา"). The real `requests` sheet has no supplier-count or per-request quote-status data, and `QuotationHistory` has no reference column back to `requests` (only a fuzzy, unreliable link via item-name text). Decision: no per-row join between the two sheets.

- **Table columns** (from `requests` directly): Request ID (`req_id`), Date (`created_at`), Requester (`who` + `role`), Part (`part`), Qty (`qty`), Remark (`remark`), Urgent (badge from `urgent`), Status (badge from `status`, values `ok`/`review`). `photo_url` renders as a "view photo" link when present, otherwise hidden.
- **System-wide stat**, preserving the original tab's "how many quotes are in flight" flavor without a fake per-row join: a stat card showing total quotation count across the whole system, computed as `QuotationHistory` row count (not tied to individual requests).

## Removing write controls (read-only v1)

The mockup has several buttons that mutate its in-memory mock arrays only — with live data these would be misleading (the "success" is fake, and a refresh silently reverts it). All are removed for v1:

- Header "add" buttons: `openModal('addStock')` (Stock), `openModal('rfq')` (RFQ), `openModal('addQuote')` (Quotes)
- Row-level actions: `adjustQty()` (+/− in Stock), `updateOrderStatus()` (Orders), `approveQuotation()` (Quotes), `simulateQuotationResponse()` (RFQ)

The modal dialogs and their submit handlers are left in place, unreferenced — deleting them is a separate cleanup, not required for this integration.

## Bug fix carried along: `renderBudgetInfo()`'s fake "new PO" delta

`renderBudgetInfo()` currently computes `spent` as `totalSpentBase + newPoCost`, where `newPoCost` sums any PO whose date doesn't start with a hardcoded list of the mock data's own seed dates (`1/5/`, `1/12/`, `1/14/`, `1/19/`, `1/20/`, `1/21/`). This was a demo trick to make fake "newly added" POs show up in the spent total. Against live data, any real PR row that happens to fall on those calendar dates in any year would be double-counted. Since `Budget.USED` is already the authoritative per-project spent figure, this delta is removed — `spent` becomes simply `totalSpentBase`.

## Error handling

If a sheet is missing/renamed, `Code.gs` returns `{error: "..."}` for that key (same pattern as the reference project) instead of throwing — the frontend shows the error banner for that section rather than crashing the whole page. Sheets with no data rows (e.g. `QuotationHistory` today) return an empty array, rendering the tab's existing empty state.

## Verification

Since there's no test framework in this static-HTML + Apps Script setup, `Code.gs` includes one runnable self-check function (`testAllSheets()`, in the style of the reference project's `testGetPRData()`) that calls each handler and logs row counts and the first parsed row per sheet — runnable from the Apps Script editor after deploy to confirm the header-to-key mapping is correct against the live sheet before wiring up the frontend.
