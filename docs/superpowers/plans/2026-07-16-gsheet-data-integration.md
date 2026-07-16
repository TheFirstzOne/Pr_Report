# Wire index.html to Live Google Sheet Data — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the five hardcoded mock arrays in `index.html` with live reads from the Google Sheet (`1oOzyZxcfzzfirdeOKUO1m9S6NjXKFUFgkfhNzNZqtV8`), via a new read-only Apps Script JSON API (`Code.gs`).

**Architecture:** `Code.gs` is a thin Apps Script Web App — `doGet(e)` dispatches on `?action=` and returns JSON built directly from `SpreadsheetApp` reads, no writes. `index.html` stays a static file; its render functions (`renderStockTable`, `renderOrdersTable`, etc.) are unchanged in shape, they just receive real data instead of seed arrays via a new `loadAllData()` fetch. Two tabs (RFQ, Quotation History) get their columns/render functions adjusted first, because their mock shape doesn't match what the real sheet columns can supply — see spec for why.

**Tech Stack:** Google Apps Script (V8 runtime), vanilla JS, `fetch()`, existing Tailwind/Chart.js/Lucide already loaded in `index.html`. No build tooling, no test framework — matches the existing project.

## Global Constraints

- v1 is read-only: no writes back to the sheet. (Spec: Scope)
- Spreadsheet ID: `1oOzyZxcfzzfirdeOKUO1m9S6NjXKFUFgkfhNzNZqtV8`. (Spec: Context)
- Access: Apps Script deployed as "Execute as Me, Anyone with access" — no auth layer. (Spec: Architecture)
- Refresh is manual (page load + a Refresh button) — no polling. (Spec: Architecture)
- Full field-mapping table for all 5 sheets is in the spec (`docs/superpowers/specs/2026-07-16-gsheet-data-integration-design.md`) — treat it as the source of truth for header names.

---

### Task 0: Initialize git

This project has no git repo yet, and every later task ends with a commit — this task makes that possible.

**Files:**
- Create: `.git/` (via `git init`)

- [ ] **Step 1: Initialize the repository**

Run: `git init` (from `c:\Users\Tanarat\Desktop\WORKS\PROJECTS\Stock-Management`)
Expected: `Initialized empty Git repository in .../Stock-Management/.git/`

- [ ] **Step 2: Baseline commit of everything that exists today**

```bash
git add index.html DESIGN.md PRODUCT.md run_detect.py Ref docs
git commit -m "chore: baseline commit before Google Sheet data integration"
```

- [ ] **Step 3: Verify**

Run: `git log --oneline -1`
Expected: one commit, the baseline commit above.

---

### Task 1: Create Code.gs (read-only JSON API)

**Files:**
- Create: `Code.gs`

