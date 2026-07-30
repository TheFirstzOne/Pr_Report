# Design: Login restriction to two identities + anonymous user

## Context

The app is entering a controlled soft-launch phase. The `members` sheet already lists 11 real employees (confirmed live: `user_name` values like `1026308039`, `1026108044`, etc., matched by `submitLogin()` against `membersList`, `index.html:1126`). For now, access should be limited to just the app owner (`1026308039`) plus a new anonymous identity (`0000`) — the other 10 real employees should see the same "user not found" experience as today, without deleting their rows or otherwise touching the sheet's existing data.

## Scope

Client-side only (`index.html`). No `Code.gs` changes. One manual sheet edit (adding the `0000` row to `members`) — no new write path, since login has always been read-only against that sheet.

## Restriction mechanism

A hardcoded allowlist constant, checked in `submitLogin()` after the existing `membersList.find(...)` lookup:

```js
// Soft-launch gate: only these two user_name values may log in today,
// even though the members sheet lists 11 people. Remove/extend this
// array when the wider rollout begins — nothing else about login changes.
const LOGIN_ALLOWLIST = ["1026308039", "0000"];
```

`submitLogin()` treats "member found but not in `LOGIN_ALLOWLIST`" identically to "member not found" — same error message, same UI state. This is deliberate: the 10 gated-out employees get no signal that they're specifically blocked (vs. mistyping their code), which avoids a confusing "you exist but you're not allowed" message for a temporary rollout state.

## The `0000` anonymous identity

Added as a normal row in the `members` sheet (manual edit, same pattern as the Stock tab's `Value` column): `user_name=0000`, `name=ไม่ระบุตัวตน`, `role` left blank (or a short generic label like "ผู้ใช้งานทั่วไป" — the sheet owner's call at edit time, not load-bearing for the code). Zero new parsing code — `csvToMembers_` (`index.html:1249`) already reads any row with a non-empty `name`, and `submitLogin()` already stores whatever `member.name`/`member.role` it finds into `localStorage`. The allowlist is the only gate; everything downstream (sidebar profile display, feedback attribution in the companion spec) treats `0000` as just another logged-in member.

## Login hint

A small helper line added under the existing login input (`index.html:788`, inside the same `<div class="w-full text-left">` as the input and its error message), styled as quiet secondary text (not competing with the real input):

```html
<p class="text-xs text-slate-400 mt-2">ไม่ต้องการระบุตัวตน? กรอกรหัส <span class="font-semibold">0000</span> เพื่อเข้าใช้งานแบบไม่ระบุตัวตน</p>
```

Placed after the existing `#login-error` paragraph, always visible (not conditional on anything).

## Error handling

None new — this reuses the exact existing "not found" error path. No new failure mode is introduced; the allowlist check is a pure additional boolean condition on an already-handled branch.

## Testing

No test framework in this project (matches all prior specs). Manual verification: attempt login with a real employee's `user_name` (e.g. `1026108044`) and confirm it now shows "ไม่พบผู้ใช้งาน" despite existing in the sheet; log in with `1026308039` and confirm normal access; add the `0000` row to the sheet, log in with `0000`, and confirm the sidebar profile shows "ไม่ระบุตัวตน"; confirm the new hint text renders under the login input.
