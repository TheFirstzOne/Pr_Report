# Design: Name-only login gate

## Context

The sidebar (`index.html:158-159`) currently hardcodes the logged-in user as "xxxx" / "หัวหน้าแผนกจัดซื้อซ่อมบำรุง" — there's no real identity anywhere in the app. The user has a `members` sheet (gid `380548139`, confirmed live) with columns `user_id, name, role, status, registered_at, user`. `user_id`/`status`/`registered_at` are populated by a separate LINE-bot registration flow (only 3 of the current 11 rows have `status=approved`); this app only needs `name` and `role` from it.

## Scope

Client-side identity only, no server changes. Login personalizes the sidebar and establishes "who's using the app right now" for the browser session — it does **not** gate any tab/button by role, and does **not** write the logged-in name to any sheet yet. Both of those are explicit, separate future work if wanted; building them now would mean guessing at a permission matrix and a `Code.gs`/sheet-schema change nobody asked for yet.

## Data

Add `'members': '380548139'` to the existing `SHEET_GIDS` map (`index.html:861-867`) and fetch it via the existing `fetchCSVTable_()`, alongside the other 5 sheets in `fetchAllData()` (`index.html:1083-1109`). New `csvToMembers_(sheetData)` parser (mirrors `csvToStock_`/`csvToRequests_`) returns `{name, role}` pairs for every row with a non-blank `name` — `user_id`, `status`, `registered_at`, `user` are read by nobody, this app doesn't care about the LINE-bot's approval state.

## UI

**Login gate** — full-screen overlay, same visual shell as the app's existing modals (`fixed inset-0 bg-slate-950/40 backdrop-blur-sm`), but with no close affordance: no X button, no click-outside-to-close, no Escape handler. It's mandatory, not a modal you can dismiss. Contents: app logo/title, a native `<select>` listing every member with a name (all of them — status is irrelevant here), and an "เข้าสู่ระบบ" submit button (disabled until a name is picked). A plain `<select>` is enough for ~11 names; no custom searchable dropdown.

**Sidebar** (`index.html:158-159`) — once logged in, the two hardcoded lines become the selected member's `name` and `role` instead of "xxxx"/the hardcoded title. A small "ออกจากระบบ" link is added near this block.

## Behavior

- On page load, `loadAllData()` runs exactly as it does today — same loading overlay, same 6-sheet `fetchAllData()` (now including `members`), same error banner/retry on failure. Login doesn't add a second fetch or change this sequence.
- Once data has loaded, check `localStorage` for a stored user (see below):
  - Present → render the dashboard as normal (today's behavior).
  - Absent → instead of the dashboard, show the login gate, its `<select>` populated from the `members` data that was just fetched in that same `loadAllData()` call.
- On submit, save `{name, role}` to `localStorage` under a new key `maintxProCurrentUser` (matches the existing `DATA_CACHE_KEY = "maintxProCachedData"` naming convention), hide the gate, populate the sidebar, and render the dashboard — no re-fetch needed, the data is already loaded.
- "ออกจากระบบ" clears `maintxProCurrentUser` and re-shows the gate (it does **not** clear `maintxProCachedData` — logging out doesn't need to blow away the cached sheet data).
- No expiry — once logged in, stays logged in on that browser until "ออกจากระบบ" is clicked, same persistence model as the existing data cache.

## Explicitly out of scope

- No `Code.gs` changes, no new sheet columns, no write-back of who's logged in.
- No role-based restrictions on any tab, button, or write action — every logged-in user can do everything any user can do today.
- No password, no validation beyond "a name was picked from the list."

## Error handling

If the `members` fetch fails, it fails as part of the existing `fetchAllData()` Promise.all — same error banner/retry button the app already shows for any sheet-load failure. No new error path.

## Testing

No test framework in this project (matches prior work). Manual browser verification: first visit with empty `localStorage` shows the gate before the dashboard; picking a name and submitting shows the dashboard with the sidebar updated; reloading the page skips straight past the gate; "ออกจากระบบ" returns to the gate; submit button stays disabled with nothing selected.
