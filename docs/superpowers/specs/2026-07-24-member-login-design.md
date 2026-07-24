# Design: user_name login gate

## Context

The sidebar (`index.html:158-159`) currently hardcodes the logged-in user as "xxxx" / "หัวหน้าแผนกจัดซื้อซ่อมบำรุง" — there's no real identity anywhere in the app. The user has a `members` sheet (gid `380548139`, confirmed live) with columns `user_id, name, role, status, registered_at, user_name`. `user_id`/`status`/`registered_at` are populated by a separate LINE-bot registration flow (only 3 of the current 11 rows have `status=approved`); this app needs `name`, `role`, and now `user_name` from it. `user_name` values are numeric-looking codes (e.g. `1026308039`), not human names — treat as an opaque string, exact match, not a number.

**Revision note**: an earlier version of this spec used a dropdown `<select>` of names for login. Superseded — the user explicitly wants a typed `user_name` field instead, matched against the sheet's `user_name` column. Everything else in this spec (scope, data-loading sequence, localStorage keys, out-of-scope items) is unchanged from that version.

## Scope

Client-side identity only, no server changes. Login personalizes the sidebar and establishes "who's using the app right now" for the browser session — it does **not** gate any tab/button by role, and does **not** write the logged-in name to any sheet yet. Both of those are explicit, separate future work if wanted; building them now would mean guessing at a permission matrix and a `Code.gs`/sheet-schema change nobody asked for yet.

## Data

Add `'members': '380548139'` to the existing `SHEET_GIDS` map (`index.html:861-867`) and fetch it via the existing `fetchCSVTable_()`, alongside the other 5 sheets in `fetchAllData()` (`index.html:1083-1109`). `csvToMembers_(sheetData)` parser (mirrors `csvToStock_`/`csvToRequests_`) returns `{name, role, userName}` triples for every row with a non-blank `name` — `user_id`, `status`, `registered_at` are read by nobody, this app doesn't care about the LINE-bot's approval state.

## UI

**Login gate** — full-screen overlay, same visual shell as the app's existing modals (`fixed inset-0 bg-slate-950/40 backdrop-blur-sm`), but with no close affordance: no X button, no click-outside-to-close, no Escape handler. It's mandatory, not a modal you can dismiss. Contents: app logo/title, a single `<input type="text">` labeled for `user_name`, an inline error message area (hidden by default), and an "เข้าสู่ระบบ" submit button (disabled until the input is non-empty). No dropdown, no autocomplete/suggestions — the user types their own `user_name` value from memory.

**Sidebar** (`index.html:158-159`) — once logged in, the two hardcoded lines become the matched member's `name` and `role` instead of "xxxx"/the hardcoded title. A small "ออกจากระบบ" link is added near this block.

## Behavior

- On page load, `loadAllData()` runs exactly as it does today — same loading overlay, same 6-sheet `fetchAllData()` (now including `members`), same error banner/retry on failure. Login doesn't add a second fetch or change this sequence.
- Once data has loaded, check `localStorage` for a stored user (see below):
  - Present → render the dashboard as normal (today's behavior).
  - Absent → instead of the dashboard, show the login gate. The `members` data needed to validate the typed `user_name` was already fetched in that same `loadAllData()` call — no separate lookup request.
- On submit: trim the typed value, find a member whose `userName` matches exactly (case-sensitive, since these are opaque codes not display names).
  - Match found → save `{name, role}` (not the `user_name` itself — the sidebar shows the human name/role, same as before) to `localStorage` under key `maintxProCurrentUser`, hide the gate, populate the sidebar, render the dashboard — no re-fetch needed.
  - No match → show an inline error ("ไม่พบผู้ใช้งาน") under the input, keep the gate open, save nothing, don't touch `localStorage`.
- "ออกจากระบบ" clears `maintxProCurrentUser` and re-shows the gate (it does **not** clear `maintxProCachedData` — logging out doesn't need to blow away the cached sheet data).
- No expiry — once logged in, stays logged in on that browser until "ออกจากระบบ" is clicked, same persistence model as the existing data cache.

## Explicitly out of scope

- No `Code.gs` changes, no new sheet columns, no write-back of who's logged in.
- No role-based restrictions on any tab, button, or write action — every logged-in user can do everything any user can do today.
- No password, no lockout/rate-limiting on repeated wrong `user_name` attempts — this is self-identification, not real authentication (matches the original "no password" intent; `user_name` just replaces "pick your name from a public list" with "know your own code," which happens to also stop someone from casually logging in as a coworker by clicking their name).

## Error handling

If the `members` fetch fails, it fails as part of the existing `fetchAllData()` Promise.all — same error banner/retry button the app already shows for any sheet-load failure. No new error path.

## Testing

No test framework in this project (matches prior work). Manual browser verification: first visit with empty `localStorage` shows the gate before the dashboard; typing a valid `user_name` and submitting shows the dashboard with the sidebar updated to the right name/role; typing a wrong/unknown value shows the inline error and keeps the gate open; reloading the page after a successful login skips straight past the gate; "ออกจากระบบ" returns to the gate; submit button stays disabled with an empty input.
