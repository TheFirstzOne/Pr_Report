# Orders (PR) Tab Filters — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a combined search + month + multi-select (Status/Category/Vendor) filter toolbar above the Orders tab table in `index.html`, filtering the already-loaded `purchaseOrders` array client-side.

**Architecture:** All filtering happens client-side over data already in memory (`purchaseOrders`, populated by the existing `loadAllData()`). No server/`Code.gs` changes. `renderOrdersTable()` is split so its table-body rendering takes a `orders` parameter (the filtered subset) while its 3 stat-card lines keep reading the full, unfiltered `purchaseOrders` global.

**Tech Stack:** Vanilla JS, Tailwind utility classes already used throughout `index.html`, Lucide icons already loaded. No new dependencies.

## Global Constraints

- Pure client-side filtering — no changes to `Code.gs` or the deployed exec URL. (Spec: Scope)
- All 5 filter criteria combine with AND logic. (Spec: Behavior)
- The 3 stat cards (รออนุมัติจัดซื้อ / อยู่ระหว่างจัดส่ง / จัดส่งและตรวจรับสำเร็จ) always reflect the full `purchaseOrders` array, never the filtered subset. (Spec: Behavior)
- No sort feature in this round. (Spec: Scope)
- Filter selections persist across a manual "รีเฟรชข้อมูล" click — a refresh must not silently reset them. (Spec: Behavior)
- Blank `category`/`vendor` values must appear as an explicit "(ไม่ระบุ)" option, not be silently dropped. (Spec: UI)

---

### Task 1: Add the filter toolbar HTML and its supporting JS

This task adds new markup and new functions only — it doesn't yet change `renderOrdersTable()`, `renderAll()`, or `loadAllData()`. Nothing is wired together yet, so nothing should visibly change in the browser after this task (the toolbar renders but its dropdown option lists stay empty and typing in the search box does nothing) — that's expected, Task 2 wires it up.

**Files:**
- Modify: `index.html:270-272` (Orders tab — insert toolbar between the stats grid and the table card)
- Modify: `index.html:748` (add filter state variables after `budgetSpent`)
- Modify: `index.html:922` (add new functions immediately before `renderOrdersTable`, i.e. right after `hideLoadError`/`setRefreshing` — see exact anchor in Step 3)

**Interfaces:**
- Produces: `orderSearchText` (string), `orderSelectedMonth` (string), `orderSelectedStatuses`/`orderSelectedCategories`/`orderSelectedVendors` (each `Set|null`) — module-level state Task 2 will read. `populateOrderFilterOptions()`, `applyOrderFilters()` — Task 2 calls both. `onOrderSearchInput(value)`, `onOrderMonthChange(value)`, `onOrderStatusCheckboxChange(checkbox)`, `onOrderCategoryCheckboxChange(checkbox)`, `onOrderVendorCheckboxChange(checkbox)`, `selectAllOrderStatus()`/`clearAllOrderStatus()` (and the Category/Vendor equivalents), `resetOrderFilters()`, `toggleOrderFilterDropdown(panelId)` — all wired directly from the HTML `onclick`/`onchange` attributes below, no further wiring needed for these.

