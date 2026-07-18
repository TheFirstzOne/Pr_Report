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
