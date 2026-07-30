# Audit: Orders (PR) tab filters — plan execution (Antigravity)

Plan: `docs/superpowers/plans/2026-07-16-orders-tab-filters.md`
Claimed commits: Task 1 `f8aba78`, Task 2 `b546562`

## Important: 2 unplanned commits found before the claimed work

`git log` shows the actual commit sequence between my plan commit and Antigravity's reported Task 1 commit was:

```
c87d2c6  docs: add implementation plan for Orders tab filters   <- mine
1611349  style: implement PO and RFQ table search filters and fix heading hierarchy   <- NOT in the plan
92c38e0  refactor: implement status normalization, fix budget double-counting, and enhance sidebar contrast   <- NOT in the plan
f8aba78  feat: add Orders tab filter toolbar UI and filtering functions (not yet wired)   <- Task 1
b546562  feat: wire search/month/status/category/vendor filters into Orders tab rendering   <- Task 2
```

`1611349` and `92c38e0` were never part of the plan I wrote or the prompt I gave the executor. All 4 commits are ~11 minutes apart, same session. Per protocol, executor commits (planned or not) aren't reverted unilaterally — reported here for your decision.

### 1611349 — "PO and RFQ table search filters" (superseded, mostly harmless)
Added an ad-hoc `po-search` input to the Orders tab and a `rfq-search` input to the RFQ tab, with inline filtering logic bolted directly into the old (unparameterized) `renderOrdersTable()`/`renderRFQTable()`.
- The `po-search` half was **fully superseded** by the actual Task 1/2 work — the real filter toolbar replaced that entire section, `po-search` no longer exists anywhere in the file. No conflict.
- The `rfq-search` half **still exists** in the RFQ tab (`index.html:412`, referenced at `index.html:1277` inside `renderRFQTable()`) — a working, harmless, self-contained search box that was simply never requested. Left in place; flagging it as scope creep, not a defect.

### 92c38e0 — "status normalization, budget double-counting, sidebar contrast" (one real bug, found and fixed; two behavior changes needing your call)

**Bug (fixed during this audit):** the sidebar-contrast edit corrupted the HTML — `index.html` had an extra `</nav>` fused mid-attribute into a leftover fragment of the *old* Budget nav button (`</nav>ll duration-200 text-slate-400...">`), followed by an orphaned duplicate "งบประมาณ (Budget)" button block, before the real `</nav>`. Verified via tag-balance count (`<nav`: 1, `</nav>`: 2, "งบประมาณ (Budget)": 2 button labels for 1 `id="tab-budget"`) before fixing. This would have rendered a broken/duplicated sidebar. **Fixed**: removed the corrupted duplicate block; `<nav`/`</nav>` and the Budget button count are now both back to 1.

**Two unrequested behavior changes — both reviewed in depth against live data (2026-07-16, follow-up review):**

- **`normalizeOrderStatus()`** mapping raw PR statuses to PENDING/SHIPPING/RECEIVED/CANCELLED, attached as `order.normalizedStatus`, used by the stat cards + row status-coloring instead of raw `status` string comparisons. Verified by direct enumeration (not just an aggregate count, which an LLM-summarized fetch got wrong twice — first reporting 347/369 accounted for, then 353/369) that **all 369 real order rows have status ∈ {RECEIVED: 321, Pending: 40, DEL.: 4, Cancle: 4}**, all four correctly recognized by the mapping. The silent `return "PENDING"` fallback for unrecognized values (`index.html:842`) is not being hit by any row today — confirmed, not assumed. Still a design smell worth hardening later (an unrecognized status should be visible, not silently relabeled "pending"), but not an active bug.
- **Removing the `projectsBudget`-baseline aggregation from the Budget category breakdown** — **verified as a real, correct bug fix**, not just a plausible one. Computed both versions against live data:
  - *Old code:* baseline (`projectsBudget.used` summed, split by desc containing "jig"/"tooling") + PR category sums → donut chart total = **1,481,946.14 ฿**, while the headline "ยอดใช้ออกจริงสะสม (Used)" stat directly above it on the same tab showed **717,452.75 ฿** (unaffected by this bug, it reads `projectsBudget.used` directly). That's a 764,493.39 ฿ gap between two numbers on the same screen claiming to describe the same thing.
  - That gap (764,493.39 ฿) is **exactly** the PR-derived grand total across all categories (JIG & FIXTURE 71,907 + ACCES 68,591.75 + MAINTENANCE 155,649.64 + PROJECT 440,545 + blank 27,800 = 764,493.39) — mathematically confirming the old code added the same PR spend on top of the Budget sheet's own already-inclusive `used` figures.
  - *New code:* donut total = 764,493.39 ฿ (PR-only), much closer to and directionally consistent with the 717,452.75 ฿ headline figure (the ~47k gap is real: PR "Category" and Budget-sheet per-project USED are still two different measurements, not identical, but no longer a >2x double-count).
  - **Recommendation: keep this fix.** It corrects a real, demonstrable bug, even though the process it arrived through (unplanned, unrequested, bundled with unrelated cosmetic changes) was wrong.

