# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page Procure-to-Pay dashboard for maintenance spare parts (stock, RFQ/requests, quotes, purchase orders, budget). Thai-first UI (`lang="th"`), see `PRODUCT.md` for product intent and `DESIGN.md` for the design system ("The Industrial Ledger" — high-density tables, no glassmorphism/soft colors, 4.5:1 contrast minimum).

There is no build step, no package manager, no test runner. Everything is plain HTML/CSS/JS loaded from CDNs (Tailwind CDN, Lucide `1.25.0` — pinned, don't bump to `@latest`, Chart.js) plus one Google Apps Script backend.

## Running it

`index.html` is a static file, but it **must be served over http(s)**, not opened via `file://` — the read path fetches Google's CSV export endpoint, which sends no CORS header for a `null` origin (double-clicking the file), so all reads silently fail. Serve it with any static server, e.g. `python -m http.server`.

## Architecture: split read/write paths

Reads and writes go through *different* transports — this is the single most important thing to know before touching data flow:

- **Reads (GET)**: client-side only, no Apps Script involved. `index.html` fetches each sheet tab directly via Google's CSV export URL (`fetchCSVTable_`, `index.html:1364`), keyed by hardcoded `gid` values in `SHEET_GIDS` (`index.html:1323`). This intentionally bypasses `gviz/tq`, which was found to silently respect an active Basic Filter on the sheet and return a filtered subset — CSV export always returns the true unfiltered data (see `AUDIT.md` "critique/audit fixes batch" section for the live-verified reasoning). If a sheet tab is ever deleted and recreated (not renamed), its `gid` changes and `SHEET_GIDS` must be updated by hand. The job diary tab (below) uses the same "direct export URL, no Apps Script" philosophy but against a Google Doc, not a Sheet.
- **Writes (POST)**: go to the deployed Apps Script Web App at `EXEC_URL` (`index.html:1117`), which routes through `doPost` in `Code.gs` (`Code.gs:628`) to actions like `setVerify_`, `adjustStockQty_`, `receiveOrder_`, `addStock_`, `updatePrStatus_`, `addDiaryEntry_`. `Code.gs` also has a `doGet` with equivalent read actions (`getStock`, `getRequests`, etc.), but the deployed frontend does not use it for reads — it's a legacy/fallback path, and deliberately so: Apps Script Web App calls have a measured 2-8s baseline latency (occasionally hanging 2+ minutes), which is why every other read avoids the round-trip.
- Writes follow an **optimistic-update-then-reconcile** pattern: update local state and re-render immediately, POST, then reconcile against the server's actual returned value or roll back and toast an error on failure (see `toggleVerify`, `adjustStockQty`, `receiveOrder` in `index.html`). The PR status bulk-update feature (below) deliberately breaks this pattern — see its own section for why.
- `Code.gs` must be manually pasted/deployed into the Apps Script project bound to the sheet (`SHEET_ID`) — this repo is not synced to Apps Script via `clasp` or similar, so editing `Code.gs` here has no effect until it's redeployed by hand. **This has repeatedly bitten real feature launches** (`AUDIT.md` has three separate incidents of a feature shipping code-complete but silently non-functional until someone remembered to redeploy) — always call this out explicitly as a follow-up step when a plan touches `Code.gs`.
- **First use of a new Apps Script service needs a manual one-time authorization, separate from redeploying.** Adding a call to a service the project has never used before (e.g. `DocumentApp`, used for the first time by `addDiaryEntry_`) doesn't automatically prompt for the new OAuth scope — pasting the code and redeploying is not enough, and the failure mode is a runtime exception (`Exception: คุณไม่ได้รับอนุญาตให้เรียกใช้ ...`) rather than anything upfront. To fix: in the Apps Script editor, run any function that exercises the new service. **Functions named with a trailing `_` (the convention every write handler/helper in this file uses) are hidden from the editor's "select function to run" dropdown** — Apps Script treats the underscore suffix as "private". Add a small temporary public-named wrapper (no trailing `_`) that calls the new service, select and run *that* from the dropdown to trigger the consent screen, then it can be deleted.

## Data flow shape

Each sheet tab has a matching `csvToX_` transform (`csvToStock_`, `csvToRequests_`, `csvToQuotes_`, `csvToBudget_`, `csvToOrders_`, `csvToMembers_`, all in `index.html` ~1392-1520) that maps raw CSV rows to typed JS objects by **header name lookup** (`headers.indexOf(...)`), not fixed column index — sheet columns can be reordered without breaking parsing, but a renamed header will silently break a field. `fetchAllData()` (`index.html:1580`) fires all six `fetchCSVTable_` calls in parallel; `loadAllData()` (`index.html:1610`) wraps it with the loading overlay and `localStorage` cache (`DATA_CACHE_KEY`) used for instant paint on reload.

Module-level `let`/`const` arrays (`stockParts`, `projectsBudget`, `rfqList`, `quoteHistory`, `purchaseOrders`, `membersList`, `index.html:1119-1125`) are the single in-memory source of truth; there is no framework/state library. All `render*` functions read from these globals directly and re-render on any data or filter change via `renderAll()`. Two features deliberately don't follow this: the feedback list and the job diary have no module-level array — both re-fetch fresh from their own source (GitHub API, the diary Doc) on every tab switch instead, since neither is part of the bulk Sheet load.

Money/date values from Sheets arrive inconsistently formatted (comma-grouped numbers, GViz date-wrapper strings); always route them through `parseMoney_`/`formatDate_` rather than parsing inline — these were previously fixed for real bugs (see git log `45fc7a5`).

Any new interpolation site for free-typed user text (a remark, a note, a diary entry) should go through `escapeHtml_` (`index.html:2624`) rather than raw template-literal interpolation — most existing fields in this file interpolate raw (a known, long-standing gap, not something to unilaterally refactor project-wide), but `escapeHtml_` exists specifically for the newer, higher-risk free-text fields and covers both element text content and `attr=""` values safely.

## Status normalization

Order/PR status strings from the sheet are inconsistent (`"Pr"`, `"PO"`, `"DEL."`, `"Cancle"`, etc.). Always compare against `order.normalizedStatus` (set by `normalizeOrderStatus()`, `index.html:1134`) rather than the raw `status` field — this feeds stat cards, row coloring, and the budget monthly-spend exclusion logic (`calculateMonthlyExpenses`, `index.html:2854`, which excludes anything not `SHIPPING`/`RECEIVED`). An unrecognized status silently falls back to `"PENDING"` — a known soft spot, not (yet) hit by real data.

`"DEL."` normalizes into the broader `SHIPPING` bucket alongside `DELIVERING`/`SHIPPED`/`กำลังจัดส่ง` — fine for display, but **not** fine for anything that needs to know specifically "has this been delivered and should never be reverted" (see PR status update below, which learned this the hard way in issue #7). Code that needs that narrower meaning must check the raw status text for `"DEL."` directly, not `normalizedStatus`.

## Reorder point

`getDynamicReorderPoint_(part)` (`index.html:1444`) computes a lead-time-aware reorder point (`ceil(avgMonthlyUsage/30 * leadTimeDays) + reorder`) when both `leadTimeDays` and `avgMonthlyUsage` are present on a part, otherwise falls back to the static `reorder` column. Design rationale in `docs/superpowers/specs/2026-07-24-dynamic-reorder-point-design.md`.

## Auth

Login is a typed `user_name` match against the `members` sheet tab (no password) — see `docs/superpowers/specs/2026-07-24-member-login-design.md`. Current user is cached in `localStorage` under `maintxProCurrentUser`.

## Feedback tab

The feedback form (`submitFeedback_`, `Code.gs:556`) posts each submission as a GitHub Issue on `TheFirstzOne/Maintenance_System`, tagged with a `feedback` label and a body footer (`"ส่งจาก: Maintenance System (แท็บข้อเสนอแนะ)"`). The sent-issues list (`fetchFeedbackList`, `index.html:3406`) reads directly from the GitHub REST API client-side (no Apps Script involved) — but it matches issues by that **body footer text**, not the `feedback` label. The label-based filter was the original design and is what `submitFeedback_` still applies when creating an issue, but relying on it client-side turned out to be fragile: it silently returns zero results for any issue created before the label-tagging code was deployed, and GitHub label state can't be backfilled by re-reading. Matching the footer text works against whatever's already live and picks up historical issues too — keep this if extending the feature, don't switch back to the label filter.

## PR status update from SAP export

Orders tab → "Status" button uploads a SAP ME5A `.xlsx` export (same file type the "Verify" button reads, different columns: `Release indicator`, `Purchase order`) and bulk-updates `STATUS`/`PO No.` for matched PR rows via `updatePrStatus_` (`Code.gs:471`). Client-side matching/preview logic is `buildPrStatusChanges_` (`index.html:2421`); real column names and a sample file are in `template/ME5A.XLSX`.

- Indicator mapping: `X`/`Y` → status `Pr`; `Z` → status `PO` + writes `PO No.` from the row's `Purchase order` value.
- Two statuses are treated as **one-way doors** — a stale export row must never regress them back to `Pr`/`PO`: `RECEIVED` (checked via `normalizedStatus`, list of raw values in `Code.gs`'s `RECEIVED_STATUS_VALUES_`) and `DEL.` (checked via raw status text — see Status normalization above for why `normalizedStatus` can't be used here). Both guards are duplicated client-side (for the preview) and server-side (defense in depth, since the export was parsed before the confirm click).
- Deliberately breaks the optimistic-update pattern every other write action here uses: nothing changes locally until the server confirms, because the preview-then-confirm modal already serves as the "are you sure" step.
- **Field-name gotcha, already hit once:** the client sends the new status as `newStatus` (`buildPrStatusChanges_`'s pushed object), and `updatePrStatus_` must read `update.newStatus` — an earlier version read `update.status` (a field that was never sent), which was always `undefined`, and `setValue(undefined)` in Apps Script silently blanks the cell instead of throwing. If a future refactor renames either side, grep for the actual field name on both ends rather than assuming a matching plan/self-review claim was correct — this exact mismatch passed an audit once already.

## Job diary

A shared team work log, ported from the standalone `JobdiaryRecord/job_diary_app.py` Flet desktop app. Unlike every other feature, it's backed by a **Google Doc**, not a Sheet tab — `DIARY_DOC_ID` (`Code.gs:595`), a separate document from `SHEET_ID`. Read is a direct client-side `fetch` of the Doc's `export?format=txt` URL (`fetchDiaryEntries`, `index.html:3547`) parsed by `parseDiaryText_` (`index.html:3472`), same no-Apps-Script-round-trip philosophy as the CSV reads. Write is `addDiaryEntry_` (`Code.gs:597`), which uses `DocumentApp.openById`, not `SpreadsheetApp` — the only write action in `Code.gs` that doesn't touch the spreadsheet at all.

Entry format is plain paragraphs: `📅 วันที่: DD/MM/YYYY HH:MM:SS` / `โดย: {ชื่อ}` / `{เนื้อหา}`, separated by an 80-`=` divider. `parseDiaryText_` sorts groups by an actually-parsed `Date`, not the raw `DD/MM/YYYY` string — the original desktop app's plain string sort mis-orders across month/year boundaries, fixed during the port.

## Other directories

- `Ref/` — reference copies of an earlier/related Apps Script + dashboard (`Code.gs`, `dashboard.html`, `Report-Summary.gs`), not part of the running app.
- `InventoryManagement/` — a separate, self-contained CRUD inventory app (own `README.md`/`DEPLOYMENT-GUIDE.md`, own Apps Script backend). Unrelated runtime to the root `index.html` app; currently untracked in git.
- `JobdiaryRecord/` — the standalone Flet desktop app the job diary tab (above) was ported from. `job_diary.docx` there holds the 2 original real entries that were manually copied into the diary Google Doc as seed content; the app itself is otherwise unrelated to the running dashboard.
- `template/` — real sample files used to ground SAP-export-reading features against actual column names/data before writing code: `ME5A.XLSX` (used by both the "Verify" and "Status" Orders-tab uploads) and a Stock export.
- `docs/superpowers/specs/` and `plans/` — design specs and implementation plans for past features, useful as history/rationale for a given feature before changing it.
- `AUDIT.md` — a running log of post-hoc audits of executor-implemented changes against their plans; check it before assuming a given change was reviewed or not. Also documents a recurring pattern worth knowing about: Antigravity-executed plans have repeatedly shown commit timestamps too tight for their own manual-verify steps to have actually run — audit by re-deriving evidence (diff the code, re-execute the logic, probe the live deployment), not by trusting the executor's commit as proof the plan's checks passed.
- `get_style.py`, `image_gen.py`, `style_extract.py`, `.image_session.json`, `outputs/` — ad hoc image/style generation scripts, not part of the app itself.

## Working conventions seen in this repo

- New features get a short design spec in `docs/superpowers/specs/` before implementation, and a plan in `docs/superpowers/plans/` for multi-step work.
- Server-side (`Code.gs`) write handlers use string-compared IDs (e.g. `String(partId)`) since Sheets values and POST payload values can differ in type — match that convention for any new write action.
- Don't reintroduce a Tailwind build toolchain (`package.json`/`tailwind.config.js`) — this was deliberately reverted once; the CDN script tag is intentional.
- Shared logic used by more than one near-identical function belongs in one small helper, not copy-pasted per caller — e.g. `readSapWorkbookRows_` (`index.html`) is the shared "read sheet, validate required headers, drop blank summary rows" step for both `.xlsx`-reading features, and `escapeHtml_` (see Data flow shape above) is the one escaping helper for new free-text interpolation sites, not one per call site.
