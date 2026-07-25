# Design: Verify Orders against SAP ME5A export

## Context

The user found that quantities recorded in the app's PR/Orders sheet don't always match what SAP actually shows for the same purchase requisition. To spot-check, they want to upload the raw `.xlsx` file SAP's ME5A transaction exports (sample: `template/ME5A.XLSX`) into the "รายการคำสั่งซื้อ" (Orders) tab and have the app flag any mismatch in product name, price, or quantity — matched by `Pr No.` + `Mat Code`, the same composite key already used to identify a line item in the app's own PR sheet.

## Scope

Client-side only, `index.html`. No `Code.gs` changes, no new write action, nothing persisted — a pure read/compare/display feature, re-run fresh each time a file is picked. Adds one new CDN dependency: SheetJS (`xlsx.full.min.js`), the only way to parse a binary `.xlsx` in-browser (no native platform feature covers this, unlike the CSV parsing already done by hand elsewhere in this file).

Out of scope (explicit): writing corrections back to the sheet, reporting Pr No.+Mat Code pairs that exist on only one side (SAP-only or system-only), fuzzy/normalized name matching.

## SAP file shape

Confirmed from `template/ME5A.XLSX`: one worksheet, headers in row 1, columns identified by header name (not position):
- `Purchase Requisition` → Pr No.
- `Material` → Mat Code
- `Short Text` → item name
- `Quantity requested` → qty
- `Valuation Price` → unit price

Each PR appears as a blank "summary" row (only the PR number + a total value, `Material` empty) immediately followed by one or more real detail rows (one per requisition line item, `Material` populated). Detail rows are identified the same way `csvToOrders_`/`csvToRequests_` already filter their own sheets: keep only rows where the key column (`Material`) is non-empty.

If any of the 5 required headers is missing from the uploaded file, abort immediately with an error naming the missing column — this is a hard requirement check, not an optional-field fallback (unlike e.g. `leadTimeDays`, which is allowed to be absent).

## Matching key & duplicate handling

Composite key: `prNo + '|' + matCode`, built identically for both the SAP rows and the app's already-loaded `purchaseOrders` array (`order.prNo`, `order.matCode`).

Checked the live PR sheet directly: 1209 unique Pr No.+Mat Code pairs, 7 of them have more than one row (max 3) — a real but rare case (split POs against the same requisition line). To handle it without picking an arbitrary "first row wins":

For each side (SAP rows, system rows) independently, group by key and reduce to one record:
```js
{
  name: <first row's name>,           // duplicates are assumed to share a name; not reconciled if they don't (rare, non-critical)
  qty: <sum of qty across the group>,
  totalValue: <sum of (qty * unitPrice) across the group>,
  unitPrice: totalValue / qty          // weighted average — correct even when a duplicate's per-line price legitimately differs
}
```
This applies uniformly whether there's 1 row or several in the group — no special-casing the common single-row case.

Only keys present in **both** the SAP map and the system map are compared. Keys found in only one side are silently skipped (explicit user decision — not a gap, a scope choice).

## Comparison rules

Per matched key:
- **ชื่อ (name):** exact string match, case-sensitive, no trimming/normalization (explicit user choice — stricter than default, accepts more false positives from incidental formatting differences in exchange for never masking a real wording difference).
- **จำนวน (qty):** exact numeric match (`sapQty !== systemQty`).
- **ราคา/หน่วย (unit price):** numeric match with `Math.abs(sapPrice - systemPrice) > 0.01` tolerance — avoids flagging floating-point/rounding noise as a real price discrepancy.

A key is "mismatched" if any one of the three checks fails. Each mismatched key can show 1-3 failing fields simultaneously.

## UI

**Trigger:** a button "ตรวจสอบกับ SAP (ME5A)" added to the Orders tab's table header row (`index.html`, next to "บันทึกประวัติการสั่งซื้ออะไหล่ (PO)"), styled like the Stock tab's "เพิ่มพัสดุ" button. Click opens a hidden `<input type="file" accept=".xlsx">`.

**On file selected:**
1. Read via `FileReader` → `XLSX.read()` (SheetJS) → raw rows + headers from the first sheet.
2. Validate required headers exist; on failure, `triggerToast(..., "error")` naming the missing column, stop — no modal.
3. Filter to detail rows, group into the per-key records described above (both sides).
4. Compare matched keys, collect mismatches.
5. Open a results modal (same visual shell as `modal-editStock`):
   - Header line: "จับคู่ได้ {N} รายการ, ไม่ตรงกัน {M} รายการ" where N = count of matched keys, M = count of mismatched keys.
   - If M = 0: a plain "ตรวจสอบแล้ว ไม่พบความไม่ตรงกัน" message, no table.
   - If M > 0: a table, one row per mismatched key — columns Pr No. / Mat Code / ชื่อ (SAP → ระบบ) / จำนวน (SAP → ระบบ) / ราคา/หน่วย (SAP → ระบบ), with each differing field's system-side cell visually flagged (e.g. rose text/background), matching fields shown plainly.
   - Close via X button or Escape, same convention as every other modal in this file. Closing discards the result — nothing persisted, re-running requires picking the file again.

**Errors:**
- Corrupt/non-xlsx file → `XLSX.read()` throws → caught, toast "ไฟล์ไม่ถูกต้องหรืออ่านไม่ได้ กรุณาตรวจสอบไฟล์อีกครั้ง", no modal.
- Missing required column(s) → toast naming which column, no modal.
- Valid file but zero matched keys at all (e.g. wrong file entirely, or no overlapping Pr No.s) → modal still opens, shows "จับคู่ได้ 0 รายการ" plus the M=0 message, so the user gets feedback rather than silence.

## Testing

No test framework in this project (matches all prior specs). Manual verification: upload `template/ME5A.XLSX` itself and confirm the modal opens with a real matched/mismatch count against current live data; temporarily edit one qty or price cell in the live sheet, re-run, confirm that specific row now appears as a mismatch with the right field flagged; rename a required SAP header in a copy of the template and confirm the missing-column error fires instead of a silent wrong result.