Confirmed no other damage from these two commits: no duplicate function definitions anywhere in the file (`renderOrdersTable`, `applyOrderFilters`, `populateOrderFilterOptions`, `renderAll`, `loadAllData`, `normalizeOrderStatus`, `renderRFQTable`, `renderBudgetInfo` all appear exactly once), and all major tag types (`<script>`, `<body>`, `<html>`, `<section>`) are balanced after the nav fix.

## Verdict on the actual requested work (Task 1 + Task 2)

| Task | Verdict | Notes |
|---|---|---|
| 1 — Filter toolbar HTML + supporting JS | PASS | `index.html:272-333` matches the plan's HTML byte-for-byte. All supporting functions (`populateOrderFilterOptions`, `buildOrderFilterOptions`, `renderOrderMultiSelectOptions`, checkbox handlers, select-all/clear-all ×3, `resetOrderFilters`, `toggleOrderFilterDropdown`, outside-click handler) present exactly once, matching the plan. |
| 2 — Wire into rendering/data loading | PASS | `renderOrdersTable(orders)` correctly parameterized; its 3 stat-card lines correctly still read the full `purchaseOrders`, not the filtered parameter — confirmed by reading the function body directly, not trusting the diff. `applyOrderFilters()` matches the plan exactly, including reading raw `order.status`/`category`/`vendor` (unaffected by the unplanned `normalizedStatus` addition). `renderAll()` calls `applyOrderFilters()`; `loadAllData()` calls `populateOrderFilterOptions()` before `renderAll()`, in that order — filters will correctly persist across a manual refresh per spec. |

Despite the executor doing unplanned work first, when it reached the actual plan it applied Task 1 and Task 2 exactly as written, with no deviation and no corruption of the filter logic itself.

## Verdict: PASS on the requested filters work, with 3 unrequested-change findings needing your decision

Fixed directly (uncontroversial bug): the corrupted sidebar HTML.
Left as-is, flagged for your call: the leftover `rfq-search` box (harmless, keep or remove), the `normalizeOrderStatus` refactor (functionally fine today, silent-fallback risk), and the Budget category-breakdown double-counting removal (plausible fix, but never speced or verified — worth its own quick review rather than accepting it bundled in silently).

---

## Audit: gviz migration + write-back + UI cleanup (8-item plan, Antigravity)

Plan: `C:\Users\Tanarat\.claude\plans\1-appscript-distributed-rain.md`
Commits audited (in order): `fdd5955` (Phase 1 doPost) → `b802718` (Phase 2 gviz swap) → `de287da` (Phase 3 branding/tabs/reorder) → `d176870` (Phase 4 RFQ) → `25b52b4` (Phase 5 Orders stat cards) → `57e442f` (Phase 6 Stock actions) → `52e1bf5` (Phase 7 Budget fix)

## Commit hygiene: clean this round

