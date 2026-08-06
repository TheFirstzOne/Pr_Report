# PR Status Update from SAP ME5A Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user upload a SAP ME5A `.xlsx` export into the Orders tab and bulk-update `STATUS` (and `PO No.` where applicable) for every PR line item whose `Release indicator` maps to `Pr` or `PO`, after a preview/confirm step.

**Architecture:** Client-side parse/preview in `index.html` (mirrors the existing SAP verify feature's upload → SheetJS parse → modal pattern), plus one new `Code.gs` `doPost` action (`updatePrStatus`) that performs the actual write under a single lock for the whole batch. No optimistic client-side write before confirm — the preview modal itself is the "are you sure" step, so state only changes after the server confirms.

**Tech Stack:** Vanilla JS, Tailwind CDN (existing), SheetJS (already a pinned dependency from the SAP verify feature — no new CDN addition).

## Global Constraints

- Excel column lookup by header name (`headers.indexOf(...)`), never fixed position — matches every existing `csvToX_`/`parseSapExport_` convention.
- Required columns for the new upload: `Purchase Requisition`, `Material`, `Quantity requested`, `Release indicator`. `Purchase order` is read but NOT required (only needed for `Z`-indicator rows, checked per-row).
- Indicator mapping: `X` or `Y` → status `Pr`; `Z` → status `PO` + writes `PO No.` from the row's `Purchase order` value; anything else → row silently excluded, no error.
- Matching key: `prNo + matCode + qty` against the in-memory `purchaseOrders` array — exactly 1 match required, 0 or >1 matches excluded (never guess), matching `receiveOrder_`'s existing ambiguity-refusal convention.
- Rows whose matched order's `normalizedStatus === "RECEIVED"` are excluded from the write — a receive is a one-way door, checked both client-side (preview) and server-side (defense in depth).
- Preview-then-confirm UI: nothing is written until the user clicks "ยืนยัน" in the preview modal; closing the modal (X/Escape) discards everything, matching `modal-sapVerifyResults`'s existing discard-on-close convention.
- `Code.gs` write handlers use string-compared IDs (`String(...)`), matching this file's existing convention (`CLAUDE.md`).
- No test framework in this project — every task ends with a manual browser/console verification, matching all prior specs/plans.
- Thai UI copy only, matching the existing tab's tone.
- Spec: `docs/superpowers/specs/2026-08-06-pr-status-update-design.md`.

---

### Task 1: Orders tab — "Status" upload button + hidden file input

**Files:**
- Modify: `index.html:462-468`

**Interfaces:**
- Produces: `<input id="pr-status-file-input">` with `onchange="handlePrStatusFile(event)"`, consumed by Task 4. Button calls `triggerPrStatusUpload()`, also produced by Task 4.

- [ ] **Step 1: Add the button and hidden file input next to the existing Verify button**

Find:
```html
                        <div>
                            <input type="file" id="sap-verify-file-input" accept=".xlsx" class="hidden" onchange="handleSapVerifyFile(event)">
                            <button type="button" onclick="triggerSapVerifyUpload()" class="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-1.5">
                                <i data-lucide="upload" class="w-4 h-4"></i>
                                <span>Verify</span>
                            </button>
                        </div>
                    </div>
```

Replace with:
```html
                        <div class="flex items-center space-x-2">
                            <input type="file" id="sap-verify-file-input" accept=".xlsx" class="hidden" onchange="handleSapVerifyFile(event)">
                            <button type="button" onclick="triggerSapVerifyUpload()" class="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-1.5">
                                <i data-lucide="upload" class="w-4 h-4"></i>
                                <span>Verify</span>
                            </button>
                            <input type="file" id="pr-status-file-input" accept=".xlsx" class="hidden" onchange="handlePrStatusFile(event)">
                            <button type="button" onclick="triggerPrStatusUpload()" class="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-1.5">
                                <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                                <span>Status</span>
                            </button>
                        </div>
                    </div>
```

- [ ] **Step 2: Manual verify**

Serve `index.html` (`python -m http.server`, never `file://`), go to the Orders tab. Confirm both "Verify" and "Status" buttons render side by side next to the table title. Clicking "Status" does nothing yet (its handler doesn't exist until Task 4) — expected at this point in the plan.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add PR status upload button to Orders tab"
```

---

### Task 2: PR status update preview modal (HTML)

**Files:**
- Modify: `index.html:1016-1019` (insert immediately after `modal-sapVerifyResults`, before the JS engine comment)

**Interfaces:**
- Produces: `modal-prStatusPreview` DOM structure with ids `pr-status-summary`, `pr-status-empty-message`, `pr-status-table-wrapper`, `pr-status-preview-body`, `pr-status-confirm-btn` — all populated/wired by Task 4.

- [ ] **Step 1: Insert the modal**

Find:
```html
            <div class="bg-slate-50 px-6 py-4 flex justify-end border-t border-slate-100">
                <button type="button" onclick="closeSapVerifyModal()" class="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors">ปิด</button>
            </div>
        </div>
    </div>


    <!-- ==================== JAVASCRIPT SYSTEM ENGINE ==================== -->
```

Replace with:
```html
            <div class="bg-slate-50 px-6 py-4 flex justify-end border-t border-slate-100">
                <button type="button" onclick="closeSapVerifyModal()" class="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors">ปิด</button>
            </div>
        </div>
    </div>

    <!-- MODAL: PR STATUS UPDATE PREVIEW -->
    <div id="modal-prStatusPreview" class="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center hidden p-4 transition-opacity duration-300">
        <div class="bg-white rounded-xl max-w-4xl w-full overflow-hidden shadow-2xl transform transition-[transform,opacity] duration-300 border border-slate-100 max-h-[85vh] flex flex-col">
            <div class="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
                <div>
                    <h4 class="font-bold text-slate-800 text-base">ตัวอย่างการอัปเดตสถานะ PR</h4>
                    <p class="text-xs text-slate-500 mt-1" id="pr-status-summary"></p>
                </div>
                <button type="button" onclick="closePrStatusModal()" class="text-slate-400 hover:text-slate-600 transition-colors w-11 h-11 flex items-center justify-center rounded-lg hover:bg-slate-50 -mr-2">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>
            <div class="p-6 overflow-y-auto flex-1">
                <p id="pr-status-empty-message" class="hidden text-sm text-slate-600 font-semibold bg-slate-50 border border-slate-100 rounded-lg p-4">ไม่มีรายการที่ต้องอัปเดต</p>
                <div id="pr-status-table-wrapper" class="hidden overflow-x-auto border border-slate-100 rounded-lg">
                    <table class="w-full text-left text-sm">
                        <thead class="bg-slate-50 text-slate-700 uppercase font-semibold text-xs border-b border-slate-100">
                            <tr>
                                <th class="px-4 py-3">Pr No.</th>
                                <th class="px-4 py-3">Mat Code</th>
                                <th class="px-4 py-3">ชื่อ</th>
                                <th class="px-4 py-3 text-center">สถานะเดิม &rarr; สถานะใหม่</th>
                                <th class="px-4 py-3">PO No.</th>
                            </tr>
                        </thead>
                        <tbody id="pr-status-preview-body">
                            <!-- Dynamic Content -->
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="bg-slate-50 px-6 py-4 flex justify-end space-x-3 border-t border-slate-100">
                <button type="button" onclick="closePrStatusModal()" class="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors">ยกเลิก</button>
                <button type="button" id="pr-status-confirm-btn" onclick="confirmPrStatusUpdate()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors">ยืนยัน</button>
            </div>
        </div>
    </div>


    <!-- ==================== JAVASCRIPT SYSTEM ENGINE ==================== -->
```

- [ ] **Step 2: Manual verify**

Reload the app. In the browser console, run `document.getElementById('modal-prStatusPreview').classList.remove('hidden')`. Confirm the modal renders (title, table headers, footer buttons). Run `.classList.add('hidden')` afterward — clicking "ยกเลิก"/the X will throw a console error at this point since `closePrStatusModal` doesn't exist until Task 4; that's expected, use the console command instead.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add PR status update preview modal markup"
```

---

### Task 3: Excel parsing and status-change matching logic

**Files:**
- Modify: `index.html` (new functions inserted immediately before `function setRfqVerifyFilter(value) {`, `index.html:2284`)

**Interfaces:**
- Consumes: global `XLSX` (existing), global `purchaseOrders` array with `{prNo, matCode, qty, status, itemName, normalizedStatus, ...}` shape (existing, `csvToOrders_` + `applyLoadedData`).
- Produces: `parsePrStatusExport_(workbook)` → `Array<{prNo, matCode, qty, indicator, poNo}>` (throws `Error` on missing required columns or empty sheet). `mapIndicatorToStatus_(indicator)` → `"Pr"` | `"PO"` | `null`. `buildPrStatusChanges_(exportRows, orders)` → `{pending: Array<{prNo, matCode, qty, itemName, oldStatus, newStatus, poNo}>, excludedCount: number}`. All consumed by Task 4.

- [ ] **Step 1: Add the three functions**

Find (`index.html:2280-2284`):
```javascript
        function sapVerifyEscHandler(e) {
            if (e.key === "Escape") closeSapVerifyModal();
        }

        function setRfqVerifyFilter(value) {
```

Replace with:
```javascript
        function sapVerifyEscHandler(e) {
            if (e.key === "Escape") closeSapVerifyModal();
        }

        // Parses the SAP ME5A export for the "Status" upload — a superset of
        // parseSapExport_'s columns (same file type, different fields read).
        // Purchase order is deliberately NOT in the required list: it's only
        // needed for Z-indicator rows and is checked per-row in
        // buildPrStatusChanges_ instead, since requiring it here would reject
        // valid files whose only Z rows already have it and whose other rows
        // legitimately don't need it.
        function parsePrStatusExport_(workbook) {
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
            if (rows.length === 0) {
                throw new Error("ไฟล์ไม่มีข้อมูล");
            }

            const headers = rows[0].map(function (h) { return String(h).trim(); });
            const prIdx = headers.indexOf('Purchase Requisition');
            const matIdx = headers.indexOf('Material');
            const qtyIdx = headers.indexOf('Quantity requested');
            const indicatorIdx = headers.indexOf('Release indicator');
            const poIdx = headers.indexOf('Purchase order');

            const required = [
                ['Purchase Requisition', prIdx],
                ['Material', matIdx],
                ['Quantity requested', qtyIdx],
                ['Release indicator', indicatorIdx]
            ];
            const missing = required
                .filter(function (pair) { return pair[1] === -1; })
                .map(function (pair) { return pair[0]; });
            if (missing.length > 0) {
                throw new Error("ไฟล์ SAP ขาดคอลัมน์: " + missing.join(", "));
            }

            // Same blank-summary-row filter as parseSapExport_: Material is
            // empty on SAP's per-PR summary rows.
            return rows.slice(1)
                .filter(function (row) { return row[matIdx]; })
                .map(function (row) {
                    return {
                        prNo: String(row[prIdx] || '').trim(),
                        matCode: String(row[matIdx] || '').trim(),
                        qty: Number(row[qtyIdx]) || 0,
                        indicator: String(row[indicatorIdx] || '').trim().toUpperCase(),
                        poNo: poIdx !== -1 ? String(row[poIdx] || '').trim() : ''
                    };
                });
        }

        // X/Y both mean "still at PR stage" per the issue's mapping; Z means
        // it has progressed to a PO. Anything else (blank, unrecognized) maps
        // to null, which buildPrStatusChanges_ treats as "not actionable" —
        // not an error, this file legitimately contains many such rows.
        function mapIndicatorToStatus_(indicator) {
            if (indicator === 'X' || indicator === 'Y') return 'Pr';
            if (indicator === 'Z') return 'PO';
            return null;
        }

        // Matches each actionable export row (mapIndicatorToStatus_ !== null)
        // against purchaseOrders by prNo+matCode+qty — the same composite key
        // receiveOrder_ already uses server-side to disambiguate the PR
        // sheet's known duplicate-row cases. 0 or >1 matches, or a match whose
        // normalizedStatus is already RECEIVED (a receive is a one-way door),
        // are excluded rather than guessed at.
        function buildPrStatusChanges_(exportRows, orders) {
            const pending = [];
            let excludedCount = 0;

            exportRows.forEach(function (row) {
                const newStatus = mapIndicatorToStatus_(row.indicator);
                if (!newStatus) return;

                const matches = orders.filter(function (o) {
                    return o.prNo === row.prNo && o.matCode === row.matCode && o.qty === row.qty;
                });
                if (matches.length !== 1) {
                    excludedCount++;
                    return;
                }

                const order = matches[0];
                if (order.normalizedStatus === 'RECEIVED') {
                    excludedCount++;
                    return;
                }

                pending.push({
                    prNo: row.prNo,
                    matCode: row.matCode,
                    qty: row.qty,
                    itemName: order.itemName,
                    oldStatus: order.status,
                    newStatus: newStatus,
                    poNo: newStatus === 'PO' ? row.poNo : ''
                });
            });

            return { pending: pending, excludedCount: excludedCount };
        }

        function setRfqVerifyFilter(value) {
```

- [ ] **Step 2: Manual verify**

Reload the app, open the browser console, and paste:
```javascript
const exportRows = [
    { prNo: "PR1", matCode: "M1", qty: 10, indicator: "Y", poNo: "" },
    { prNo: "PR2", matCode: "M2", qty: 3, indicator: "Z", poNo: "PO999" },
    { prNo: "PR3", matCode: "M3", qty: 1, indicator: "Z", poNo: "PO888" },
    { prNo: "PR4", matCode: "M4", qty: 5, indicator: "Q", poNo: "" }
];
const orders = [
    { prNo: "PR1", matCode: "M1", qty: 10, status: "Pending", itemName: "Bolt", normalizedStatus: "PENDING" },
    { prNo: "PR2", matCode: "M2", qty: 3, status: "Pr", itemName: "Nut", normalizedStatus: "PR_APPROVAL" },
    { prNo: "PR3", matCode: "M3", qty: 1, status: "RECEIVED", itemName: "Washer", normalizedStatus: "RECEIVED" }
];
console.log(buildPrStatusChanges_(exportRows, orders));
```
Confirm the result is `{pending: [{prNo: "PR1", ..., newStatus: "Pr", poNo: ""}, {prNo: "PR2", ..., newStatus: "PO", poNo: "PO999"}], excludedCount: 2}` — PR1 mapped to Pr, PR2 mapped to PO with its PO number carried through, PR3 excluded (already RECEIVED), PR4 excluded (indicator "Q" not in orders AND unrecognized — confirm it's excluded via the `!newStatus` early return, not counted in excludedCount, i.e. total pending+excludedCount here is 2, not 3).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add PR status export parsing and matching logic"
```

---

### Task 4: Wire upload → parse → preview → confirm → write → reconcile

**Files:**
- Modify: `index.html` (new functions inserted immediately after Task 3's `buildPrStatusChanges_`, before `function setRfqVerifyFilter(value) {`)

**Interfaces:**
- Consumes: `parsePrStatusExport_`, `buildPrStatusChanges_` (Task 3), `purchaseOrders`/`normalizeOrderStatus` (existing), `triggerToast` (existing, `index.html:1861`), `pr-status-file-input` (Task 1), `modal-prStatusPreview` + its child ids (Task 2), `EXEC_URL` (existing, `index.html:1035`).
- Produces: `triggerPrStatusUpload()`, `handlePrStatusFile(event)`, `renderPrStatusPreview_(result)`, `closePrStatusModal()`, `prStatusEscHandler(e)`, `confirmPrStatusUpdate()` — referenced by Task 1's button/input and Task 2's modal buttons.

- [ ] **Step 1: Add module-level state for the pending list**

Find (`index.html:1041`):
```javascript
        let purchaseOrders = [];
```

Replace with:
```javascript
        let purchaseOrders = [];
        let prStatusPendingChanges = [];
```

- [ ] **Step 2: Add the wiring functions**

Insert immediately after Task 3's `buildPrStatusChanges_` function, still before `function setRfqVerifyFilter(value) {`:

```javascript
        function triggerPrStatusUpload() {
            document.getElementById("pr-status-file-input").click();
        }

        function handlePrStatusFile(event) {
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

                let exportRows;
                try {
                    exportRows = parsePrStatusExport_(workbook);
                } catch (err) {
                    console.error(err);
                    triggerToast(err.message, "error");
                    return;
                }

                const result = buildPrStatusChanges_(exportRows, purchaseOrders);
                prStatusPendingChanges = result.pending;
                renderPrStatusPreview_(result);
            };
            reader.onerror = function () {
                triggerToast("ไฟล์ไม่ถูกต้องหรืออ่านไม่ได้ กรุณาตรวจสอบไฟล์อีกครั้ง", "error");
            };
            reader.readAsArrayBuffer(file);
        }

        function renderPrStatusPreview_(result) {
            document.getElementById("pr-status-summary").innerText =
                "จะอัปเดต " + result.pending.length + " รายการ, ไม่พบในระบบหรือรับของแล้ว " + result.excludedCount + " รายการ";

            const tbody = document.getElementById("pr-status-preview-body");
            const wrapper = document.getElementById("pr-status-table-wrapper");
            const emptyMsg = document.getElementById("pr-status-empty-message");
            const confirmBtn = document.getElementById("pr-status-confirm-btn");

            if (result.pending.length === 0) {
                wrapper.classList.add("hidden");
                emptyMsg.classList.remove("hidden");
                confirmBtn.disabled = true;
                confirmBtn.classList.add("opacity-50", "pointer-events-none");
            } else {
                emptyMsg.classList.add("hidden");
                wrapper.classList.remove("hidden");
                confirmBtn.disabled = false;
                confirmBtn.classList.remove("opacity-50", "pointer-events-none");
                tbody.innerHTML = result.pending.map(function (c) {
                    return `
                        <tr class="border-b border-slate-100">
                            <td class="px-4 py-3 font-semibold text-slate-800">${c.prNo}</td>
                            <td class="px-4 py-3 text-xs font-semibold text-slate-600">${c.matCode}</td>
                            <td class="px-4 py-3 text-xs text-slate-600">${c.itemName}</td>
                            <td class="px-4 py-3 text-center text-xs font-semibold text-slate-800">${c.oldStatus} &rarr; ${c.newStatus}</td>
                            <td class="px-4 py-3 text-xs text-slate-600">${c.poNo || "-"}</td>
                        </tr>
                    `;
                }).join("");
            }

            document.getElementById("modal-prStatusPreview").classList.remove("hidden");
            window.addEventListener("keydown", prStatusEscHandler);
        }

        function closePrStatusModal() {
            document.getElementById("modal-prStatusPreview").classList.add("hidden");
            window.removeEventListener("keydown", prStatusEscHandler);
            prStatusPendingChanges = [];
        }

        function prStatusEscHandler(e) {
            if (e.key === "Escape") closePrStatusModal();
        }

        function confirmPrStatusUpdate() {
            if (prStatusPendingChanges.length === 0) return;

            const confirmBtn = document.getElementById("pr-status-confirm-btn");
            confirmBtn.disabled = true;
            confirmBtn.innerText = "กำลังบันทึก...";

            fetch(EXEC_URL, {
                method: "POST",
                body: JSON.stringify({
                    action: "updatePrStatus",
                    updates: prStatusPendingChanges
                })
            })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.error) {
                    throw new Error(data.error);
                }
                (data.updated || []).forEach(function (u) {
                    const idx = purchaseOrders.findIndex(function (o) {
                        return o.prNo === u.prNo && o.matCode === u.matCode && o.qty === u.qty;
                    });
                    if (idx !== -1) {
                        purchaseOrders[idx].status = u.status;
                        purchaseOrders[idx].normalizedStatus = normalizeOrderStatus(u.status);
                        if (u.poNo) purchaseOrders[idx].poNo = u.poNo;
                    }
                });
                renderAll();
                triggerToast("อัปเดตสถานะสำเร็จ " + (data.updated || []).length + " รายการ", "success");
                closePrStatusModal();
            })
            .catch(function (err) {
                console.error(err);
                triggerToast("อัปเดตสถานะไม่สำเร็จ กรุณาลองใหม่", "error");
            })
            .finally(function () {
                confirmBtn.disabled = false;
                confirmBtn.innerText = "ยืนยัน";
            });
        }

```

- [ ] **Step 3: Manual verify — end-to-end with a real file**

Reload the app, go to the Orders tab. Make a copy of `template/ME5A.XLSX`, edit one `Y`-indicator row's `Purchase Requisition`/`Material`/`Quantity requested` to match a real live `Pr`/`Pending`-status PR row (cross-check via the Orders tab's search), and edit another `Z`-indicator row similarly with a `Purchase order` value filled in. Click "Status", pick the edited file. Confirm:
- The preview modal opens showing both rows with the right "สถานะเดิม → สถานะใหม่" text, and the Z row's PO No. column populated.
- The summary line's counts are consistent with the file's row count.
- Press Escape — modal closes, `prStatusPendingChanges` empties (confirm via `console.log(prStatusPendingChanges)` — should be `[]`).
- Re-open and click "ยืนยัน" — confirm it POSTs (Network tab shows the request; it will currently return `{error: "Unknown action: updatePrStatus"}` from the live Apps Script since Task 5 hasn't landed/redeployed yet — confirm the error toast appears and the modal stays open, matching the designed failure path). This is expected at this point in the plan.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: wire PR status upload to parse, preview, and confirm-write"
```

---

### Task 5: `Code.gs` — `updatePrStatus` write action

**Files:**
- Modify: `Code.gs:460-461` (new function, inserted between `receiveOrder_` and `GITHUB_REPO`)
- Modify: `Code.gs:520-524` (new `doPost` branch, inserted between `receiveOrder` and `submitFeedback`)

**Interfaces:**
- Consumes: `findRowByColumnValue_` is NOT reused here (it only matches a single column; this needs a 3-column composite match) — implements its own row-scan, same style as `receiveOrder_`'s inline PR-sheet scan.
- Produces: `updatePrStatus_(updates)` → `{success: true, updated: Array<{prNo, matCode, qty, status, poNo}>, skipped: Array<{prNo, matCode, reason}>}`, invoked from `doPost` when `body.action === 'updatePrStatus'`.

- [ ] **Step 1: Add `updatePrStatus_`**

Find (`Code.gs:459-462`):
```javascript
  } finally {
    lock.releaseLock();
  }
}

const GITHUB_REPO = 'TheFirstzOne/Maintenance_System';
```

Replace with:
```javascript
  } finally {
    lock.releaseLock();
  }
}

// Bulk status/PO-number write driven by a client-parsed SAP export upload.
// One lock for the whole batch (not one per row) — this is one logical
// operation (one file upload), not N independent writes. Re-checks each
// row's current STATUS isn't already RECEIVED under the lock even though
// the client already filtered for this client-side, because the export was
// parsed before the confirm click — a receive could have happened in
// between (defense in depth, not redundant).
const RECEIVED_STATUS_VALUES_ = ['RECEIVED', 'ได้รับแล้ว', 'OK', 'SUCCESS'];

function updatePrStatus_(updates) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName('PR');
    if (!sheet) return { error: 'Sheet not found: PR' };
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(function (h) { return String(h).trim(); });

    const prIdx = headers.indexOf('Pr No.');
    const matCodeIdx = headers.indexOf('MAT CODE');
    const qtyIdx = headers.indexOf('QTY.');
    const statusIdx = headers.indexOf('STATUS');
    const poIdx = headers.indexOf('PO No.');

    if (prIdx === -1 || matCodeIdx === -1 || qtyIdx === -1 || statusIdx === -1 || poIdx === -1) {
      return { error: 'Required columns not found in PR sheet' };
    }

    const updated = [];
    const skipped = [];

    updates.forEach(function (update) {
      const matches = [];
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const matchPr = String(row[prIdx] || '') === String(update.prNo || '');
        const matchMat = String(row[matCodeIdx] || '') === String(update.matCode || '');
        const matchQty = Number(row[qtyIdx]) === Number(update.qty);
        if (matchPr && matchMat && matchQty) {
          matches.push(i);
        }
      }

      if (matches.length !== 1) {
        skipped.push({ prNo: update.prNo, matCode: update.matCode, reason: 'not found' });
        return;
      }

      const rowIndex = matches[0];
      const currentStatus = String(data[rowIndex][statusIdx] || '').trim().toUpperCase();
      if (RECEIVED_STATUS_VALUES_.indexOf(currentStatus) !== -1) {
        skipped.push({ prNo: update.prNo, matCode: update.matCode, reason: 'already received' });
        return;
      }

      const sheetRow = rowIndex + 1;
      sheet.getRange(sheetRow, statusIdx + 1).setValue(update.status);
      if (update.status === 'PO' && update.poNo) {
        sheet.getRange(sheetRow, poIdx + 1).setValue(update.poNo);
      }

      updated.push({
        prNo: update.prNo,
        matCode: update.matCode,
        qty: update.qty,
        status: update.status,
        poNo: update.status === 'PO' ? (update.poNo || '') : ''
      });
    });

    return { success: true, updated: updated, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}

const GITHUB_REPO = 'TheFirstzOne/Maintenance_System';
```

- [ ] **Step 2: Wire the `doPost` branch**

Find (`Code.gs:520-524`):
```javascript
    } else if (body.action === 'receiveOrder') {
      if ((!body.poNo && !body.prNo) || !body.matCode || !body.qty) {
        throw new Error('Missing required fields');
      }
      payload = receiveOrder_(body);
```

Replace with:
```javascript
    } else if (body.action === 'receiveOrder') {
      if ((!body.poNo && !body.prNo) || !body.matCode || !body.qty) {
        throw new Error('Missing required fields');
      }
      payload = receiveOrder_(body);
    } else if (body.action === 'updatePrStatus') {
      if (!Array.isArray(body.updates) || body.updates.length === 0) {
        throw new Error('Missing updates array');
      }
      payload = updatePrStatus_(body.updates);
```

- [ ] **Step 3: Manual verify**

This step requires manually pasting the updated `Code.gs` into the Apps Script project bound to the sheet (`SHEET_ID`) and redeploying the existing Web App deployment (`CLAUDE.md`: "Code.gs must be manually pasted/deployed... editing Code.gs here has no effect until it's redeployed by hand" — this is not something `git commit` does). After redeploying:
1. In the Apps Script editor, select `updatePrStatus_` isn't directly runnable without a real payload — instead, retest via the live app: repeat Task 4 Step 3's end-to-end flow (upload the edited copy of `template/ME5A.XLSX`, confirm the preview, click "ยืนยัน").
2. Confirm the live `PR` sheet's `STATUS` (and `PO No.` for the Z-indicator row) actually changed for the two edited rows, and the Orders table reflects the new status without a full page reload.
3. Confirm a repeat upload of the same file now excludes those two rows from the preview (their `normalizedStatus` is no longer eligible per the mapped indicator, or they've reached the target status already — verify whichever applies to your test data).

- [ ] **Step 4: Commit**

```bash
git add Code.gs
git commit -m "feat: add updatePrStatus write action for bulk PR status/PO updates"
```

---

## Self-Review Notes

- **Spec coverage:** Indicator → status mapping → Task 3 (`mapIndicatorToStatus_`). Matching key & RECEIVED guard → Task 3 (`buildPrStatusChanges_`, client) + Task 5 (`updatePrStatus_`, server — defense in depth). UI (button, preview modal, confirm/discard) → Tasks 1, 2, 4. Server write + batch lock → Task 5. Every spec section maps to a task.
- **Type/name consistency checked:** `parsePrStatusExport_` produces `{prNo, matCode, qty, indicator, poNo}`; `buildPrStatusChanges_` consumes exactly those field names and produces `{prNo, matCode, qty, itemName, oldStatus, newStatus, poNo}`, which `renderPrStatusPreview_` (Task 4) reads directly and `confirmPrStatusUpdate` sends as-is in the POST body (server never sees `itemName`/`oldStatus`, only reads `prNo`/`matCode`/`qty`/`status`/`poNo` — checked against `updatePrStatus_`'s destructuring in Task 5, no mismatch). Server response field names (`updated[].prNo/matCode/qty/status/poNo`) match what `confirmPrStatusUpdate`'s `.then()` reads.
- **Task ordering:** Task 1's button and Task 2's modal both reference functions (`triggerPrStatusUpload`, `closePrStatusModal`, `handlePrStatusFile`, `confirmPrStatusUpdate`) that don't exist until Task 4 — each task's manual-verify step calls this out explicitly, matching the same intentional-dangling-reference pattern the SAP verify plan already used. Task 4's confirm flow depends on `Code.gs` (Task 5) being both committed AND manually redeployed — Task 4's own manual-verify step only checks the client-side request/error path (expects a graceful "Unknown action" failure), Task 5's manual-verify step is what confirms the real write.
- **Deployment gap flagged twice on purpose:** once in the spec, once in Task 5 — this is the same gap that already caused the feedback-label feature to silently not work end-to-end (`AUDIT.md`), so it's called out at both the design and the final-task level rather than assumed to be obvious.
