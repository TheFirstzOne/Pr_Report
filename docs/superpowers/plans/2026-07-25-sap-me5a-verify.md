# SAP ME5A Order Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user upload a raw SAP ME5A `.xlsx` export into the "รายการคำสั่งซื้อ" (Orders) tab and see, in a popup, every Pr No.+Mat Code line item where SAP's name/qty/price disagrees with what the app has recorded.

**Architecture:** Fully client-side addition to `index.html`. One new CDN dependency (SheetJS, to parse the binary `.xlsx` in-browser) plus new HTML (button, hidden file input, results modal) and new JS (parse → group/dedupe → compare → render). No `Code.gs` changes, no writes, nothing persisted — every run is a fresh, throwaway comparison against whatever `purchaseOrders` is already holding in memory.

**Tech Stack:** Vanilla JS, Tailwind CDN (existing), SheetJS `xlsx@0.18.5` (new CDN addition).

## Global Constraints

- No `Code.gs` changes — this is a pure client-side read/compare/display feature (per spec's Scope section).
- One new dependency only: SheetJS, pinned to `xlsx@0.18.5` — never `@latest`, matching how `lucide@1.25.0` is already pinned in this file (`CLAUDE.md`: "pinned, don't bump to @latest").
- SAP column lookup by header name (`headers.indexOf(...)`), never fixed position — matches every existing `csvToX_` transform in this file.
- Required SAP columns (`Purchase Requisition`, `Material`, `Short Text`, `Quantity requested`, `Valuation Price`) must all be present or the upload is rejected with a named error — this is a hard requirement, not an optional-field fallback.
- Matching key: `prNo + '|' + matCode`, only keys present on both sides are compared (per spec — orphans are silently skipped, not reported).
- Name comparison is exact/case-sensitive; qty comparison is exact numeric; price comparison uses a ±0.01 tolerance (per spec's Comparison rules section).
- No test framework in this project — every task ends with a manual browser/console verification, matching all prior specs and plans in `docs/superpowers/`.
- New modal follows the exact existing modal convention in this file: `fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center hidden p-4 transition-opacity duration-300` shell, closable via an X button and via Escape (see `modal-editStock`).
- Thai UI copy only, matching the existing tab's tone.

---

### Task 1: Add SheetJS CDN dependency

**Files:**
- Modify: `index.html:12-13`

**Interfaces:**
- Produces: global `XLSX` object (SheetJS), consumed by Task 4/5's parsing code.

- [ ] **Step 1: Add the CDN script tag**

Find:
```html
    <!-- Chart.js CDN for Analytics Graphs -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
```

Replace with:
```html
    <!-- Chart.js CDN for Analytics Graphs -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <!-- Pinned SheetJS for parsing SAP ME5A .xlsx exports client-side -->
    <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
```

- [ ] **Step 2: Manual verify**

Serve `index.html` (`python -m http.server`, never `file://`), open the browser console, run `typeof XLSX`. Confirm it prints `"object"`, not `"undefined"`.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add pinned SheetJS dependency for SAP xlsx parsing"
```

---

### Task 2: Orders tab — upload button + hidden file input

**Files:**
- Modify: `index.html:444-449` (Orders tab table header)

**Interfaces:**
- Produces: `<input id="sap-verify-file-input">` and its `onchange="handleSapVerifyFile(event)"` wiring, consumed by Task 5. Button calls `triggerSapVerifyUpload()`, also produced by Task 5.

- [ ] **Step 1: Add the button and hidden file input**

Find:
```html
                <!-- Purchase Orders Table -->
                <div class="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
                    <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <div>
                            <h3 class="font-bold text-base text-slate-800">บันทึกประวัติการสั่งซื้ออะไหล่ (PO)</h3>
                            <p class="text-xs text-slate-500 mt-1">ประวัติใบสั่งซื้อที่ผ่านการอนุมัติและรอตรวจรับพัสดุ</p>
                        </div>
                    </div>
```

Replace with:
```html
                <!-- Purchase Orders Table -->
                <div class="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
                    <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <div>
                            <h3 class="font-bold text-base text-slate-800">บันทึกประวัติการสั่งซื้ออะไหล่ (PO)</h3>
                            <p class="text-xs text-slate-500 mt-1">ประวัติใบสั่งซื้อที่ผ่านการอนุมัติและรอตรวจรับพัสดุ</p>
                        </div>
                        <div>
                            <input type="file" id="sap-verify-file-input" accept=".xlsx" class="hidden" onchange="handleSapVerifyFile(event)">
                            <button type="button" onclick="triggerSapVerifyUpload()" class="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-1.5">
                                <i data-lucide="upload" class="w-4 h-4"></i>
                                <span>ตรวจสอบกับ SAP (ME5A)</span>
                            </button>
                        </div>
                    </div>
```

- [ ] **Step 2: Manual verify**

Reload the app, go to the Orders tab. Confirm the "ตรวจสอบกับ SAP (ME5A)" button renders next to the table title, and clicking it does nothing yet (its handler doesn't exist until Task 5) — that's expected at this point in the plan.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add SAP verify upload button to Orders tab"
```

---

### Task 3: SAP verify results modal (HTML)

**Files:**
- Modify: `index.html:899-919` (insert new modal immediately after `modal-confirmLowStock`)

**Interfaces:**
- Produces: `modal-sapVerifyResults` DOM structure with ids `sap-verify-summary`, `sap-verify-empty-message`, `sap-verify-table-wrapper`, `sap-verify-results-body` — all populated by Task 5's `renderSapVerifyResults_`.

- [ ] **Step 1: Insert the modal**

Find (the end of `modal-confirmLowStock`, right before the JS engine's opening comment):
```html
            <div class="bg-slate-50 px-6 py-4 flex justify-end space-x-3">
                <button type="button" id="confirm-lowstock-cancel" class="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold transition-colors">ยกเลิก</button>
                <button type="button" id="confirm-lowstock-ok" class="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors">ยืนยันปรับลด</button>
            </div>
        </div>
    </div>



    <!-- ==================== JAVASCRIPT SYSTEM ENGINE ==================== -->
```

Replace with:
```html
            <div class="bg-slate-50 px-6 py-4 flex justify-end space-x-3">
                <button type="button" id="confirm-lowstock-cancel" class="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold transition-colors">ยกเลิก</button>
                <button type="button" id="confirm-lowstock-ok" class="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors">ยืนยันปรับลด</button>
            </div>
        </div>
    </div>

    <!-- MODAL: SAP ME5A VERIFY RESULTS -->
    <div id="modal-sapVerifyResults" class="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center hidden p-4 transition-opacity duration-300">
        <div class="bg-white rounded-xl max-w-4xl w-full overflow-hidden shadow-2xl transform transition-[transform,opacity] duration-300 border border-slate-100 max-h-[85vh] flex flex-col">
            <div class="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
                <div>
                    <h4 class="font-bold text-slate-800 text-base">ผลตรวจสอบกับ SAP (ME5A)</h4>
                    <p class="text-xs text-slate-500 mt-1" id="sap-verify-summary"></p>
                </div>
                <button type="button" onclick="closeSapVerifyModal()" class="text-slate-400 hover:text-slate-600 transition-colors w-11 h-11 flex items-center justify-center rounded-lg hover:bg-slate-50 -mr-2">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>
            <div class="p-6 overflow-y-auto flex-1">
                <p id="sap-verify-empty-message" class="hidden text-sm text-emerald-700 font-semibold bg-emerald-50 border border-emerald-100 rounded-lg p-4">ตรวจสอบแล้ว ไม่พบความไม่ตรงกัน</p>
                <div id="sap-verify-table-wrapper" class="hidden overflow-x-auto border border-slate-100 rounded-lg">
                    <table class="w-full text-left text-sm">
                        <thead class="bg-slate-50 text-slate-700 uppercase font-semibold text-xs border-b border-slate-100">
                            <tr>
                                <th class="px-4 py-3">Pr No.</th>
                                <th class="px-4 py-3">Mat Code</th>
                                <th class="px-4 py-3">ชื่อ (SAP &rarr; ระบบ)</th>
                                <th class="px-4 py-3 text-center">จำนวน (SAP &rarr; ระบบ)</th>
                                <th class="px-4 py-3 text-right">ราคา/หน่วย (SAP &rarr; ระบบ)</th>
                            </tr>
                        </thead>
                        <tbody id="sap-verify-results-body">
                            <!-- Dynamic Content -->
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="bg-slate-50 px-6 py-4 flex justify-end border-t border-slate-100">
                <button type="button" onclick="closeSapVerifyModal()" class="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors">ปิด</button>
            </div>
        </div>
    </div>


    <!-- ==================== JAVASCRIPT SYSTEM ENGINE ==================== -->
```

- [ ] **Step 2: Manual verify**

Reload the app. In the browser console, run `document.getElementById('modal-sapVerifyResults').classList.remove('hidden')`. Confirm the modal renders correctly (title, empty-state message visible by default since `sap-verify-empty-message` isn't hidden by class alone — this is expected, Task 5 controls visibility at runtime). Run `.classList.add('hidden')` afterward, or click the "ปิด" button (it should hide the modal even though `closeSapVerifyModal` doesn't exist yet — actually it WILL throw a console error at this point in the plan since Task 5 hasn't landed; that's expected, just re-hide via the console command instead).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add SAP verify results modal markup"
```

---

### Task 4: Parsing, grouping, and comparison logic

**Files:**
- Modify: `index.html` (new functions inserted after `renderOrdersTable`, `index.html:1968-1969`)

**Interfaces:**
- Consumes: global `XLSX` (Task 1), global `purchaseOrders` array with `{prNo, matCode, itemName, qty, unitPrice}` shape (existing, `csvToOrders_`).
- Produces: `parseSapExport_(workbook)` → `Array<{prNo, matCode, name, qty, unitPrice}>` (throws `Error` on missing required columns or empty sheet). `groupByPrMat_(rows, getPrNo, getMatCode, getName, getQty, getUnitPrice)` → `{[key: string]: {prNo, matCode, name, qty, totalValue, unitPrice}}`. `compareSapWithOrders_(sapRows, orders)` → `{matchedCount: number, mismatches: Array<{prNo, matCode, sapName, systemName, nameMismatch, sapQty, systemQty, qtyMismatch, sapPrice, systemPrice, priceMismatch}>}`. All consumed by Task 5.

- [ ] **Step 1: Add the three functions**

Find (`index.html:1968-1970`):
```javascript
        }

        function setRfqVerifyFilter(value) {
```

Replace with:
```javascript
        }

        // Parses a SheetJS workbook produced from a raw SAP ME5A .xlsx export into
        // a flat array of requisition-line rows. Throws if a required column is
        // missing — this is a hard requirement, not an optional-field fallback,
        // because the whole point of the upload is to compare these exact fields.
        function parseSapExport_(workbook) {
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
            if (rows.length === 0) {
                throw new Error("ไฟล์ไม่มีข้อมูล");
            }

            const headers = rows[0].map(function (h) { return String(h).trim(); });
            const prIdx = headers.indexOf('Purchase Requisition');
            const matIdx = headers.indexOf('Material');
            const nameIdx = headers.indexOf('Short Text');
            const qtyIdx = headers.indexOf('Quantity requested');
            const priceIdx = headers.indexOf('Valuation Price');

            const required = [
                ['Purchase Requisition', prIdx],
                ['Material', matIdx],
                ['Short Text', nameIdx],
                ['Quantity requested', qtyIdx],
                ['Valuation Price', priceIdx]
            ];
            const missing = required
                .filter(function (pair) { return pair[1] === -1; })
                .map(function (pair) { return pair[0]; });
            if (missing.length > 0) {
                throw new Error("ไฟล์ SAP ขาดคอลัมน์: " + missing.join(", "));
            }

            // SAP's export puts a blank "summary" row (PR number + total only)
            // before each PR's real detail row(s) — Material is empty on those,
            // same filter trick csvToOrders_/csvToRequests_ already use.
            return rows.slice(1)
                .filter(function (row) { return row[matIdx]; })
                .map(function (row) {
                    return {
                        prNo: String(row[prIdx] || '').trim(),
                        matCode: String(row[matIdx] || '').trim(),
                        name: String(row[nameIdx] || '').trim(),
                        qty: Number(row[qtyIdx]) || 0,
                        unitPrice: Number(row[priceIdx]) || 0
                    };
                });
        }

        // Groups arbitrary rows (SAP rows or app order rows) by prNo+matCode,
        // summing qty/value across duplicates rather than picking one — a real
        // but rare case (checked live data: 7 of 1209 pairs have >1 row) where a
        // requisition line was split across multiple POs/deliveries. Works
        // identically whether a key has 1 row or several.
        function groupByPrMat_(rows, getPrNo, getMatCode, getName, getQty, getUnitPrice) {
            const map = {};
            rows.forEach(function (row) {
                const prNo = getPrNo(row);
                const matCode = getMatCode(row);
                if (!prNo || !matCode) return;
                const key = prNo + '|' + matCode;
                const qty = getQty(row);
                const totalValue = qty * getUnitPrice(row);
                if (!map[key]) {
                    map[key] = { prNo: prNo, matCode: matCode, name: getName(row), qty: 0, totalValue: 0 };
                }
                map[key].qty += qty;
                map[key].totalValue += totalValue;
            });
            Object.keys(map).forEach(function (key) {
                const entry = map[key];
                entry.unitPrice = entry.qty !== 0 ? entry.totalValue / entry.qty : 0;
            });
            return map;
        }

        // Compares SAP rows against the app's own order rows. Only Pr No.+Mat
        // Code keys present on BOTH sides are checked — a key found in only one
        // side is intentionally skipped, not reported (explicit scope choice,
        // see docs/superpowers/specs/2026-07-25-sap-me5a-verify-design.md).
        function compareSapWithOrders_(sapRows, orders) {
            const sapMap = groupByPrMat_(
                sapRows,
                function (r) { return r.prNo; },
                function (r) { return r.matCode; },
                function (r) { return r.name; },
                function (r) { return r.qty; },
                function (r) { return r.unitPrice; }
            );
            const systemMap = groupByPrMat_(
                orders,
                function (o) { return o.prNo; },
                function (o) { return o.matCode; },
                function (o) { return o.itemName; },
                function (o) { return o.qty; },
                function (o) { return o.unitPrice; }
            );

            let matchedCount = 0;
            const mismatches = [];

            Object.keys(sapMap).forEach(function (key) {
                const systemEntry = systemMap[key];
                if (!systemEntry) return;
                matchedCount++;

                const sapEntry = sapMap[key];
                const nameMismatch = sapEntry.name !== systemEntry.name;
                const qtyMismatch = sapEntry.qty !== systemEntry.qty;
                const priceMismatch = Math.abs(sapEntry.unitPrice - systemEntry.unitPrice) > 0.01;

                if (nameMismatch || qtyMismatch || priceMismatch) {
                    mismatches.push({
                        prNo: sapEntry.prNo,
                        matCode: sapEntry.matCode,
                        sapName: sapEntry.name,
                        systemName: systemEntry.name,
                        nameMismatch: nameMismatch,
                        sapQty: sapEntry.qty,
                        systemQty: systemEntry.qty,
                        qtyMismatch: qtyMismatch,
                        sapPrice: sapEntry.unitPrice,
                        systemPrice: systemEntry.unitPrice,
                        priceMismatch: priceMismatch
                    });
                }
            });

            return { matchedCount: matchedCount, mismatches: mismatches };
        }

        function setRfqVerifyFilter(value) {
```

- [ ] **Step 2: Manual verify**

Reload the app, open the browser console, and paste:
```javascript
const sap = [
    { prNo: "PR1", matCode: "M1", name: "Bolt", qty: 10, unitPrice: 5 },
    { prNo: "PR2", matCode: "M2", name: "Nut", qty: 3, unitPrice: 2 }
];
const system = [
    { prNo: "PR1", matCode: "M1", itemName: "Bolt", qty: 8, unitPrice: 5 },
    { prNo: "PR2", matCode: "M2", itemName: "Nut", qty: 3, unitPrice: 2 },
    { prNo: "PR3", matCode: "M3", itemName: "Washer", qty: 1, unitPrice: 1 }
];
console.log(compareSapWithOrders_(sap, system));
```
Confirm the result is `{matchedCount: 2, mismatches: [{prNo: "PR1", matCode: "M1", ..., qtyMismatch: true, ...}]}` — PR1/M1 flagged for qty (10 vs 8), PR2/M2 not flagged (identical), PR3 (system-only) correctly excluded from both matchedCount and mismatches.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add SAP export parsing and comparison logic"
```

---

### Task 5: Wire upload → parse → compare → modal render

**Files:**
- Modify: `index.html` (new functions inserted after Task 4's functions, before `setRfqVerifyFilter`)

**Interfaces:**
- Consumes: `parseSapExport_`, `compareSapWithOrders_` (Task 4), `purchaseOrders` (existing global), `triggerToast` (existing, `index.html:1759`), `sap-verify-file-input` (Task 2), `modal-sapVerifyResults` + its child ids (Task 3).
- Produces: `triggerSapVerifyUpload()`, `handleSapVerifyFile(event)`, `renderSapVerifyResults_(result)`, `closeSapVerifyModal()`, `sapVerifyEscHandler(e)` — referenced by Task 2's button/input `onclick`/`onchange` and Task 3's modal buttons.

- [ ] **Step 1: Add the wiring functions**

Insert immediately after Task 4's `compareSapWithOrders_` function, still before `function setRfqVerifyFilter(value) {`:

```javascript
        function triggerSapVerifyUpload() {
            document.getElementById("sap-verify-file-input").click();
        }

        function handleSapVerifyFile(event) {
            const file = event.target.files[0];
            event.target.value = "";
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function (e) {
                let workbook;
                try {
                    const data = new Uint8Array(e.target.result);
                    workbook = XLSX.read(data, { type: "array" });
                } catch (err) {
                    console.error(err);
                    triggerToast("ไฟล์ไม่ถูกต้องหรืออ่านไม่ได้ กรุณาตรวจสอบไฟล์อีกครั้ง", "error");
                    return;
                }

                let sapRows;
                try {
                    sapRows = parseSapExport_(workbook);
                } catch (err) {
                    console.error(err);
                    triggerToast(err.message, "error");
                    return;
                }

                const result = compareSapWithOrders_(sapRows, purchaseOrders);
                renderSapVerifyResults_(result);
            };
            reader.onerror = function () {
                triggerToast("ไฟล์ไม่ถูกต้องหรืออ่านไม่ได้ กรุณาตรวจสอบไฟล์อีกครั้ง", "error");
            };
            reader.readAsArrayBuffer(file);
        }

        function renderSapVerifyResults_(result) {
            document.getElementById("sap-verify-summary").innerText =
                "จับคู่ได้ " + result.matchedCount + " รายการ, ไม่ตรงกัน " + result.mismatches.length + " รายการ";

            const tbody = document.getElementById("sap-verify-results-body");
            const wrapper = document.getElementById("sap-verify-table-wrapper");
            const emptyMsg = document.getElementById("sap-verify-empty-message");

            if (result.mismatches.length === 0) {
                wrapper.classList.add("hidden");
                emptyMsg.classList.remove("hidden");
            } else {
                emptyMsg.classList.add("hidden");
                wrapper.classList.remove("hidden");
                tbody.innerHTML = result.mismatches.map(function (m) {
                    const nameCellClass = m.nameMismatch ? "text-rose-700 font-bold bg-rose-50" : "text-slate-600";
                    const qtyCellClass = m.qtyMismatch ? "text-rose-700 font-bold bg-rose-50" : "text-slate-600";
                    const priceCellClass = m.priceMismatch ? "text-rose-700 font-bold bg-rose-50" : "text-slate-600";
                    return `
                        <tr class="border-b border-slate-100">
                            <td class="px-4 py-3 font-semibold text-slate-800">${m.prNo}</td>
                            <td class="px-4 py-3 text-xs font-semibold text-slate-600">${m.matCode}</td>
                            <td class="px-4 py-3 text-xs ${nameCellClass}">${m.sapName} &rarr; ${m.systemName}</td>
                            <td class="px-4 py-3 text-center text-xs ${qtyCellClass}">${m.sapQty} &rarr; ${m.systemQty}</td>
                            <td class="px-4 py-3 text-right text-xs ${priceCellClass}">${m.sapPrice.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})} &rarr; ${m.systemPrice.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        </tr>
                    `;
                }).join("");
            }

            document.getElementById("modal-sapVerifyResults").classList.remove("hidden");
            window.addEventListener("keydown", sapVerifyEscHandler);
        }

        function closeSapVerifyModal() {
            document.getElementById("modal-sapVerifyResults").classList.add("hidden");
            window.removeEventListener("keydown", sapVerifyEscHandler);
        }

        function sapVerifyEscHandler(e) {
            if (e.key === "Escape") closeSapVerifyModal();
        }

```

- [ ] **Step 2: Manual verify — end-to-end with the real template file**

Reload the app, go to the Orders tab, click "ตรวจสอบกับ SAP (ME5A)", pick `template/ME5A.XLSX`. Confirm:
- The modal opens with a real "จับคู่ได้ N รายการ, ไม่ตรงกัน M รายการ" line (N/M depend on how many of the template's Pr No.s currently exist in the live PR sheet — likely low/zero overlap since the template is sample data, which is fine, just confirms the pipeline runs without errors).
- Press Escape — modal closes.
- Re-open the file picker and select a non-xlsx file (e.g. rename any `.txt` to try, or pick a `.png`) — confirm a toast error appears and no modal opens.
- As a positive-overlap check: open a copy of `template/ME5A.XLSX`, change one `Quantity requested` cell to a different number for a Pr No./Material combination that also exists in the live PR sheet (cross-check via the Orders tab's search), re-upload, confirm that row now appears in the mismatch table with the qty column highlighted.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: wire SAP ME5A upload to parse, compare, and render results"
```

---

## Self-Review Notes

- **Spec coverage:** SAP file shape/required columns → Task 4. Matching key & duplicate handling → Task 4 (`groupByPrMat_`). Comparison rules → Task 4 (`compareSapWithOrders_`). UI (button, modal, error toasts) → Tasks 2, 3, 5. Every spec section has a task.
- **Type/name consistency checked:** `parseSapExport_` produces `{prNo, matCode, name, qty, unitPrice}`; `groupByPrMat_` is generic over accessor functions so it's reused identically for both SAP rows and `purchaseOrders` (which use `itemName`, not `name` — handled via the `getName` accessor, not a field-name assumption); `compareSapWithOrders_`'s output field names (`sapName`/`systemName`/`nameMismatch`/etc.) match exactly what `renderSapVerifyResults_` (Task 5) reads. Modal element ids (`sap-verify-summary`, `sap-verify-empty-message`, `sap-verify-table-wrapper`, `sap-verify-results-body`) are defined once in Task 3 and referenced only in Task 5 — no mismatches.
- **Task ordering:** Task 2's button and Task 3's modal both reference functions (`triggerSapVerifyUpload`, `closeSapVerifyModal`, `handleSapVerifyFile`) that don't exist until Task 5 — each task's manual-verify step calls this out explicitly (clicking the button/close button does nothing or errors until Task 5 lands), matching the same intentional-dangling-reference pattern used in the prior stock-value plan.