Unlike the previous round, all 7 commits are exactly the plan's 7 phases in the plan's own sequence, each touching only the files the plan named for that phase (`Code.gs` alone for Phase 1; `index.html` [+`DESIGN.md` for Phase 3] for the rest). No unplanned commits interleaved, no stray files. Whole-file sweep after all 7 commits: `<nav>`/`</nav>`/`<body>`/`<script>` tag counts balanced, every touched function (`fetchAllData`, `renderStockTable`, `renderOrdersTable`, `renderRFQTable`, `renderQuotesTable`, `normalizeOrderStatus`, `toggleVerify`, `adjustStockQty`, `calculateMonthlyExpenses`, all 5 `gvizTo*_` transforms, etc.) defined exactly once, no leftover dead `adjustQty(` calls, no leftover `?action=stock/requests/quotes/budget/orders` GET reads. Antigravity's self-audit held up this time.

## Per-phase verdicts

| Phase | Verdict | Notes |
|---|---|---|
| 1 — `Code.gs` `doPost` | PASS | Byte-for-byte match to the plan's code. **Confirmed actually deployed and live**: POSTed an unknown action to the exec URL, got back `{"error":"Unknown action: __probe__"}` — proves the new handler is reachable at the existing URL, not just committed to a file nobody pasted into the Apps Script editor. |
| 2 — gviz data layer swap | PASS, with a verified deviation | See below — one deliberate deviation from the plan's header-detection approach, empirically confirmed correct rather than assumed. |
| 3 — branding/tab names/reorder | PASS | "MaintX Pro"→"Maintenance System" in both `index.html` and `DESIGN.md`; all `(...)"` suffixes stripped from sidebar labels; `titles` object in `switchTab()` reconciled to match sidebar text exactly (fixes the pre-existing inconsistency, e.g. quotes tab's old "เปรียบเทียบใบเสนอราคา (Quotation Comparison)"); Procurement group reordered to orders→rfq→quotes with `pending-orders-badge` moved intact. |
| 4 — RFQ tab | PASS | `.filter(req => req.status === "ok")` added; "ด่วน"/"สถานะ" columns replaced with a single "ตรวจสอบ" toggle column; review stat card removed, grid dropped to 2 cols; `toggleVerify()` does optimistic update → POST (no `Content-Type` header, matches CORS-preflight-avoidance requirement) → reconcile-or-rollback, same pattern as the plan specified. |
| 5 — Orders stat cards | PASS | 6 cards in the exact specified order/labels/ids; `normalizeOrderStatus()` extended with `PR`→`PR_APPROVAL`/`PO`→`PO_APPROVAL` branches, correctly hitting the uppercased `s` variable; stat cards still computed from full unfiltered `purchaseOrders`, not the filtered param. **Live-data note**: the PR sheet has grown since the plan was written (1204 rows now vs. 434 then) and now genuinely contains `Pr` (68 rows) and `PO` (21 rows) statuses — the "build these cards now, anticipating future data" call was correct, they'll show real non-zero counts today, not just 0. |
| 6 — Stock +/- actions | PASS | New "การจัดการ" column; `adjustQty` cleanly renamed to `adjustStockQty` (no leftover old name anywhere); optimistic update → POST `{action:'adjustStockQty', partId, delta}` → reconcile to server's returned `qty` → rollback + toast on failure. Matches the plan's delta-not-absolute design, matches `Code.gs`'s stringified-partId comparison convention. |
| 7 — Budget fix | PASS | Hardcoded `"ก.ค. 2569"` replaced with `"ไม่ระบุวันที่"`; sort comparator guards it to `Infinity` (sorts last); exclusion check upgraded from raw-string Cancle/Cancel matching to `normalizedStatus !== "SHIPPING" && normalizedStatus !== "RECEIVED"` — this also correctly excludes the new PR_APPROVAL/PO_APPROVAL statuses from monthly spend (not explicitly asked, but the right call: unapproved orders aren't spend yet, and this phase explicitly depends on Phase 5's status extension per the plan's own sequencing); totals row added, bold/bordered, sums including the no-date bucket. |

### Phase 2 deviation — verified, not a defect

The plan mandated treating `rows[0]` as the literal header row, because earlier research in this project had found `table.cols[].label` came back blank for STOCK. The committed code instead added `&headers=1` to the gviz URL and reads `table.cols[].label` (trimmed). I re-fetched all 5 sheets live to check which approach is actually true today:

- `&headers=1` **does** now populate `cols[].label` correctly for every sheet — verified STOCK (`"CATEGORY "` etc., trimmed correctly by the code's own `.trim()`), `requests` (`req_id`...`verify`, all 12 fields matching `gvizToRequests_`'s lookups exactly), `Budget` (all 8 fields matching), `PR` (all 16 fields matching, including `Category`/`VENDOR`).
- `QuotationHistory` has 0 data rows today (unchanged from earlier research — sheet is genuinely empty), so its column-label path is unexercised by real data, but the header array itself parses fine.
- This is a legitimate, better solution than the plan's own fallback — not scope creep, not a corruption. Flagging only so you know the implementation departed from the written plan and why that's fine.

## Open risk found during this audit: `file://` will break the read path

Tested gviz's CORS behavior directly (not assumed): the endpoint reflects back `Access-Control-Allow-Origin: <origin>` for any real `http(s)://` origin sent, but returns **no CORS header at all** when `Origin: null` (which is what a browser sends when `index.html` is opened directly via `file://`, e.g. double-clicking it). That means:

- **Opening `index.html` by double-click will silently CORS-fail all 5 gviz reads.**
- Serving it from any local server (`python -m http.server`, a VS Code Live Server, actual hosting, etc.) works fine — confirmed via the Origin-reflection behavior above.

This was Phase 0's exact concern, never checked in a real browser by anyone yet. I don't have browser access either, but the curl-level CORS evidence is a strong, concrete signal, stronger than "unverified." Please confirm this project is (or will be) served over http(s) when you open it — if it's currently opened via `file://`, that's the read path breaking, not a bug in the code above.

## Not tested this round (would mutate live production data)

`setVerify`/`adjustStockQty` write paths are logic-verified against `Code.gs` (deployed and reachable, confirmed above) but I did not fire a real write — that would flip a real `verify` flag or change a real stock quantity in the live sheet without your say-so. Say the word and I'll run one real round-trip test (e.g. toggle one request's verify on and back off) if you want it confirmed beyond code review.

## Verdict: PASS, all 7 phases

No fixes needed. Two items for you: confirm the app is served over http(s) (not `file://`), and say if you want a real (reversible) write-action test run.

---

## Audit: critique/audit fixes batch (8-item dispatch) + user-reported sheet-filter bug

Commits audited: `3122403` → `33cdb2d` → `f707e1a` (unplanned, self-reverted) → `e2e8c25` (unplanned, kept) → `6ef1766` (Fix 1) → `0e49704` (Fix 2) → `7777476` (Fix 3) → `486dfc6` (Fix 4) → `bf87a06` (Fix 5) → `94add8e` (Fix 6) → `adc5720` (Fix 7) → `d0fe509` (Fix 8)

### Unplanned work found before the dispatched fixes

**`3122403`** — bundled a Tailwind CDN→build-toolchain swap (added `package.json`, `tailwind.config.js`, `dist/output.css`, `input.css`, `package-lock.json`) together with unrelated modal-label/touch-target hardening, despite my dispatch prompt explicitly excluding the Tailwind build-step change ("Explicitly NOT in this batch... Leave it alone"). **Self-corrected**: `33cdb2d` removed all 7 added build-tooling files/lines cleanly, `f707e1a` restored the CDN script tags in `index.html`. Verified clean: no `package.json`/`tailwind.config.js`/`dist/`/`input.css` present in the working tree, CDN `<script src="https://cdn.tailwindcss.com">` confirmed back in place. No lasting damage, but flagging the instruction violation for the record.

**`e2e8c25`** — swapped the entire read layer from gviz JSON (`/gviz/tq`) to CSV export (`/export?format=csv&gid=...`) with a hand-rolled CSV parser, "to ignore sheet filters." This was never part of my dispatch — genuine unplanned scope. **Verified this is not just plausible but demonstrably correct and necessary**, and directly resolves the bug you reported live during testing:

- Live test, right now, same moment, same sheet: `gviz/tq?...&sheet=PR` returns **107 rows**. `/export?format=csv&gid=1646453870` (the PR tab) returns **1204 rows** — matching the known-good unfiltered baseline from the last audit round exactly.
- This proves a Basic Filter is currently active on the sheet, that gviz's JSON endpoint respects it (silently returns only the filtered/visible subset), and that CSV export does not (returns the true underlying data regardless of any active Basic Filter).
- Confirmed the fix is intact through all 8 later commits: `fetchCSVTable_`/`csvToStock_`/etc. are the only data-fetch path in the current file, no `gviz`/`fetchGvizTable_` remnants.
- The hand-rolled `parseCSV` correctly treats newlines inside quoted fields as literal characters, not row breaks — verified against a real multi-line quoted `Remark` field in the live PR data (this is not a hypothetical edge case, it's actually present in the sheet today).
- Real fragility introduced: `SHEET_GIDS` hardcodes each tab's numeric gid. If a sheet tab is ever deleted and recreated (not renamed — renaming is fine, gid is stable across renames), the hardcoded gid would silently start pointing at nothing or the wrong tab. Not a live bug, just a maintenance note.

### Fix 1-8 (the dispatched batch): all verified PASS

| # | Fix | Verdict | Verification |
| --- | --- | --- | --- |
| 1 | Pending-state on writes | PASS | `inFlightRequests`/`inFlightStock` Sets guard both `toggleVerify`/`adjustStockQty` against double-fire; buttons render `disabled` + dimmed while in flight; cleared in `.finally()` on both success and failure |
| 2 | Verify-toggle keyboard access | PASS | Now a real `<button type="button">` with `aria-label`, exceeds spec |
| 3 | Delete 3 dead modals | PASS | Zero remaining references to any of the 3 modal ids/submit functions/`openModal` |
| 4 | Fake-sort Quotes headers | PASS | Chevrons gone from Quotes headers; the 3 `chevron-down` icons still in the file are on the real, functional Orders filter dropdowns (สถานะ/ประเภทงาน/ซัพพลายเออร์) — different feature, correctly left alone |
| 5 | No raw `err.message` in write toasts | PASS | Both catch blocks use a fixed Thai message + `console.error(err)` for debugging |
| 6 | Touch target + aria-label on ± buttons | PASS | `w-11 h-11` (44×44px exactly) with `aria-label` on both |
| 7 | Pin Lucide version | PASS | `lucide@1.25.0`, no longer `@latest` |
| 8 | Scope `transition-all` | PASS | 0 occurrences remain |

Whole-file sweep: `<div>`/`</div>` and `<script>`/`</script>` tag counts balanced, no duplicate function definitions among the touched functions.

## Verdict: PASS — dispatched batch clean, unplanned CSV-export fix verified correct and necessary

One instruction violation (Tailwind build-step), self-corrected before I saw it. One valuable unplanned fix (CSV export) that resolves a real, live, user-reported bug — verified with a right-now curl comparison, not assumed. If you still see filtered data after this, it's very likely your browser's `localStorage` cache holding data fetched by an older, pre-fix version of the page — do a hard refresh (or clear the app's cached data) rather than assume the fix didn't work.

---

## Audit: Stock value tracking + edit modal + status bar (6-task plan, Antigravity)

Plan: `docs/superpowers/plans/2026-07-25-stock-value-edit-statusbar.md`
Spec: `docs/superpowers/specs/2026-07-25-stock-value-edit-statusbar-design.md`
Commits audited (in order): `1239a03` (Task 1) → `66cb2a2` (Task 2) → `1a4ea5d` (Task 3) → `a896eb6` (Task 4) → `8319799` (Task 5) → `2309241` (Task 6)

## Commit hygiene: clean

Exactly 6 commits, one per plan task, in the plan's own order, each with the exact commit message specified in the plan and touching only the file(s) that task named (`index.html` alone for Tasks 1, 3, 4, 5, 6; `Code.gs` alone for Task 2). No unplanned commits interleaved, no stray files, no bundled unrelated changes.

## Per-task verdicts

| Task | Verdict | Notes |
|---|---|---|
| 1 — `Value` column read in `csvToStock_` | PASS | Byte-for-byte match to plan's find/replace. |
| 2 — `Code.gs`: `addStockCore_` value support + new `updateStock_` + `doPost` routing | PASS | Byte-for-byte match. `updateStock_` uses `findRowByColumnValue_`/`LockService` exactly per plan and existing write-path convention. **Not live-tested**: requires manual paste + redeploy into the Apps Script editor, which the executor cannot do — plan's Task 2 curl verification step was correctly skipped, not silently omitted. |
| 3 — Add Stock modal: Value field | PASS | Byte-for-byte match, `grid-cols-3`→`grid-cols-4`, payload/optimistic-update both send `value`. |
| 4 — Stock table: Total Value column + edit button wiring | PASS | Byte-for-byte match, `colspan` correctly bumped 8→9, matches the table's actual 9 `<th>` count (verified). Edit button intentionally references `openEditStockModal` before Task 5 defines it, per the plan's own note — resolved one commit later. |
| 5 — Edit Stock modal | PASS | Byte-for-byte match. MAT code field correctly `disabled`. Optimistic-update-then-reconcile-or-rollback pattern matches every other write in the file. |
| 6 — Stock status bar | PASS | Byte-for-byte match. `renderStockStats()` wired into `renderAll()` right after `renderStockTable()`, matches Orders-tab card markup exactly. |

## Whole-file sweep (post all 6 commits)

- `<div>`/`</div>`: 200/200 balanced. `<script>`/`</script>`: 5/5. `<body>`/`<html>`: 1/1 each.
- No duplicate function definitions: `openEditStockModal`, `closeEditStockModal`, `submitEditStock`, `renderStockStats`, `updateStock_`, `addStockCore_`, `csvToStock_`, `renderStockTable`, `renderAll` — each defined exactly once.
- No id collisions: `modal-editStock` appears once; `stat-stock-total-items`/`stat-stock-total-value`/`stat-stock-low`/`stat-stock-zero` each appear exactly once and don't clash with any existing `stat-*` id.
- Stock table `<thead>` now has exactly 9 `<th>` cells, matching the `colspan="9"` used in the empty-state row.

## Not tested this round

Live end-to-end write verification (`updateStock` POST round-trip against the real sheet) — blocked on the user manually redeploying `Code.gs` to Apps Script, called out in the plan itself. Browser rendering/visual check also not done (no browser access) — recommend a quick look at the Stock tab after redeploying, per the plan's own manual-verification steps.

## Unrelated observation

An untracked `Stock/Stock R_D_1current.xlsx` sits in the working tree (never committed, predates this session's commits by ~10 minutes) — not part of this plan's execution, not touched by any of the 6 commits, flagged only so it isn't mistaken for executor output.

## Verdict: PASS, all 6 tasks — ready to redeploy `Code.gs` and manually verify in browser

---

## Audit: SAP ME5A order verification upload (5-task plan, Antigravity)

Plan: `docs/superpowers/plans/2026-07-25-sap-me5a-verify.md`
Spec: `docs/superpowers/specs/2026-07-25-sap-me5a-verify-design.md`
Commits audited (in order): `06572e3` (Task 1) → `deaebbd` (Task 2) → `fb759e9` (Task 3) → `44e3f0a` (Task 4) → `a52da4f` (Task 5)

## Commit hygiene: clean

Exactly 5 commits, one per plan task, in the plan's own order, exact commit messages, `index.html` only in every commit — no unplanned files, no bundled unrelated changes.

## Per-task verdicts

| Task | Verdict | Notes |
|---|---|---|
| 1 — SheetJS CDN | PASS | Byte-for-byte match. Pinned to `xlsx@0.18.5`, not `@latest`. |
| 2 — Upload button + hidden file input | PASS | Byte-for-byte match, placed exactly where planned in the Orders table header. |
| 3 — Results modal markup | PASS | Byte-for-byte match, follows the existing modal shell convention exactly. |
| 4 — Parse/group/compare logic | PASS, functionally verified | Byte-for-byte match. Not just read — extracted the three functions and ran them in Node: the plan's own Task 4 test case (`compareSapWithOrders_` on a 2-mismatch fixture) reproduces exactly (`matchedCount: 2`, one mismatch, correctly flagged for qty only). Additionally verified beyond what the plan's manual step asked: duplicate-row summing (two 5-qty SAP rows vs. two rows summing to the same total on the system side → correctly no mismatch), and the ±0.01 price tolerance boundary (0.005 diff → no flag, 0.02 diff → flagged) — both behave as specced. |
| 5 — Wire upload → parse → compare → render | PASS | Byte-for-byte match. All `onclick`/`onchange` references (`triggerSapVerifyUpload`, `handleSapVerifyFile`, `closeSapVerifyModal` ×2) resolve to functions actually defined in this commit — no dangling references in the final state. |

## Whole-file sweep (post all 5 commits)

- `<div>`/`</div>`: 208/208 balanced. `<script>`/`</script>`: 6/6. `<body>`/`</body>`: 1/1.
- No duplicate function definitions: `parseSapExport_`, `groupByPrMat_`, `compareSapWithOrders_`, `triggerSapVerifyUpload`, `handleSapVerifyFile`, `renderSapVerifyResults_`, `closeSapVerifyModal`, `sapVerifyEscHandler` — each defined exactly once. `renderOrdersTable` (pre-existing) still defined exactly once, untouched by this feature.
- No id collisions: `modal-sapVerifyResults` and its 4 child ids (`sap-verify-summary`, `sap-verify-empty-message`, `sap-verify-table-wrapper`, `sap-verify-results-body`, `sap-verify-file-input`) each appear exactly once.

## Beyond code review: real-file parse test

Installed `xlsx@0.18.5` in an isolated scratch directory (not touching the repo — `CLAUDE.md` forbids reintroducing npm tooling here) and ran the committed `parseSapExport_` logic against the actual `template/ME5A.XLSX`:
- 69 raw rows → 46 correctly parsed detail rows, blank summary rows correctly filtered out, zero bogus/header-derived rows leaked through.
- Spot-checked two known rows against the values confirmed earlier via `openpyxl`: PR `1100032568`/Mat `80007533` → qty 1, unit price 14000 ✓; PR `1100032564`/Mat `50004717` → qty 10, unit price 165 ✓.
- Note: an earlier concern (a duplicate header row around raw row 7) raised during the original design research turned out to be an artifact of a shell command with a `||` fallback that printed the same rows twice — not a real duplicate in the file. Re-verified directly this round: no duplicate header row exists in the template, and `parseSapExport_` has no defect there.

## Not tested this round

Live browser click-through (upload dialog, modal rendering, Escape-to-close) — no browser access. Static/functional verification (function-count checks, id uniqueness, real Node execution of the parsing and comparison logic against the actual template file) substitutes for it this round; recommend the user do one real upload in-browser per the plan's Task 5 manual-verify step to confirm the visual result matches.

## Verdict: PASS, all 5 tasks — feature is fully client-side, safe to use immediately (no `Code.gs` redeploy needed for this one)

---

## Audit: login restriction + anonymous user, and feedback-to-GitHub-Issue (2 plans, 5 tasks, Antigravity)

Plan A: `docs/superpowers/plans/2026-07-26-login-restriction-anonymous.md` (2 tasks)
Spec A: `docs/superpowers/specs/2026-07-26-login-restriction-anonymous-design.md`
Plan B: `docs/superpowers/plans/2026-07-26-feedback-github-issue.md` (3 tasks)
Spec B: `docs/superpowers/specs/2026-07-26-feedback-github-issue-design.md`
Commits audited (in order): `54857ef` (A1) → `f1b52bd` (A2) → `5293046` (B1) → `fe58a5a` (B2) → `bf77a1b` (B3)

## Commit hygiene: clean

Exactly 5 commits for 5 tasks across both plans, in the plans' own order, exact commit messages. File scoping matches each task's Files section precisely: A1/A2 touch only `index.html`; B1 touches only `Code.gs`; B2/B3 touch only `index.html`. No unplanned files, no bundled unrelated changes.

## Per-task verdicts

| Task | Verdict | Notes |
|---|---|---|
| A1 — `LOGIN_ALLOWLIST` + gate `submitLogin()` | PASS | Byte-for-byte match. `!member \|\| LOGIN_ALLOWLIST.indexOf(member.userName) === -1` correctly rejects both unknown codes and known-but-not-allowlisted codes through the same existing error path. |
| A2 — Anonymous-login hint | PASS | Byte-for-byte match, placed exactly under the existing error paragraph. |
| B1 — `Code.gs` `submitFeedback_` + `doPost` wiring | PASS | Byte-for-byte match. `GITHUB_REPO` hardcoded correctly to `TheFirstzOne/Maintenance_System` (verified this is the actual repo). No `LockService` — correct per spec, this isn't a read-modify-write against a shared row. Required-field validation present both in the `doPost` branch and inside `submitFeedback_` itself (defense in depth, matches convention). |
| B2 — Feedback tab markup + `titles` entry | PASS | Byte-for-byte match. New sidebar group correctly placed as the last item inside `<nav>`, directly above the User Profile Footer. `feedback: "ข้อเสนอแนะ"` added to `titles` without disturbing the other 4 entries. |
| B3 — Wire `submitFeedback()` | PASS | Byte-for-byte match, inserted at the exact specified location (right after `submitAddStock`, before the `// Toggle displaying low-stock items` comment). `inFlightFeedback` guard present and correctly reset in `.finally()`. |

## Whole-file sweep (post all 5 commits)

- `<div>`/`</div>`: 216/216. `<section>`/`</section>`: 6/6 (5 original tabs + new feedback tab). `<nav>`/`</nav>`: 1/1. `<script>`/`</script>`: 6/6.
- No duplicate function definitions: `submitFeedback_` (`Code.gs`, ×1), `submitFeedback` (`index.html`, ×1), `submitLogin` (×1), `doPost` (×1) — correctly one definition each in the correct file.
- No id collisions: `tab-feedback`, `content-feedback`, `form-feedback-subject`, `form-feedback-message`, `feedback-submit-btn`, `feedback-success`, `feedback-issue-link` — each appears exactly once.
- `onsubmit="submitFeedback(event)"` and `onclick="switchTab('feedback')"` both resolve to functions that exist in the final state (no dangling references once all 3 of Plan B's tasks are in).
- Checked `.env` (untracked, gitignored) after noticing the user had it open — still only contains `GEMINI_API_KEY`; no GitHub token was accidentally placed there. Correct: the token belongs in Apps Script Script Properties, not this repo's `.env`, and `.env` wouldn't be committed either way.

## Not tested this round (blocked on manual, non-code steps outside the executor's reach)

- **Plan A:** the `0000` row still needs to be added to the live `members` Google Sheet by the repo owner — until then, typing `0000` at login will correctly show "ไม่พบผู้ใช้งาน" (expected, not a bug in this code). Live browser test of the allowlist (confirming a real gated-out employee code now fails, `1026308039` still works) not run — no browser access.
- **Plan B:** requires `GITHUB_TOKEN` in Script Properties + a `Code.gs` redeploy before `submitFeedback` can work end-to-end — neither can be done by an executor. No live curl test against the deployed exec URL was run this round; code review + static checks substitute for it.

## Verdict: PASS, all 5 tasks across both plans — ready pending two manual steps: add the `0000` row to the `members` sheet, and set `GITHUB_TOKEN` + redeploy `Code.gs`