- [ ] **Step 1: Insert the filter toolbar HTML (was `index.html:270-272`, between the stats grid's closing `</div>` and the `<!-- Purchase Orders Table -->` comment)**

Replace:

```html
                </div>

                <!-- Purchase Orders Table -->
```

with:

```html
                </div>

                <!-- Orders Filter Toolbar -->
                <div class="bg-white p-4 rounded-xl border border-slate-200/60 shadow-sm flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
                    <div class="flex flex-wrap items-center gap-3">
                        <div class="relative w-full sm:w-64">
                            <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                                <i data-lucide="search" class="w-4 h-4"></i>
                            </span>
                            <input type="text" id="order-filter-search" oninput="onOrderSearchInput(this.value)" placeholder="ค้นหารายการ, เลขที่ PR/PO, รหัสพัสดุ..." class="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:outline-none text-sm transition-all">
                        </div>

                        <select id="order-filter-month" onchange="onOrderMonthChange(this.value)" class="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/50 focus:outline-none">
                            <option value="all">ทุกเดือน</option>
                        </select>

                        <div class="relative order-filter-dropdown">
                            <button type="button" onclick="toggleOrderFilterDropdown('order-filter-status-panel')" class="border border-slate-200 rounded-lg px-3 py-2 text-sm flex items-center space-x-1.5 hover:bg-slate-50 focus:ring-2 focus:ring-indigo-500/50 focus:outline-none">
                                <span>สถานะ</span>
                                <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-slate-400"></i>
                            </button>
                            <div id="order-filter-status-panel" class="hidden absolute z-20 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg">
                                <div class="flex justify-between items-center px-3 py-2 border-b border-slate-100">
                                    <button type="button" onclick="selectAllOrderStatus()" class="text-xs font-semibold text-indigo-600 hover:underline">เลือกทั้งหมด</button>
                                    <button type="button" onclick="clearAllOrderStatus()" class="text-xs font-semibold text-slate-500 hover:underline">ล้างทั้งหมด</button>
                                </div>
                                <div id="order-filter-status-options" class="max-h-48 overflow-y-auto py-1"></div>
                            </div>
                        </div>

                        <div class="relative order-filter-dropdown">
                            <button type="button" onclick="toggleOrderFilterDropdown('order-filter-category-panel')" class="border border-slate-200 rounded-lg px-3 py-2 text-sm flex items-center space-x-1.5 hover:bg-slate-50 focus:ring-2 focus:ring-indigo-500/50 focus:outline-none">
                                <span>ประเภทงาน</span>
                                <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-slate-400"></i>
                            </button>
                            <div id="order-filter-category-panel" class="hidden absolute z-20 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg">
                                <div class="flex justify-between items-center px-3 py-2 border-b border-slate-100">
                                    <button type="button" onclick="selectAllOrderCategory()" class="text-xs font-semibold text-indigo-600 hover:underline">เลือกทั้งหมด</button>
                                    <button type="button" onclick="clearAllOrderCategory()" class="text-xs font-semibold text-slate-500 hover:underline">ล้างทั้งหมด</button>
                                </div>
                                <div id="order-filter-category-options" class="max-h-48 overflow-y-auto py-1"></div>
                            </div>
                        </div>

                        <div class="relative order-filter-dropdown">
                            <button type="button" onclick="toggleOrderFilterDropdown('order-filter-vendor-panel')" class="border border-slate-200 rounded-lg px-3 py-2 text-sm flex items-center space-x-1.5 hover:bg-slate-50 focus:ring-2 focus:ring-indigo-500/50 focus:outline-none">
                                <span>ซัพพลายเออร์</span>
                                <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-slate-400"></i>
                            </button>
                            <div id="order-filter-vendor-panel" class="hidden absolute z-20 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg">
                                <div class="flex justify-between items-center px-3 py-2 border-b border-slate-100">
                                    <button type="button" onclick="selectAllOrderVendor()" class="text-xs font-semibold text-indigo-600 hover:underline">เลือกทั้งหมด</button>
                                    <button type="button" onclick="clearAllOrderVendor()" class="text-xs font-semibold text-slate-500 hover:underline">ล้างทั้งหมด</button>
                                </div>
                                <div id="order-filter-vendor-options" class="max-h-48 overflow-y-auto py-1"></div>
                            </div>
                        </div>

                        <button type="button" onclick="resetOrderFilters()" class="text-xs font-semibold text-slate-500 hover:text-rose-600 flex items-center space-x-1 px-2">
                            <i data-lucide="x" class="w-3.5 h-3.5"></i>
                            <span>ล้างตัวกรองทั้งหมด</span>
                        </button>
                    </div>

                    <p class="text-xs text-slate-500 whitespace-nowrap" id="order-filter-count">แสดง 0 จาก 0 รายการ</p>
                </div>

                <!-- Purchase Orders Table -->
```

- [ ] **Step 2: Add filter state variables (was `index.html:746-748`)**

Replace:

```javascript
        // Global variables for closed procure-to-pay loop simulation
        let budgetCap = 1200000;
        let budgetSpent = 168000; // Calculated baseline spent
```

with:

```javascript
        // Global variables for closed procure-to-pay loop simulation
        let budgetCap = 1200000;
        let budgetSpent = 168000; // Calculated baseline spent

        // Orders tab filter state. The 3 Sets start null and are populated on first
        // load (see populateOrderFilterOptions) to "select all" — they then persist
        // across manual refreshes rather than resetting.
        let orderSearchText = "";
        let orderSelectedMonth = "all";
        let orderSelectedStatuses = null;
        let orderSelectedCategories = null;
        let orderSelectedVendors = null;
```

- [ ] **Step 3: Add the filter functions, right after `hideLoadError`/`setRefreshing` (was `index.html:802-813`, immediately before `let showLowStockOnly = false;`)**

Find this exact block:

```javascript
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

        let showLowStockOnly = false;
```

Replace it with (unchanged content plus the new functions inserted between `setRefreshing` and `showLowStockOnly`):

```javascript
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

        const ORDER_FILTER_NO_VALUE_LABEL = "(ไม่ระบุ)";
        const ORDER_FILTER_MONTH_NAMES = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

        // Builds { distinct, selectedSet } for one order field: the sorted list of
        // real values present in purchaseOrders (blank -> "(ไม่ระบุ)"), and the
        // Set of currently-selected values (created as "select all" only the first
        // time this field is populated; an existing Set is returned unchanged so a
        // manual refresh doesn't wipe out the user's filter choices).
        function buildOrderFilterOptions(fieldName, existingSet) {
            const values = new Set();
            purchaseOrders.forEach(function (order) {
                const raw = (order[fieldName] || "").toString().trim();
                values.add(raw === "" ? ORDER_FILTER_NO_VALUE_LABEL : raw);
            });
            const distinct = Array.from(values).sort();
            const selectedSet = existingSet || new Set(distinct);
            return { distinct: distinct, selectedSet: selectedSet };
        }

        function renderOrderMultiSelectOptions(elementId, distinct, selectedSet, onChangeFnName) {
            const container = document.getElementById(elementId);
            if (!container) return;
            container.innerHTML = distinct.map(function (value) {
                const checked = selectedSet.has(value) ? "checked" : "";
                return '<label class="flex items-center space-x-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">' +
                    '<input type="checkbox" value="' + value + '" onchange="' + onChangeFnName + '(this)" ' + checked + '>' +
                    '<span>' + value + '</span>' +
                    '</label>';
            }).join("");
        }

        // Rebuilds the month dropdown and the 3 multi-select checkbox lists from
        // whatever is currently in purchaseOrders. Called once per loadAllData()
        // cycle, before applyOrderFilters() — never on every render, so a checkbox
        // click doesn't get its own list regenerated out from under it.
        function populateOrderFilterOptions() {
            const monthSet = new Set();
            purchaseOrders.forEach(function (order) {
                const parts = (order.date || "").split("/");
                if (parts.length === 3) monthSet.add(parts[0] + "/" + parts[2]);
            });
            const months = Array.from(monthSet).sort(function (a, b) {
                const aParts = a.split("/").map(Number);
                const bParts = b.split("/").map(Number);
                return aParts[1] !== bParts[1] ? aParts[1] - bParts[1] : aParts[0] - bParts[0];
            });
            if (months.indexOf(orderSelectedMonth) === -1) orderSelectedMonth = "all";
            const monthSelect = document.getElementById("order-filter-month");
            if (monthSelect) {
                monthSelect.innerHTML = '<option value="all">ทุกเดือน</option>' + months.map(function (m) {
                    const parts = m.split("/");
                    const selected = m === orderSelectedMonth ? "selected" : "";
                    return '<option value="' + m + '" ' + selected + '>' + ORDER_FILTER_MONTH_NAMES[Number(parts[0])] + ' ' + parts[1] + '</option>';
                }).join("");
            }

            const statusResult = buildOrderFilterOptions("status", orderSelectedStatuses);
            orderSelectedStatuses = statusResult.selectedSet;
            renderOrderMultiSelectOptions("order-filter-status-options", statusResult.distinct, orderSelectedStatuses, "onOrderStatusCheckboxChange");

            const categoryResult = buildOrderFilterOptions("category", orderSelectedCategories);
            orderSelectedCategories = categoryResult.selectedSet;
            renderOrderMultiSelectOptions("order-filter-category-options", categoryResult.distinct, orderSelectedCategories, "onOrderCategoryCheckboxChange");

            const vendorResult = buildOrderFilterOptions("vendor", orderSelectedVendors);
            orderSelectedVendors = vendorResult.selectedSet;
            renderOrderMultiSelectOptions("order-filter-vendor-options", vendorResult.distinct, orderSelectedVendors, "onOrderVendorCheckboxChange");

            lucide.createIcons();
        }

        function onOrderSearchInput(value) {
            orderSearchText = value;
            applyOrderFilters();
        }

        function onOrderMonthChange(value) {
            orderSelectedMonth = value;
            applyOrderFilters();
        }

        function onOrderStatusCheckboxChange(checkbox) {
            if (checkbox.checked) orderSelectedStatuses.add(checkbox.value);
            else orderSelectedStatuses.delete(checkbox.value);
            applyOrderFilters();
        }

        function onOrderCategoryCheckboxChange(checkbox) {
            if (checkbox.checked) orderSelectedCategories.add(checkbox.value);
            else orderSelectedCategories.delete(checkbox.value);
            applyOrderFilters();
        }

        function onOrderVendorCheckboxChange(checkbox) {
            if (checkbox.checked) orderSelectedVendors.add(checkbox.value);
            else orderSelectedVendors.delete(checkbox.value);
            applyOrderFilters();
        }

        function selectAllOrderStatus() {
            document.querySelectorAll('#order-filter-status-options input[type="checkbox"]').forEach(function (cb) {
                cb.checked = true;
                orderSelectedStatuses.add(cb.value);
            });
            applyOrderFilters();
        }

        function clearAllOrderStatus() {
            document.querySelectorAll('#order-filter-status-options input[type="checkbox"]').forEach(function (cb) { cb.checked = false; });
            orderSelectedStatuses.clear();
            applyOrderFilters();
        }

        function selectAllOrderCategory() {
            document.querySelectorAll('#order-filter-category-options input[type="checkbox"]').forEach(function (cb) {
                cb.checked = true;
                orderSelectedCategories.add(cb.value);
            });
            applyOrderFilters();
        }

        function clearAllOrderCategory() {
            document.querySelectorAll('#order-filter-category-options input[type="checkbox"]').forEach(function (cb) { cb.checked = false; });
            orderSelectedCategories.clear();
            applyOrderFilters();
        }

        function selectAllOrderVendor() {
            document.querySelectorAll('#order-filter-vendor-options input[type="checkbox"]').forEach(function (cb) {
                cb.checked = true;
                orderSelectedVendors.add(cb.value);
            });
            applyOrderFilters();
        }

        function clearAllOrderVendor() {
            document.querySelectorAll('#order-filter-vendor-options input[type="checkbox"]').forEach(function (cb) { cb.checked = false; });
            orderSelectedVendors.clear();
            applyOrderFilters();
        }

        function resetOrderFilters() {
            orderSearchText = "";
            const searchInput = document.getElementById("order-filter-search");
            if (searchInput) searchInput.value = "";
            orderSelectedMonth = "all";
            const monthSelect = document.getElementById("order-filter-month");
            if (monthSelect) monthSelect.value = "all";
            selectAllOrderStatus();
            selectAllOrderCategory();
            selectAllOrderVendor();
        }

        function toggleOrderFilterDropdown(panelId) {
            ["order-filter-status-panel", "order-filter-category-panel", "order-filter-vendor-panel"].forEach(function (id) {
                const panel = document.getElementById(id);
                if (!panel) return;
                if (id === panelId) panel.classList.toggle("hidden");
                else panel.classList.add("hidden");
            });
        }

        document.addEventListener("click", function (e) {
            if (e.target.closest(".order-filter-dropdown")) return;
            ["order-filter-status-panel", "order-filter-category-panel", "order-filter-vendor-panel"].forEach(function (id) {
                const panel = document.getElementById(id);
                if (panel) panel.classList.add("hidden");
            });
        });

        // applyOrderFilters() is defined in Task 2, once renderOrdersTable() accepts
        // a filtered array to render.

        let showLowStockOnly = false;
```

- [ ] **Step 4: Verify in the browser**

Open `index.html`. Switch to the Orders tab: the toolbar renders (search box, "ทุกเดือน" dropdown, Status/ประเภทงาน/ซัพพลายเออร์ buttons, "ล้างตัวกรองทั้งหมด", "แสดง 0 จาก 0 รายการ"). Click each dropdown button — its panel opens showing empty option lists (expected, `populateOrderFilterOptions()` isn't called yet) and closes when you click elsewhere or another dropdown. Open the browser console: confirm no errors (there will be a `applyOrderFilters is not defined` error IF something accidentally calls it already — there shouldn't be, since nothing calls these new functions yet except each other's internal calls, which won't fire without user interaction). Typing in the search box should not error even though nothing shows.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: add Orders tab filter toolbar UI and filtering functions (not yet wired)"
```

---

### Task 2: Wire the filter into rendering and data loading

**Files:**
- Modify: `index.html:923-964` (`renderOrdersTable` — accept a parameter, keep stat cards reading the full array)
- Modify: `index.html:865-877` (`renderAll` — one line)
- Modify: `index.html:759-781` (`loadAllData` — one line)
- Modify: `index.html` (add `applyOrderFilters()` where Task 1 Step 3 left the placeholder comment)

**Interfaces:**
- Consumes: `orderSearchText`, `orderSelectedMonth`, `orderSelectedStatuses`, `orderSelectedCategories`, `orderSelectedVendors`, `populateOrderFilterOptions()` (all from Task 1).
- Produces: `applyOrderFilters()` — called by every filter control from Task 1, and by nothing else. `renderOrdersTable(orders)` — now takes the array to render as its one parameter.

- [ ] **Step 1: Change `renderOrdersTable()` to accept the orders to render, keep stat cards on the full array (was `index.html:923-964`)**

Replace:

```javascript
        function renderOrdersTable() {
            const tbody = document.getElementById("orders-table-body");
            tbody.innerHTML = "";

            purchaseOrders.forEach(order => {
```

with:

```javascript
        function renderOrdersTable(orders) {
            const tbody = document.getElementById("orders-table-body");
            tbody.innerHTML = "";

            orders.forEach(order => {
```

(the rest of the `forEach` body — the `statusColor` logic and the `tbody.innerHTML += ...` row template — is unchanged). Then replace the 3 stat-card lines at the end of the same function (was `index.html:958-960`):

```javascript
            const pOrders = purchaseOrders.filter(o => o.status === "รอดำเนินการ" || o.status === "Pending").length;
            const sOrders = purchaseOrders.filter(o => o.status === "กำลังจัดส่ง" || o.status === "DEL.").length;
            const rOrders = purchaseOrders.filter(o => o.status === "ได้รับแล้ว" || o.status === "RECEIVED").length;
```

with (identical — confirming these keep reading `purchaseOrders`, the full array, not the `orders` parameter):

```javascript
            // Stat cards always reflect the full, unfiltered data set — not the filtered view.
            const pOrders = purchaseOrders.filter(o => o.status === "รอดำเนินการ" || o.status === "Pending").length;
            const sOrders = purchaseOrders.filter(o => o.status === "กำลังจัดส่ง" || o.status === "DEL.").length;
            const rOrders = purchaseOrders.filter(o => o.status === "ได้รับแล้ว" || o.status === "RECEIVED").length;
```

- [ ] **Step 2: Add `applyOrderFilters()` at the placeholder comment left in Task 1 Step 3**

Replace:

```javascript
        // applyOrderFilters() is defined in Task 2, once renderOrdersTable() accepts
        // a filtered array to render.
```

with:

```javascript
        function applyOrderFilters() {
            const search = orderSearchText.trim().toLowerCase();

            const filteredOrders = purchaseOrders.filter(function (order) {
                if (search) {
                    const haystack = [order.itemName, order.prNo, order.poNo, order.matCode].join(" ").toLowerCase();
                    if (haystack.indexOf(search) === -1) return false;
                }

                if (orderSelectedMonth !== "all") {
                    const parts = (order.date || "").split("/");
                    const orderMonth = parts.length === 3 ? parts[0] + "/" + parts[2] : "";
                    if (orderMonth !== orderSelectedMonth) return false;
                }

                const statusValue = (order.status || "").trim() || ORDER_FILTER_NO_VALUE_LABEL;
                if (orderSelectedStatuses && !orderSelectedStatuses.has(statusValue)) return false;

                const categoryValue = (order.category || "").trim() || ORDER_FILTER_NO_VALUE_LABEL;
                if (orderSelectedCategories && !orderSelectedCategories.has(categoryValue)) return false;

                const vendorValue = (order.vendor || "").trim() || ORDER_FILTER_NO_VALUE_LABEL;
                if (orderSelectedVendors && !orderSelectedVendors.has(vendorValue)) return false;

                return true;
            });

            renderOrdersTable(filteredOrders);

            const counterEl = document.getElementById("order-filter-count");
            if (counterEl) counterEl.innerText = "แสดง " + filteredOrders.length + " จาก " + purchaseOrders.length + " รายการ";
        }
```

- [ ] **Step 3: Make `renderAll()` render Orders through the filter (was `index.html:865-877`, one line changed)**

Replace:

```javascript
        function renderAll() {
            renderStockTable();
            renderOrdersTable();
            renderRFQTable();
```

with:

```javascript
        function renderAll() {
            renderStockTable();
            applyOrderFilters();
            renderRFQTable();
```

- [ ] **Step 4: Populate filter options right after new order data loads (was `index.html:769-775`)**

Replace:

```javascript
                stockParts = data.stock || [];
                rfqList = data.requests || [];
                quoteHistory = data.quotes || [];
                projectsBudget = data.budget || [];
                purchaseOrders = data.orders || [];

                renderAll();
```

with:

```javascript
                stockParts = data.stock || [];
                rfqList = data.requests || [];
                quoteHistory = data.quotes || [];
                projectsBudget = data.budget || [];
                purchaseOrders = data.orders || [];

                populateOrderFilterOptions();
                renderAll();
```

- [ ] **Step 5: Verify in the browser**

Open `index.html`, wait for real data to load, switch to the Orders tab.

Expected:
1. The "แสดง N จาก M รายการ" counter shows the same number twice initially (e.g. "แสดง 369 จาก 369 รายการ") — everything selected by default.
2. Status/ประเภทงาน/ซัพพลายเออร์ dropdowns now list the real distinct values (RECEIVED, Pending, DEL., Cancle for Status; JIG & FIXTURE, ACCES, MAINTENANCE, PROJECT, "(ไม่ระบุ)" for Category; the real vendor names plus "(ไม่ระบุ)" for Vendor) — all checked by default.
3. Type a known item name fragment into search — table narrows, counter updates, stat cards at the top do NOT change.
4. Pick a specific month — table narrows to that month only.
5. Uncheck "RECEIVED" in the Status dropdown — table drops those rows; stat cards still unchanged.
6. Click "ล้างทั้งหมด" in any dropdown — table becomes empty for that dimension (0 rows), counter shows "แสดง 0 จาก 369 รายการ".
7. Click "ล้างตัวกรองทั้งหมด" — search clears, month resets to "ทุกเดือน", all 3 multi-selects fully re-check, table returns to all 369 rows.
8. Set some filters (e.g. uncheck one status), then click "รีเฟรชข้อมูล" — after the refresh completes, confirm the same filters are still applied (not reset to "all").
9. No console errors throughout.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: wire search/month/status/category/vendor filters into Orders tab rendering"
```

---

## Self-Review Notes

- **Spec coverage:** UI (Task 1 Step 1), state + population + interaction functions (Task 1 Steps 2-3), AND-combination filtering logic and stat-card independence (Task 2 Steps 1-2), `renderAll`/`loadAllData` wiring so filters persist across refresh (Task 2 Steps 3-4) — all spec sections covered.
- **Placeholder scan:** none — the one intentional "placeholder comment" in Task 1 Step 3 is explicitly replaced by Task 2 Step 2, not left dangling.
- **Type consistency:** `renderOrdersTable(orders)`'s parameter name and the `orders.forEach` body match between Task 2 Step 1's edit and the unchanged row-template code already in the file; `applyOrderFilters()` in Task 2 Step 2 calls `renderOrdersTable(filteredOrders)` using the same signature Task 2 Step 1 establishes.
