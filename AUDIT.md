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
