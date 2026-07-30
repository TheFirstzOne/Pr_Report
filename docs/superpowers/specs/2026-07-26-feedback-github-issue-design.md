# Design: Feedback tab → GitHub Issue

## Context

Users should be able to leave a suggestion/complaint from inside the app, and have it land as a trackable item in this project's GitHub repo (`TheFirstzOne/Maintenance_System`, confirmed public) rather than getting lost in chat. Companion feature to `2026-07-26-login-restriction-anonymous-design.md` (shares the same `localStorage` current-user identity), but independently shippable — this spec doesn't require the login-restriction spec to land first.

## Scope

Full stack: `index.html` (new tab + form + submit flow) + `Code.gs` (new `doPost` action that calls GitHub's REST API). No new sheet columns, no new read path — feedback is never stored in Google Sheets, only forwarded to GitHub.

## Why an Issue, not a Pull Request

A PR represents a proposed code change — it requires a branch and a diff to merge. A user's text suggestion isn't a diff; forcing it into PR shape would mean fabricating a fake file change just to have something to open a PR against, which is both fragile (what file? what branch base?) and semantically wrong for what a suggestion actually is. A GitHub Issue is exactly the primitive built for "something to track and discuss," and creating one is a single `POST /repos/{owner}/{repo}/issues` call — no branch creation, no commit, no merge conflict surface. Issues is the correct and simpler choice.

## GitHub API access

Requires a Personal Access Token stored in the Apps Script project's **Script Properties** (`PropertiesService.getScriptProperties()`), property key `GITHUB_TOKEN` — never in `index.html`, since that file is fully visible via browser devtools to anyone who loads the page. Setup is a manual one-time step performed by the repo owner in GitHub's settings UI and the Apps Script editor's Project Settings — not part of this implementation (documented separately, already done before this plan is dispatched).

Repo target is hardcoded: `TheFirstzOne/Maintenance_System` (this is a single-purpose internal tool, not a multi-tenant product — no config UI needed for a value that never changes).

## Frontend: feedback tab

New sidebar nav item "ข้อเสนอแนะ" — last item inside `<nav id="sidebar-nav">` (`index.html:107-152`), positioned directly above the User Profile Footer block (`index.html:154-163`), same `tab-btn`/`switchTab('feedback')` pattern as every existing tab. New `content-feedback` section (same `tab-content hidden space-y-6` shell as `content-stock`/`content-orders`/etc.) with:
- Subject input (`หัวข้อ`, single line, required)
- Details textarea (`รายละเอียด`, required)
- Submit button, disabled while a submission is in flight (reuses the same `inFlight*` guard pattern already used for stock/RFQ writes — a new `inFlightFeedback` boolean, since only one feedback form exists at a time, not a per-ID Set like the table-row writes)
- An inline confirmation area, hidden by default, shown after a successful submit with a link to the created Issue (`<a href="{issueUrl}" target="_blank">`) — `triggerToast()` only supports plain text (`toastMsg.innerText`, `index.html:1809`), so a clickable link needs its own element, not the toast

Also added to `switchTab()`'s `titles` object (`index.html:2579-2585`): `feedback: "ข้อเสนอแนะ"`.

## Submit flow

On submit: read current user from `localStorage.getItem("maintxProCurrentUser")` (existing key, set by `submitLogin()`) for `name`/`role` attribution — matches the explicit choice to attribute by real identity when logged in as a real user, and show `"ไม่ระบุตัวตน"` when logged in as `0000` (already true today, since that's literally what `0000`'s `name` field is set to in the members sheet per the companion login spec — no special-casing needed here).

```
POST {action: "submitFeedback", subject, message, name, role}
```

No optimistic UI update (there's no local list of feedback items to update) — just a loading state on the submit button, then either the inline success confirmation + link, or a `triggerToast(..., "error")` on failure. Form fields are NOT cleared on success (so the confirmation area and the just-submitted text stay visible together) but ARE re-enabled for a new submission.

## Backend: `Code.gs`

New function, plus one new `doPost` branch:

```js
const GITHUB_REPO = 'TheFirstzOne/Maintenance_System';

function submitFeedback_(payload) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) {
    return { error: 'GITHUB_TOKEN ยังไม่ถูกตั้งค่าใน Script Properties' };
  }

  const subject = String(payload.subject || '').trim();
  const message = String(payload.message || '').trim();
  if (!subject || !message) {
    return { error: 'กรุณากรอกหัวข้อและรายละเอียด' };
  }

  const name = String(payload.name || 'ไม่ระบุตัวตน').trim();
  const role = String(payload.role || '').trim();
  const attribution = role ? (name + ' (' + role + ')') : name;
  const body = message + '\n\n---\nผู้แจ้ง: ' + attribution + '\nส่งจาก: Maintenance System (แท็บข้อเสนอแนะ)';

  const response = UrlFetchApp.fetch('https://api.github.com/repos/' + GITHUB_REPO + '/issues', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
    payload: JSON.stringify({ title: subject, body: body }),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const result = JSON.parse(response.getContentText());
  if (status !== 201) {
    return { error: 'สร้าง Issue ไม่สำเร็จ: ' + (result.message || status) };
  }
  return { success: true, issueUrl: result.html_url, issueNumber: result.number };
}
```

No `LockService` needed here — unlike `adjustStockQty_`/`setVerify_`, this doesn't read-modify-write a shared sheet row, so there's no race to guard against; each submission is an independent, unconditional `POST` to GitHub.

`doPost` (`Code.gs`) gains one branch alongside the existing ones, validating required fields before calling the handler (same convention as `addStock`/`updateStock`):
```js
} else if (body.action === 'submitFeedback') {
  if (!body.subject || !body.message) throw new Error('Missing subject/message');
  payload = submitFeedback_(body);
}
```

## Error handling

- Missing `GITHUB_TOKEN` in Script Properties → clear Thai error surfaced to the user (not a generic failure) so it's obvious the setup step wasn't done, not that the feature is broken.
- Empty subject/message → rejected both client-side (HTML `required` on the inputs) and server-side (defense in depth, matching this file's existing double-validation convention).
- GitHub API error (bad token, rate limit, network) → `muteHttpExceptions: true` means Apps Script never throws on a non-2xx response; the function inspects the status code itself and returns a structured `{error: ...}` including GitHub's own message when available, which the frontend surfaces via `triggerToast(..., "error")`.
- Accepted, not fixed here: `name`/`role` are client-supplied and not cryptographically verified — consistent with this entire app's trust model (no auth beyond the login gate; every existing write action already trusts client-sent identifiers the same way). Not a new gap introduced by this feature.

## Testing

No test framework in this project. Manual verification: submit feedback while logged in as the real user (`1026308039`) and confirm the created Issue's body correctly attributes their name/role; submit while logged in as `0000` and confirm it shows "ไม่ระบุตัวตน"; temporarily rename the `GITHUB_TOKEN` script property and confirm the specific "not configured" error surfaces instead of a generic failure; confirm the inline success link actually opens the real created Issue.