**Interfaces:**
- Produces: `getStock()`, `getRequests()`, `getQuotes()`, `getBudget()`, `getOrders()` — each returns an array of plain objects (field names below). `doGet(e)` — Apps Script entry point, returns `ContentService` JSON. `testAllSheets()` — manual self-check, run from the Apps Script editor.
- Object shapes (these exact keys are what Task 7's `loadAllData()` assigns straight into `stockParts` / `rfqList` / `quoteHistory` / `projectsBudget` / `purchaseOrders`):
  - Stock: `{ id, name, category, unit, qty, reorder, remark }`
  - Requests: `{ id, date, who, role, part, qty, remark, urgent, status, photoUrl }`
  - Quotes: `{ id, itemName, qty, unit, unitPrice, totalCost, supplier, rfqRef, date }`
  - Budget: `{ no, io, asset, costCenter, desc, budget, used, current }`
  - Orders: `{ date, poNo, prNo, matCode, itemName, qty, unit, unitPrice, totalCost, status, category, vendor }` — `date` is formatted `M/d/yyyy` (no leading zeros) to match the string-parsing already in `calculateMonthlyExpenses()` in `index.html`.

- [ ] **Step 1: Write the file**

```javascript
// Google Apps Script backend for the Stock Management dashboard.
// Read-only JSON API over the spreadsheet's STOCK/requests/QuotationHistory/Budget/PR sheets.

const SHEET_ID = '1oOzyZxcfzzfirdeOKUO1m9S6NjXKFUFgkfhNzNZqtV8';

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'all';
  let payload;

  try {
    if (action === 'stock') {
      payload = { stock: getStock() };
    } else if (action === 'requests') {
      payload = { requests: getRequests() };
    } else if (action === 'quotes') {
      payload = { quotes: getQuotes() };
    } else if (action === 'budget') {
      payload = { budget: getBudget() };
    } else if (action === 'orders') {
      payload = { orders: getOrders() };
    } else if (action === 'all') {
      payload = {
        stock: getStock(),
        requests: getRequests(),
        quotes: getQuotes(),
        budget: getBudget(),
        orders: getOrders()
      };
    } else {
      payload = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    payload = { error: err.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

// Reads a sheet's header row (trimmed) and data rows.
function getSheetRows_(sheetName) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Sheet not found: ' + sheetName);
  }
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(function (h) { return String(h).trim(); });
  return { headers: headers, rows: data.slice(1) };
}

function parseMoney_(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  return parseFloat(String(val).replace(/,/g, '')) || 0;
}

function formatDate_(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'M/d/yyyy');
  }
  return String(val || '');
}

function getStock() {
  const sheetData = getSheetRows_('STOCK');
  const headers = sheetData.headers;
  const rows = sheetData.rows;
  const catIdx = headers.indexOf('CATEGORY');
  const descIdx = headers.indexOf('DESCRIPTION');
  const qtyIdx = headers.indexOf('Qty.');
  const unitIdx = headers.indexOf('Unit');
  const reorderIdx = headers.indexOf('safety factor');
  const remarkIdx = headers.indexOf('Remark');
  const matCodeIdx = 1; // source sheet leaves this column's header blank

  return rows
    .filter(function (row) { return row[descIdx]; })
    .map(function (row) {
      return {
        id: String(row[matCodeIdx] || ''),
        name: String(row[descIdx] || ''),
        category: String(row[catIdx] || ''),
        unit: String(row[unitIdx] || ''),
        qty: Number(row[qtyIdx]) || 0,
        reorder: Number(row[reorderIdx]) || 0,
        remark: String(row[remarkIdx] || '')
      };
    });
}

function getRequests() {
  const sheetData = getSheetRows_('requests');
  const headers = sheetData.headers;
  const rows = sheetData.rows;
  const idIdx = headers.indexOf('req_id');
  const dateIdx = headers.indexOf('created_at');
  const whoIdx = headers.indexOf('who');
  const roleIdx = headers.indexOf('role');
  const partIdx = headers.indexOf('part');
  const qtyIdx = headers.indexOf('qty');
  const remarkIdx = headers.indexOf('remark');
  const urgentIdx = headers.indexOf('urgent');
  const statusIdx = headers.indexOf('status');
  const photoIdx = headers.indexOf('photo_url');

  return rows
    .filter(function (row) { return row[idIdx]; })
    .map(function (row) {
      return {
        id: String(row[idIdx] || ''),
        date: String(row[dateIdx] || ''),
        who: String(row[whoIdx] || ''),
        role: String(row[roleIdx] || ''),
        part: String(row[partIdx] || ''),
        qty: Number(row[qtyIdx]) || 0,
        remark: String(row[remarkIdx] || ''),
        urgent: String(row[urgentIdx]).toUpperCase() === 'TRUE',
        status: String(row[statusIdx] || ''),
        photoUrl: String(row[photoIdx] || '')
      };
    });
}

function getQuotes() {
  const sheetData = getSheetRows_('QuotationHistory');
  const headers = sheetData.headers;
  const rows = sheetData.rows;
  const noIdx = headers.indexOf('ลำดับ');
  const itemIdx = headers.indexOf('ชื่อสินค้า');
  const qtyIdx = headers.indexOf('จำนวน');
  const unitIdx = headers.indexOf('หน่วย');
  const unitPriceIdx = headers.indexOf('ราคาต่อหน่วย');
  const totalIdx = headers.indexOf('ราคารวม');
  const supplierIdx = headers.indexOf('บริษัทผู้เสนอราคา');
  const rfqRefIdx = headers.indexOf('ใบเสนอราคาเลขที่');
  const dateIdx = headers.indexOf('วันที่');

  return rows
    .filter(function (row) { return row[itemIdx]; })
    .map(function (row) {
      return {
        id: String(row[noIdx] || ''),
        itemName: String(row[itemIdx] || ''),
        qty: Number(row[qtyIdx]) || 0,
        unit: String(row[unitIdx] || ''),
        unitPrice: Number(row[unitPriceIdx]) || 0,
        totalCost: Number(row[totalIdx]) || 0,
        supplier: String(row[supplierIdx] || ''),
        rfqRef: String(row[rfqRefIdx] || ''),
        date: String(row[dateIdx] || '')
      };
    });
}

function getBudget() {
  const sheetData = getSheetRows_('Budget');
  const headers = sheetData.headers;
  const rows = sheetData.rows;
  const noIdx = headers.indexOf('No.');
  const ioIdx = headers.indexOf('IO');
  const assetIdx = headers.indexOf('ASSET');
  const costCenterIdx = headers.indexOf('COST CENTER');
  const descIdx = headers.indexOf('DESCRIPTION');
  const budgetIdx = headers.indexOf('BUDGET');
  const usedIdx = headers.indexOf('USED');
  const currentIdx = headers.indexOf('CURRENT');

  return rows
    .filter(function (row) { return row[ioIdx]; })
    .map(function (row) {
      return {
        no: Number(row[noIdx]) || 0,
        io: String(row[ioIdx] || ''),
        asset: String(row[assetIdx] || ''),
        costCenter: String(row[costCenterIdx] || ''),
        desc: String(row[descIdx] || ''),
        budget: parseMoney_(row[budgetIdx]),
        used: parseMoney_(row[usedIdx]),
        current: parseMoney_(row[currentIdx])
      };
    });
}

function getOrders() {
  const sheetData = getSheetRows_('PR');
  const headers = sheetData.headers;
  const rows = sheetData.rows;
  const dateIdx = headers.indexOf('DATE');
  const poIdx = headers.indexOf('PO No.');
  const prIdx = headers.indexOf('Pr No.');
  const matCodeIdx = headers.indexOf('MAT CODE');
  const itemIdx = headers.indexOf('ORDER');
  const qtyIdx = headers.indexOf('QTY.');
  const unitIdx = headers.indexOf('UNIT');
  const priceIdx = headers.indexOf('PRICES');
  const totalIdx = headers.indexOf('TOTAL PRICE');
  const statusIdx = headers.indexOf('STATUS');
  const categoryIdx = headers.indexOf('Category');
  const vendorIdx = headers.indexOf('VENDOR');

  return rows
    .filter(function (row) { return row[itemIdx]; })
    .map(function (row) {
      return {
        date: formatDate_(row[dateIdx]),
        poNo: String(row[poIdx] || ''),
        prNo: String(row[prIdx] || ''),
        matCode: String(row[matCodeIdx] || ''),
        itemName: String(row[itemIdx] || ''),
        qty: Number(row[qtyIdx]) || 0,
        unit: String(row[unitIdx] || ''),
        unitPrice: Number(row[priceIdx]) || 0,
        totalCost: Number(row[totalIdx]) || 0,
        status: String(row[statusIdx] || '').trim(),
        category: String(row[categoryIdx] || ''),
        vendor: String(row[vendorIdx] || '')
      };
    });
}

// Runnable self-check: in the Apps Script editor, select testAllSheets
// in the function dropdown and click Run, then read the Execution Log.
// Confirms every handler reads its sheet without throwing and returns
// an array — run this before wiring index.html to the deployed URL.
function testAllSheets() {
  const checks = [
    ['getStock', getStock],
    ['getRequests', getRequests],
    ['getQuotes', getQuotes],
    ['getBudget', getBudget],
    ['getOrders', getOrders]
  ];

  let allPass = true;
  checks.forEach(function (pair) {
    const name = pair[0];
    const fn = pair[1];
    try {
      const data = fn();
      if (!Array.isArray(data)) {
        throw new Error('expected an array, got ' + typeof data);
      }
      Logger.log('PASS ' + name + ': ' + data.length + ' rows. Sample: ' + JSON.stringify(data[0] || null));
    } catch (err) {
      allPass = false;
      Logger.log('FAIL ' + name + ': ' + err.toString());
    }
  });

  Logger.log(allPass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');
  return allPass;
}
```

- [ ] **Step 2: Commit**

```bash
git add Code.gs
git commit -m "feat: add read-only Apps Script JSON API for the 5 sheets"
```

---

### Task 2: Deploy Code.gs and verify against the live sheet

This step is manual — it requires interactive Google OAuth, which can't be driven from an agent session.

**Steps for the human operator:**

- [ ] **Step 1: Open the spreadsheet and the script editor**

Open https://docs.google.com/spreadsheets/d/1oOzyZxcfzzfirdeOKUO1m9S6NjXKFUFgkfhNzNZqtV8/edit → Extensions → Apps Script. This opens a bound Apps Script project (creates one if none exists yet).

- [ ] **Step 2: Paste in the code**

Delete any placeholder content in the default `Code.gs` file in the Apps Script editor, paste in the full contents of the repo's `Code.gs` from Task 1, and save (Ctrl+S / File → Save).

- [ ] **Step 3: Run the self-check**

In the function dropdown at the top of the editor, select `testAllSheets`, click Run. First run will prompt for authorization — approve it (it's your own spreadsheet). Open View → Logs (or Execution Log) and confirm every line says `PASS`, ending with `ALL CHECKS PASSED`.

Expected: 5 `PASS` lines (one per sheet function) and `ALL CHECKS PASSED`. If any line says `FAIL`, the header name in that handler doesn't match the live sheet — re-check the exact column spelling against the sheet before continuing.

- [ ] **Step 4: Deploy as a Web App**

Deploy → New deployment → gear icon → Web app. Description: "Stock dashboard read API". Execute as: Me. Who has access: Anyone. Click Deploy, authorize again if prompted, then copy the Web app URL (ends in `/exec`).

- [ ] **Step 5: Verify the deployed endpoint directly**

Paste `<exec URL>?action=all` into a browser address bar.
Expected: a JSON object with keys `stock`, `requests`, `quotes`, `budget`, `orders`, each an array (```quotes``` may be `[]` since `QuotationHistory` currently has no data rows — that's correct, not a bug).

- [ ] **Step 6: Record the URL**

Keep the exec URL — Task 7 pastes it into `index.html`'s `EXEC_URL` constant. Nothing to commit in this task (no local file changed).

---

### Task 3: Remove write-only controls in the Stock and Orders tabs

Both tabs get to keep their existing layout otherwise; only the actions that only worked against the in-memory mock data come out. The Stock table also loses its "Type" and "Location" columns — `Type` no longer exists as a sheet column (confirmed against the live sheet) and "Location" never had a source column.

**Files:**
- Modify: `index.html:199-240` (Stock tab controls + table)
- Modify: `index.html:903-933` (`renderStockTable`)
- Modify: `index.html:276-309` (Orders tab table headers)
- Modify: `index.html:935-983` (`renderOrdersTable`)

- [ ] **Step 1: Remove the "เพิ่มอะไหล่ใหม่" button and unused table columns in the Stock tab HTML**

Replace (around line 199-209):

```html
                    <div class="flex items-center gap-3 w-full sm:w-auto justify-end">
                        <button onclick="toggleLowStockOnly()" id="btn-toggle-lowstock" class="border border-rose-200 hover:bg-rose-50/50 text-rose-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 focus:ring-2 focus:ring-rose-500/50 focus:outline-none">
                            <i data-lucide="alert-triangle" class="w-4 h-4"></i>
                            <span>แสดงเฉพาะอะไหล่ใกล้หมด</span>
                        </button>
                        <button onclick="openModal('addStock')" class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center space-x-2 transition-colors shadow-sm focus:ring-2 focus:ring-indigo-500/50 focus:outline-none">
                            <i data-lucide="plus" class="w-4 h-4"></i>
                            <span>เพิ่มอะไหล่ใหม่</span>
                        </button>
                    </div>
```

with:

```html
                    <div class="flex items-center gap-3 w-full sm:w-auto justify-end">
                        <button onclick="toggleLowStockOnly()" id="btn-toggle-lowstock" class="border border-rose-200 hover:bg-rose-50/50 text-rose-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 focus:ring-2 focus:ring-rose-500/50 focus:outline-none">
                            <i data-lucide="alert-triangle" class="w-4 h-4"></i>
                            <span>แสดงเฉพาะอะไหล่ใกล้หมด</span>
                        </button>
                    </div>
```

Then replace the table header block (around line 222-233):

```html
                                <tr>
                                    <th class="px-6 py-4">รหัสอะไหล่ (MAT.)</th>
                                    <th class="px-6 py-4">ชื่ออะไหล่ (Description)</th>
                                    <th class="px-6 py-4">หมวดหมู่ (Category)</th>
                                    <th class="px-6 py-4">ประเภท (Type)</th>
                                    <th class="px-6 py-4 text-center">ตำแหน่งจัดเก็บ</th>
                                    <th class="px-6 py-4 text-center">จํานวนคงเหลือ</th>
                                    <th class="px-6 py-4 text-center">หน่วย (Unit)</th>
                                    <th class="px-6 py-4 text-center">จุดปลอดภัยต่ำสุด</th>
                                    <th class="px-6 py-4">สถานะสต็อก</th>
                                    <th class="px-6 py-4 text-right">ปรับปรุงสต็อก</th>
                                </tr>
```

with:

```html
                                <tr>
                                    <th class="px-6 py-4">รหัสอะไหล่ (MAT.)</th>
                                    <th class="px-6 py-4">ชื่ออะไหล่ (Description)</th>
                                    <th class="px-6 py-4">หมวดหมู่ (Category)</th>
                                    <th class="px-6 py-4 text-center">จํานวนคงเหลือ</th>
                                    <th class="px-6 py-4 text-center">หน่วย (Unit)</th>
                                    <th class="px-6 py-4 text-center">จุดปลอดภัยต่ำสุด</th>
                                    <th class="px-6 py-4">สถานะสต็อก</th>
                                </tr>
```

- [ ] **Step 2: Rewrite `renderStockTable()` to match (was `index.html:903-933`)**

```javascript
        function renderStockTable() {
            const tbody = document.getElementById("stock-table-body");
            tbody.innerHTML = "";

            stockParts.forEach(part => {
                const isLow = part.qty <= part.reorder;
                const statusBadge = isLow
                    ? `<span class="px-2 py-0.5 text-xs font-semibold rounded-full bg-rose-100 text-rose-700 flex items-center w-max"><i data-lucide="alert-triangle" class="w-3.5 h-3.5 mr-1"></i>วิกฤต/ใกล้หมด</span>`
                    : `<span class="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700 flex items-center w-max"><i data-lucide="check" class="w-3.5 h-3.5 mr-1"></i>มีพร้อมจ่าย</span>`;

                if (showLowStockOnly && !isLow) return;

                tbody.innerHTML += `
                    <tr class="stock-row border-b border-slate-100 hover:bg-slate-50 transition-colors" data-id="${part.id}" data-name="${part.name}">
                        <td class="px-6 py-4 font-semibold text-slate-800">${part.id}</td>
                        <td class="px-6 py-4 font-bold text-slate-900">${part.name}</td>
                        <td class="px-6 py-4 text-slate-500 text-xs">${part.category}</td>
                        <td class="px-6 py-4 text-center font-bold text-slate-800 text-base">${part.qty}</td>
                        <td class="px-6 py-4 text-center text-xs font-semibold text-slate-500">${part.unit || "Pc"}</td>
                        <td class="px-6 py-4 text-center text-slate-500 text-xs font-semibold">${part.reorder}</td>
                        <td class="px-6 py-4">${statusBadge}</td>
                    </tr>
                `;
            });
        }
```

- [ ] **Step 3: Remove the "การจัดการ" column from the Orders tab header (was `index.html:287-301`)**

Replace:

```html
                                <tr>
                                    <th class="px-6 py-4">วันที่สั่งซื้อ</th>
                                    <th class="px-6 py-4">เลขที่ PO</th>
                                    <th class="px-6 py-4">เลขที่ PR</th>
                                    <th class="px-6 py-4">รหัสพัสดุ</th>
                                    <th class="px-6 py-4">รายการอะไหล่</th>
                                    <th class="px-6 py-4 text-center">จำนวน</th>
                                    <th class="px-6 py-4 text-center">หน่วย</th>
                                    <th class="px-6 py-4 text-right">ราคาต่อหน่วย</th>
                                    <th class="px-6 py-4 text-right">ราคารวม</th>
                                    <th class="px-6 py-4">ประเภทงาน</th>
                                    <th class="px-6 py-4">ซัพพลายเออร์</th>
                                    <th class="px-6 py-4">สถานะสั่งซื้อ</th>
                                    <th class="px-6 py-4 text-right">การจัดการ</th>
                                </tr>
```

with:

```html
                                <tr>
                                    <th class="px-6 py-4">วันที่สั่งซื้อ</th>
                                    <th class="px-6 py-4">เลขที่ PO</th>
                                    <th class="px-6 py-4">เลขที่ PR</th>
                                    <th class="px-6 py-4">รหัสพัสดุ</th>
                                    <th class="px-6 py-4">รายการอะไหล่</th>
                                    <th class="px-6 py-4 text-center">จำนวน</th>
                                    <th class="px-6 py-4 text-center">หน่วย</th>
                                    <th class="px-6 py-4 text-right">ราคาต่อหน่วย</th>
                                    <th class="px-6 py-4 text-right">ราคารวม</th>
                                    <th class="px-6 py-4">ประเภทงาน</th>
                                    <th class="px-6 py-4">ซัพพลายเออร์</th>
                                    <th class="px-6 py-4">สถานะสั่งซื้อ</th>
                                </tr>
```

- [ ] **Step 4: Rewrite `renderOrdersTable()` to drop `updateOrderStatus` actions (was `index.html:935-983`)**

```javascript
        function renderOrdersTable() {
            const tbody = document.getElementById("orders-table-body");
            tbody.innerHTML = "";

            purchaseOrders.forEach(order => {
                let statusColor = "bg-slate-100 border border-slate-200 text-slate-600";

                if (order.status === "รอดำเนินการ" || order.status === "Pending") {
                    statusColor = "bg-indigo-50 border border-indigo-100 text-indigo-700";
                } else if (order.status === "กำลังจัดส่ง" || order.status === "DEL.") {
                    statusColor = "bg-amber-50 border border-amber-100 text-amber-700";
                } else if (order.status === "RECEIVED" || order.status === "ได้รับแล้ว") {
                    statusColor = "bg-emerald-50 border border-emerald-100 text-emerald-700";
                } else if (order.status === "Cancle" || order.status === "Cancel") {
                    statusColor = "bg-rose-50 border border-rose-100 text-rose-700";
                }

                tbody.innerHTML += `
                    <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td class="px-6 py-4 text-xs font-semibold text-slate-500">${order.date}</td>
                        <td class="px-6 py-4 font-semibold text-slate-800">${order.poNo || "-"}</td>
                        <td class="px-6 py-4 font-semibold text-slate-800">${order.prNo || "-"}</td>
                        <td class="px-6 py-4 text-xs font-semibold text-slate-600">${order.matCode || "-"}</td>
                        <td class="px-6 py-4 font-bold text-slate-900">${order.itemName}</td>
                        <td class="px-6 py-4 text-center font-semibold text-slate-800">${order.qty}</td>
                        <td class="px-6 py-4 text-center text-xs font-semibold text-slate-600">${order.unit || "Pc"}</td>
                        <td class="px-6 py-4 text-right font-semibold text-slate-800">${order.unitPrice.toLocaleString()} ฿</td>
                        <td class="px-6 py-4 text-right font-bold text-slate-900">${order.totalCost.toLocaleString()} ฿</td>
                        <td class="px-6 py-4 text-xs text-slate-500">${order.category}</td>
                        <td class="px-6 py-4 text-xs text-slate-500">${order.vendor || "-"}</td>
                        <td class="px-6 py-4"><span class="px-2 py-1 text-xs font-bold rounded-lg ${statusColor}">${order.status}</span></td>
                    </tr>
                `;
            });

            const pOrders = purchaseOrders.filter(o => o.status === "รอดำเนินการ" || o.status === "Pending").length;
            const sOrders = purchaseOrders.filter(o => o.status === "กำลังจัดส่ง" || o.status === "DEL.").length;
            const rOrders = purchaseOrders.filter(o => o.status === "ได้รับแล้ว" || o.status === "RECEIVED").length;
            document.getElementById("stat-pending-orders").innerText = pOrders;
            document.getElementById("stat-shipping-orders").innerText = sOrders;
            document.getElementById("stat-success-orders").innerText = rOrders;
        }
```

- [ ] **Step 5: Verify in the browser**

Open `index.html` directly (still on mock data at this point — Task 7 wires the fetch). Switch to the Stock tab: confirm no "เพิ่มอะไหล่ใหม่" button, no Type/Location columns, no +/- buttons, table still renders rows. Switch to Orders tab: confirm no "การจัดการ" column, no ส่งของ/ตรวจรับ buttons, table still renders rows. Open the browser console: confirm no JS errors (a leftover reference to `part.type`, `part.location`, `adjustQty`, or `updateOrderStatus` would throw or show `undefined` in the table — there should be neither).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "refactor: remove write-only controls and dead columns from Stock/Orders tabs"
```

---

### Task 4: Redesign the RFQ tab to match the real `requests` sheet

The mockup's RFQ tab modeled per-request supplier-quote tracking (RFQ number, "sent to N suppliers", accept/reject status) that has no source data. Real `requests` rows are a request-intake log; the "how many quotes are in the system" concept survives as an aggregate stat card fed by `quoteHistory.length`, per the spec.

**Files:**
- Modify: `index.html:311-343` (RFQ tab section — full replace)
- Modify: `index.html:985-1008` (`renderRFQTable`)
- Modify: `index.html:855-881` (`renderAll`, one line)

**Interfaces:**
- Consumes: `rfqList` — array of `{ id, date, who, role, part, qty, remark, urgent, status, photoUrl }` (Task 1's `getRequests()` shape). `quoteHistory` — array from Task 1's `getQuotes()` shape (only `.length` used here).

- [ ] **Step 1: Replace the RFQ tab section (was `index.html:311-343`)**

Replace:

```html
            <!-- 3. REQUEST FOR QUOTATION (RFQ) TAB -->
            <section id="content-rfq" class="tab-content hidden space-y-6">
                <div class="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
                    <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <div>
                            <h3 class="font-bold text-base text-slate-800">รายการขอใบเสนอราคา (RFQ)</h3>
                            <p class="text-xs text-slate-500 mt-1">บันทึกประวัติเอกสารส่งเทียบราคาคู่ค้าและซัพพลายเออร์ต่างๆ</p>
                        </div>
                        <button onclick="openModal('rfq')" class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center space-x-1.5 shadow-sm focus:ring-2 focus:ring-indigo-500/50 focus:outline-none">
                            <i data-lucide="file-plus" class="w-3.5 h-3.5"></i>
                            <span>ออกเอกสารขอราคาใหม่</span>
                        </button>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-sm text-slate-600">
                            <thead class="bg-slate-50 text-slate-700 uppercase font-semibold text-xs border-b border-slate-100 font-bold">
                                <tr>
                                    <th class="px-6 py-4">เลขที่ RFQ</th>
                                    <th class="px-6 py-4">รายการอะไหล่พัสดุ</th>
                                    <th class="px-6 py-4">ประเภทอะไหล่</th>
                                    <th class="px-6 py-4 text-center">ส่งเทียบราคาทั้งหมด</th>
                                    <th class="px-6 py-4 text-center">วันที่ออกใบคำขอ</th>
                                    <th class="px-6 py-4">สถานะปัจจุบัน</th>
                                    <th class="px-6 py-4 text-right">การจัดการ</th>
                                </tr>
                            </thead>
                            <tbody id="rfq-table-body">
                                <!-- Dynamic RFQ List -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>
```

with:

```html
            <!-- 3. REQUEST FOR QUOTATION (RFQ) TAB -->
            <section id="content-rfq" class="tab-content hidden space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="bg-white p-6 rounded-xl border border-slate-200/60 shadow-sm flex items-center space-x-4">
                        <div class="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
                            <i data-lucide="file-text" class="w-5 h-5"></i>
                        </div>
                        <div>
                            <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">คำขอเทียบราคาทั้งหมด</p>
                            <p class="text-2xl font-bold text-slate-800 mt-0.5" id="stat-total-requests">0</p>
                        </div>
                    </div>
                    <div class="bg-white p-6 rounded-xl border border-slate-200/60 shadow-sm flex items-center space-x-4">
                        <div class="p-3 bg-amber-50 text-amber-600 rounded-lg">
                            <i data-lucide="clock" class="w-5 h-5"></i>
                        </div>
                        <div>
                            <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">รอตรวจสอบ (review)</p>
                            <p class="text-2xl font-bold text-slate-800 mt-0.5" id="stat-review-requests">0</p>
                        </div>
                    </div>
                    <div class="bg-white p-6 rounded-xl border border-slate-200/60 shadow-sm flex items-center space-x-4">
                        <div class="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
                            <i data-lucide="file-check" class="w-5 h-5"></i>
                        </div>
                        <div>
                            <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">ใบเสนอราคาที่ได้รับทั้งระบบ</p>
                            <p class="text-2xl font-bold text-slate-800 mt-0.5" id="stat-total-quotes-system">0</p>
                        </div>
                    </div>
                </div>
                <div class="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
                    <div class="p-6 border-b border-slate-100 bg-slate-50/50">
                        <h3 class="font-bold text-base text-slate-800">รายการขอเทียบราคา (Requests)</h3>
                        <p class="text-xs text-slate-500 mt-1">คำขอเทียบราคาที่ส่งเข้ามาจากผู้ใช้งาน พร้อมสถานะการตรวจสอบ</p>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-sm text-slate-600">
                            <thead class="bg-slate-50 text-slate-700 uppercase font-semibold text-xs border-b border-slate-100 font-bold">
                                <tr>
                                    <th class="px-6 py-4">เลขที่คำขอ</th>
                                    <th class="px-6 py-4">วันที่ขอ</th>
                                    <th class="px-6 py-4">ผู้ขอ / แผนก</th>
                                    <th class="px-6 py-4">รายการอะไหล่</th>
                                    <th class="px-6 py-4 text-center">จำนวน</th>
                                    <th class="px-6 py-4">หมายเหตุ</th>
                                    <th class="px-6 py-4 text-center">ด่วน</th>
                                    <th class="px-6 py-4">สถานะ</th>
                                </tr>
                            </thead>
                            <tbody id="rfq-table-body">
                                <!-- Dynamic Requests List -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>
```

- [ ] **Step 2: Rewrite `renderRFQTable()` (was `index.html:985-1008`)**

```javascript
        function renderRFQTable() {
            const tbody = document.getElementById("rfq-table-body");
            tbody.innerHTML = "";

            rfqList.forEach(req => {
                let statusColor = "bg-slate-100 border border-slate-200 text-slate-600";
                if (req.status === "ok") statusColor = "bg-emerald-50 border border-emerald-100 text-emerald-700";
                else if (req.status === "review") statusColor = "bg-amber-50 border border-amber-100 text-amber-700";

                const urgentBadge = req.urgent
                    ? `<span class="px-2 py-0.5 text-xs font-bold rounded-full bg-rose-100 text-rose-700">ด่วน</span>`
                    : `<span class="text-xs text-slate-400">-</span>`;

                tbody.innerHTML += `
                    <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td class="px-6 py-4 font-semibold text-slate-800">${req.id}</td>
                        <td class="px-6 py-4 text-xs text-slate-500">${req.date}</td>
                        <td class="px-6 py-4 text-xs text-slate-700">${req.who}${req.role ? " / " + req.role : ""}</td>
                        <td class="px-6 py-4 font-bold text-slate-900">${req.part}</td>
                        <td class="px-6 py-4 text-center text-slate-800 font-semibold">${req.qty || "-"}</td>
                        <td class="px-6 py-4 text-xs text-slate-500">${req.remark || "-"}</td>
                        <td class="px-6 py-4 text-center">${urgentBadge}</td>
                        <td class="px-6 py-4"><span class="px-2.5 py-1 text-xs font-bold rounded-lg ${statusColor}">${req.status || "-"}</span></td>
                    </tr>
                `;
            });

            document.getElementById("stat-total-requests").innerText = rfqList.length;
            document.getElementById("stat-review-requests").innerText = rfqList.filter(r => r.status === "review").length;
            document.getElementById("stat-total-quotes-system").innerText = quoteHistory.length;
        }
```

- [ ] **Step 3: Fix the stale badge-count reference in `renderAll()` (`index.html:868`)**

The existing line `const pendingQuotesCount = quoteHistory.filter(q => q.status === "รอพิจารณาอนุมัติ").length;` reads a `status` field `quoteHistory` no longer has after Task 5. Since `renderRFQTable()` now runs after `rfqList` is populated and already updates its own stat elements, this line and its badge update are no longer needed here — remove both lines (`pendingQuotesCount` calculation and the `pending-quotes-badge` update) from `renderAll()`. Leave the rest of `renderAll()` (lines 855-867, 870-881) unchanged.

- [ ] **Step 4: Verify in the browser console**

With `index.html` still open on mock data, open the browser console and run:

```javascript
rfqList = [
  { id: "20260713-091220-1", date: "2026-07-13", who: "สวัสดีครับ", role: "ทดสอบ", part: "ลูกปืน 6204", qty: 4, remark: "เครื่อง CNC 3", urgent: false, status: "ok", photoUrl: "" },
  { id: "20260713-091632-2", date: "2026-07-13", who: "สวัสดีครับ", role: "ทดสอบ", part: "สายพาน", qty: 0, remark: "", urgent: false, status: "review", photoUrl: "" }
];
quoteHistory = [];
renderRFQTable();
```

Expected: switching to the RFQ tab shows 2 rows with the real-shaped fields, the "รอตรวจสอบ" stat shows `1`, "คำขอเทียบราคาทั้งหมด" shows `2`, no console errors.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "refactor: redesign RFQ tab to match real requests sheet fields"
```

---

### Task 5: Redesign the Quotation History tab (drop the non-existent approval-status column)

**Files:**
- Modify: `index.html:508-519` (Quotes tab header/button)
- Modify: `index.html:572-573` (Quotes table header, last 2 columns)
- Modify: `index.html:1010-1044` (`renderQuotesTable`)

**Interfaces:**
- Consumes: `quoteHistory` — array of `{ id, itemName, qty, unit, unitPrice, totalCost, supplier, rfqRef, date }` (Task 1's `getQuotes()` shape).

- [ ] **Step 1: Remove the "เพิ่มใบเสนอราคาเข้าระบบ" button (was `index.html:508-519`)**

Replace:

```html
            <section id="content-quotes" class="tab-content hidden space-y-6">
                <div class="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
                    <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <div>
                            <h3 class="font-bold text-base text-slate-800">ประวัติใบเสนอราคาที่ได้รับจากร้านค้า (Quotation Registry)</h3>
                            <p class="text-xs text-slate-500 mt-1">เปรียบเทียบข้อมูลราคา อนุมัติการซื้อเพื่อออกเลขใบ PO ได้โดยตรงจากที่นี่</p>
                        </div>
                        <button onclick="openModal('addQuote')" class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center space-x-1.5 shadow-sm focus:ring-2 focus:ring-indigo-500/50 focus:outline-none">
                            <i data-lucide="file-plus-2" class="w-3.5 h-3.5"></i>
                            <span>เพิ่มใบเสนอราคาเข้าระบบ</span>
                        </button>
                    </div>
```

with:

```html
            <section id="content-quotes" class="tab-content hidden space-y-6">
                <div class="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
                    <div class="p-6 border-b border-slate-100 bg-slate-50/50">
                        <h3 class="font-bold text-base text-slate-800">ประวัติใบเสนอราคาที่ได้รับจากร้านค้า (Quotation Registry)</h3>
                        <p class="text-xs text-slate-500 mt-1">บันทึกใบเสนอราคาที่ได้รับจากซัพพลายเออร์ทั้งหมด</p>
                    </div>
```

- [ ] **Step 2: Remove the last 2 header columns (was `index.html:572-573`)**

Replace:

```html
                                    <th class="px-6 py-4">สถานะอนุมัติ</th>
                                    <th class="px-6 py-4 text-right">ดำเนินการ</th>
```

with nothing (delete both lines — the `</tr>` that follows stays).

- [ ] **Step 3: Rewrite `renderQuotesTable()` (was `index.html:1010-1044`)**

```javascript
        function renderQuotesTable() {
            const tbody = document.getElementById("quotes-table-body");
            tbody.innerHTML = "";

            quoteHistory.forEach(q => {
                tbody.innerHTML += `
                    <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td class="px-6 py-4 text-xs font-semibold text-slate-500">${q.date || "-"}</td>
                        <td class="px-6 py-4 font-semibold text-slate-600 text-xs">${q.rfqRef || "-"}</td>
                        <td class="px-6 py-4 text-slate-800 font-medium">${q.supplier}</td>
                        <td class="px-6 py-4 font-bold text-slate-900">${q.itemName}</td>
                        <td class="px-6 py-4 text-center font-semibold text-slate-800">${q.qty}</td>
                        <td class="px-6 py-4 text-center text-xs font-semibold text-slate-600">${q.unit || "Pc"}</td>
                        <td class="px-6 py-4 text-center font-semibold text-slate-800">${q.unitPrice.toLocaleString()} ฿</td>
                        <td class="px-6 py-4 text-right font-bold text-slate-900">${q.totalCost.toLocaleString()} ฿</td>
                    </tr>
                `;
            });
        }
```

- [ ] **Step 4: Verify in the browser console**

```javascript
quoteHistory = [
  { id: "1", itemName: "ตลับลูกปืนเม็ดกลม NSK 6204", qty: 10, unit: "Pc", unitPrice: 450, totalCost: 4500, supplier: "บริษัท สามัญแบริ่ง จำกัด", rfqRef: "QT-2026-001", date: "2026-07-15" }
];
renderQuotesTable();
```

Expected: switching to the Quotation History tab shows 1 row, 8 columns total (no approval-status/action columns), no console errors.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "refactor: drop non-existent approval-status column from Quotation History tab"
```

---

### Task 6: Fix the fake "new PO" delta in `renderBudgetInfo()`

**Files:**
- Modify: `index.html:1046-1061` (`renderBudgetInfo`, top portion)

- [ ] **Step 1: Remove the `newPoCost` hack**

Replace (was `index.html:1046-1061`):

```javascript
        function renderBudgetInfo() {
            // Re-calculate budget statistics based on projectsBudget sheet
            let totalCap = projectsBudget.reduce((sum, p) => sum + p.budget, 0);
            let totalSpentBase = projectsBudget.reduce((sum, p) => sum + p.used, 0);
            
            // Let's add any newly created POs (not present in the baseline sheet)
            let newPoCost = 0;
            purchaseOrders.forEach(o => {
                if (o.status !== "Cancle" && o.status !== "Cancel") {
                    if (o.date.includes('/') && !o.date.startsWith('1/5/') && !o.date.startsWith('1/12/') && !o.date.startsWith('1/14/') && !o.date.startsWith('1/19/') && !o.date.startsWith('1/20/') && !o.date.startsWith('1/21/')) {
                        newPoCost += o.totalCost;
                    }
                }
            });

            const spent = totalSpentBase + newPoCost;
            const remaining = Math.max(0, totalCap - spent);
            const pct = Math.min(100, Math.round((spent / totalCap) * 100));
```

with:

```javascript
        function renderBudgetInfo() {
            // Budget statistics come directly from the Budget sheet's own BUDGET/USED figures —
            // they're already the authoritative per-project totals, no need to re-derive spend from PR rows.
            let totalCap = projectsBudget.reduce((sum, p) => sum + p.budget, 0);
            let totalSpentBase = projectsBudget.reduce((sum, p) => sum + p.used, 0);

            const spent = totalSpentBase;
            const remaining = Math.max(0, totalCap - spent);
            const pct = Math.min(100, Math.round((spent / totalCap) * 100));
```

The rest of `renderBudgetInfo()` (category breakdown, chart updates, `calculateMonthlyExpenses()` call) is unchanged — it already reads `spent`/`remaining` from these two variables.

- [ ] **Step 2: Verify in the browser console**

```javascript
projectsBudget = [{ no: 1, io: "X", asset: "-", costCenter: "-", desc: "Test", budget: 1000, used: 400, current: 600 }];
purchaseOrders = [];
renderBudgetInfo();
document.getElementById("budget-spent-val").innerText; // should read "400.00 ฿"
```

Expected: `budget-spent-val` shows `400.00 ฿` (not `400.00 ฿` plus any phantom PO delta), no console errors.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "fix: remove fake new-PO delta from budget spent calculation"
```

---

### Task 7: Wire real data loading end-to-end

**Files:**
- Modify: `index.html:160-167` (header — add Refresh button)
- Modify: `index.html:726-807` (mock array declarations — replace with empty arrays + config)
- Modify: `index.html:809-820` (`window.onload`)

**Interfaces:**
- Consumes: the deployed exec URL from Task 2.
- Produces: `loadAllData()`, `showLoadError(message)`, `hideLoadError()`, `setRefreshing(isRefreshing)` — no other task depends on these, this is the last task.

- [ ] **Step 1: Add the Refresh button to the header (was `index.html:160-167`)**

Replace:

```html
        <header class="bg-white border-b border-slate-200/80 px-6 py-4 flex items-center justify-between flex-shrink-0">
            <div class="flex items-center space-x-4">
                <h2 id="current-page-title" class="text-lg font-bold text-slate-800 tracking-wide">คลังอะไหล่ (Stock)</h2>
                <span class="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium hidden sm:inline-block" id="live-time">
                    กำลังโหลดเวลา...
                </span>
            </div>
        </header>
```

with:

```html
        <header class="bg-white border-b border-slate-200/80 px-6 py-4 flex items-center justify-between flex-shrink-0">
            <div class="flex items-center space-x-4">
                <h2 id="current-page-title" class="text-lg font-bold text-slate-800 tracking-wide">คลังอะไหล่ (Stock)</h2>
                <span class="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium hidden sm:inline-block" id="live-time">
                    กำลังโหลดเวลา...
                </span>
            </div>
            <button id="btn-refresh-data" onclick="loadAllData()" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1.5 transition-colors focus:ring-2 focus:ring-indigo-500/50 focus:outline-none">
                <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                <span>รีเฟรชข้อมูล</span>
            </button>
        </header>
```

- [ ] **Step 2: Replace the 5 mock arrays with empty arrays + the data-loading functions**

Replace the entire block from `// Seeded with real data from Google Sheet "STOCK"` through the closing `];` of `purchaseOrders` (was `index.html:726-803`, everything between the `budgetSpent` line and the `showLowStockOnly` line) with:

```javascript
        // Paste your deployed Apps Script Web App exec URL here (Task 2 of the implementation plan)
        const EXEC_URL = "PASTE_YOUR_DEPLOYED_EXEC_URL_HERE";

        let stockParts = [];
        let projectsBudget = [];
        let rfqList = [];
        let quoteHistory = [];
        let purchaseOrders = [];

        async function loadAllData() {
            hideLoadError();
            setRefreshing(true);
            try {
                const res = await fetch(EXEC_URL + "?action=all");
                const data = await res.json();
                if (data.error) {
                    throw new Error(data.error);
                }

                stockParts = data.stock || [];
                rfqList = data.requests || [];
                quoteHistory = data.quotes || [];
                projectsBudget = data.budget || [];
                purchaseOrders = data.orders || [];

                renderAll();
            } catch (err) {
                showLoadError(err && err.message ? err.message : String(err));
            } finally {
                setRefreshing(false);
            }
        }

        function showLoadError(message) {
            const container = document.getElementById("system-alerts-container");
            let banner = document.getElementById("load-error-banner");
            if (!banner) {
                banner = document.createElement("div");
                banner.id = "load-error-banner";
                banner.className = "flex items-center justify-between bg-rose-50 border border-rose-200/50 text-rose-800 px-4 py-3 rounded-xl text-sm shadow-sm";
                container.prepend(banner);
            }
            banner.innerHTML = `
                <div class="flex items-center space-x-2">
                    <i data-lucide="alert-triangle" class="w-4 h-4 text-rose-600"></i>
                    <span>โหลดข้อมูลจาก Google Sheet ไม่สำเร็จ: ${message}</span>
                </div>
                <button onclick="loadAllData()" class="text-xs font-bold underline hover:text-rose-950 transition-colors">ลองใหม่</button>
            `;
            lucide.createIcons();
        }

        function hideLoadError() {
            const banner = document.getElementById("load-error-banner");
            if (banner) banner.remove();
        }

        function setRefreshing(isRefreshing) {
            const btn = document.getElementById("btn-refresh-data");
            if (!btn) return;
            btn.disabled = isRefreshing;
            btn.classList.toggle("opacity-50", isRefreshing);
            const label = btn.querySelector("span");
            if (label) label.innerText = isRefreshing ? "กำลังโหลด..." : "รีเฟรชข้อมูล";
        }
```

`budgetCap`/`budgetSpent` (the two lines immediately above this block) and `showLowStockOnly`/`budgetChartInstance`/`monthlyChartInstance` (immediately below it) are untouched — only the 5 array declarations in between are replaced.

- [ ] **Step 3: Update `window.onload` (was `index.html:809-820`)**

Replace:

```javascript
        window.onload = function() {
            lucide.createIcons();
            updateLiveTime();
            setInterval(updateLiveTime, 1000);
            
            // Render default starting screen
            renderAll();
            initializeBudgetChart();
            
            // Default load into Stock tab
            switchTab('stock');
        }
```

with:

```javascript
        window.onload = function() {
            lucide.createIcons();
            updateLiveTime();
            setInterval(updateLiveTime, 1000);

            initializeBudgetChart();
            loadAllData();

            // Default load into Stock tab
            switchTab('stock');
        }
```

- [ ] **Step 4: Paste the real exec URL**

Replace `"PASTE_YOUR_DEPLOYED_EXEC_URL_HERE"` in the `EXEC_URL` constant with the exec URL recorded at the end of Task 2.

- [ ] **Step 5: Verify end-to-end in the browser**

Open `index.html` directly (double-click / open in a browser — no server needed). Open devtools console first to catch errors.

Expected, in order:
1. Page loads, Stock tab is active, table populates with real STOCK rows (MAT codes, Thai descriptions) within a couple seconds.
2. Low-stock banner appears at the top if any real row has `qty <= reorder` (check against the sheet for at least one such row to confirm the banner logic actually fires, not just that it's absent).
3. Orders tab shows real PR rows, with the 3 stat cards (pending/shipping/received) showing non-zero-consistent counts.
4. RFQ tab shows real `requests` rows (currently 2, per the live sheet) with correct who/part/urgent/status, and the "ใบเสนอราคาที่ได้รับทั้งระบบ" stat shows the current `QuotationHistory` row count (0, since it's empty today).
5. Quotation History tab shows its empty state (sheet has no data rows yet) — not an error.
6. Budget tab shows the real per-project table and the monthly-expense chart/table populated from real PR dates.
7. Click "รีเฟรชข้อมูล" — button briefly disables and shows "กำลังโหลด...", then re-enables, tables re-render.
8. Temporarily break `EXEC_URL` (add a typo), reload, confirm the red error banner appears with the fetch error message and a "ลองใหม่" button; fix the URL back afterward.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: load Stock/Orders/RFQ/Quotes/Budget tabs from the live Google Sheet"
```

---

## Self-Review Notes

- **Spec coverage:** Architecture (Task 1, 2, 7), all 5 field-mapping sections (Task 1 handlers directly implement the spec's mapping table), RFQ re-skin (Task 4), Quotation-status removal (Task 5), write-controls removal (Task 3, folded into Task 4/5 for RFQ/Quotes), budget bug fix (Task 6), error handling / manual refresh (Task 7) — all covered.
- **Placeholder scan:** the only literal placeholder is `EXEC_URL`'s value, which is inherently only knowable after Task 2's manual deploy step — Step 4 of Task 7 exists specifically to replace it, not left dangling.
- **Type consistency:** field names used across tasks (`id, name, category, unit, qty, reorder, remark` for stock; `id, date, who, role, part, qty, remark, urgent, status, photoUrl` for requests; etc.) match between Task 1's `Code.gs` output and Task 4/5/7's `index.html` consumption — checked against the "Interfaces" blocks in each task.
