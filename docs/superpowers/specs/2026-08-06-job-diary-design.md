# Design: Job diary tab (port of the standalone Flet desktop app)

## Context

`JobdiaryRecord/job_diary_app.py` is a standalone Flet desktop app: one free-text field, a "บันทึกลงไฟล์ Word" button that appends a timestamped entry to a local `job_diary.docx`, and a history tab that re-parses that file, grouped by date. It already holds 2 real entries (13/01/2026 — equipment installation and a machine-error fix note). The user wants this folded into the web dashboard as a new tab.

This app has no local file storage anywhere — every other feature reads via Google Sheets CSV export and writes via the Apps Script Web App (`CLAUDE.md`'s split read/write architecture). This spec ports the diary to that model, but using a **Google Doc** instead of a Sheet tab: confirmed live at `1DuuoQhKA9WNgndt2q1V8Am2tiq0epy5AKBeHtHWU9yA`, publicly exported at `https://docs.google.com/document/d/1DuuoQhKA9WNgndt2q1V8Am2tiq0epy5AKBeHtHWU9yA/export?format=txt` (verified `200 OK` directly against the real doc before writing this spec).

## Why a Doc instead of a Sheet tab

Considered adding a new tab to the existing spreadsheet (matching every other feature) — rejected in favor of a Google Doc for two reasons: (1) it preserves the original app's format almost exactly, so the 2 existing real entries migrate by copy-paste, zero migration code; (2) a Sheet tab's read path needs its `gid`, which doesn't exist until the tab is created — a chicken-and-egg manual step. A Doc's export URL only needs the doc ID, which the user already created and confirmed reachable. Considered reading via a new Apps Script `doGet` action instead (no export-URL question at all) — rejected because this app's own code already documents Apps Script Web App calls as having 2-8s+ baseline latency, occasionally hanging 2+ minutes; the direct export-URL fetch this spec uses has none of that, matching why every other read in this app already avoids the Apps Script round-trip.

## Scope

New sidebar tab, client-side read (direct Doc export fetch + parse), one new `Code.gs` write action. No changes to any existing sheet, tab, or write action. Out of scope: editing/deleting a past entry (matches the original app — write-only after the fact), attaching files/photos, real-time collaboration cues.

## Entry format

Plain paragraphs appended to the Doc, one entry per date+time, separated by an 80-`=` divider line (same divider the original app used) — an extension of the original format with one added line (`โดย:`), since this is a shared team log where the original single-user app had no author field:

```
📅 วันที่: DD/MM/YYYY HH:MM:SS
โดย: {ชื่อผู้บันทึก}
{เนื้อหา}

================================================================================

📅 วันที่: DD/MM/YYYY HH:MM:SS
โดย: {ชื่อผู้บันทึก}
{เนื้อหา}
```

The 2 pre-existing entries were seeded by the user pasting the original docx text directly into the Doc (no `โดย:` line — author unknown for those two; the parser must tolerate a missing `โดย:` line, not require it).

Known, accepted limitation carried over from the original app unchanged: if `{เนื้อหา}` itself contains embedded newlines (the textarea is multiline), both `python-docx` originally and `DocumentApp.appendParagraph` here store it as one paragraph with literal newline characters, which round-trips consistently through this app's own write→export→parse path but may not print/display identically in a full Google Docs editor view. Not a regression introduced by this port.

## Read: `index.html`, client-side only

1. On switching to the diary tab (same lazy-fetch-per-tab-switch pattern `fetchFeedbackList()` already uses — not part of the bulk parallel `fetchAllData()`), `fetch("https://docs.google.com/document/d/1DuuoQhKA9WNgndt2q1V8Am2tiq0epy5AKBeHtHWU9yA/export?format=txt")`.
2. Parse the returned plain text into entries grouped by date, porting `parse_diary_entries`'s logic: split into lines, detect a `📅 วันที่: (DD/MM/YYYY) (HH:MM:SS)` line as an entry boundary, an immediately-following `โดย: (.*)` line as the optional author, every other non-blank/non-divider line up to the next date line as content.
3. **Fix over the original app:** group keys sort by actually-parsed `Date`, not by the `DD/MM/YYYY` string (the original app's `sorted(entries.items(), reverse=True)` is a plain string sort, which mis-orders across month/year boundaries — e.g. `"05/02/2026"` sorts before `"13/01/2026"` lexically despite being chronologically later). This port parses each date into a real `Date` for sorting, string-formats only for display.
4. UI: two-panel layout mirroring the desktop app — left panel: scrollable date list (newest first), clicking a date shows its entries on the right; right panel: one card per entry for the selected date, showing time, `โดย:` (or a "ไม่ระบุ" fallback when absent — the 2 migrated entries), and content. Empty doc / fetch failure states follow this app's existing convention (`feedback-list-empty`/`feedback-list-error` pattern from the feedback tab).

## Write: new `Code.gs` `doPost` action `addDiaryEntry`

```
const DIARY_DOC_ID = '1DuuoQhKA9WNgndt2q1V8Am2tiq0epy5AKBeHtHWU9yA';

function addDiaryEntry_(payload) {
  // DocumentApp, not SpreadsheetApp — this is the one write action in this
  // file that doesn't touch the spreadsheet at all.
  // No LockService: appendParagraph is an append-only operation, and unlike
  // the sheet write actions this never reads-then-writes a specific row, so
  // there's no read-modify-write race to guard against (same reasoning
  // submitFeedback_ already uses for skipping the lock).
}
```

Body of `addDiaryEntry_`: open `DocumentApp.openById(DIARY_DOC_ID)`, append (in order) a blank paragraph + the divider line (skipped on the very first entry — mirrors the original app's `if len(doc.paragraphs) > 0` check, translated to "does the doc already have any text"), the `📅 วันที่:` line (server-generated timestamp, `Utilities.formatDate` — never trust a client-supplied timestamp), the `โดย:` line from `payload.who`, then the content paragraph(s) from `payload.content`.

`index.html`'s `submitDiaryEntry()` POSTs `{action: "addDiaryEntry", who: <current logged-in user's name, from `maintxProCurrentUser`, matching `submitFeedback`'s existing read pattern — "ไม่ระบุตัวตน" fallback if absent>, content: <textarea value>}`, disables the button while in-flight, and on success re-fetches the doc (Step 1 of Read) to show the new entry immediately rather than trying to splice it into local state — this app has no in-memory diary array to reconcile against (unlike the Sheet-backed features), so a full re-fetch is both simpler and correct.

## UI

New sidebar nav entry (mirrors `tab-feedback`'s markup exactly): `switchTab('diary')`, `id="tab-diary"`, label "บันทึกประจำวัน" (Job Diary), added to the `titles` object. New `content-diary` section, two-column layout (write panel + history panel, side by side like the feedback tab's 2-column split) rather than the original app's tabbed write/history — since this is a dashboard page already organized by side tabs, not a standalone app, a single always-visible panel avoids nesting tabs-within-tabs.

## Error handling

- Doc fetch fails/network error → error state in the history panel, same visual pattern as `feedback-list-error`.
- Empty doc (no entries yet, or between the seed paste and the first web-submitted entry) → same "ยังไม่มีบันทึก" empty state as `feedback-list-empty`.
- Write POST fails → generic error toast (`triggerToast`), textarea content is NOT cleared (so the user doesn't lose what they typed), matching the safe-failure spirit of every other write action in this file.
- Empty submit (blank textarea) → client-side no-op, same as the original app's `save_to_word` guard.

## Testing

No test framework in this project. Manual verification: after the user pastes the 2 seed entries and `Code.gs` is redeployed with `addDiaryEntry_`, load the diary tab and confirm both migrated entries render (with "ไม่ระบุ" author, correct date/time, correct content); submit a new entry from the web UI and confirm it appears in the Doc (verify via the Doc's normal editor view) and in the tab's history panel after re-fetch; confirm the date list sorts newest-first correctly across entries spanning more than one month (the string-vs-real-date sort fix); confirm a failed fetch (temporarily break the URL) shows the error state, not a blank panel.
