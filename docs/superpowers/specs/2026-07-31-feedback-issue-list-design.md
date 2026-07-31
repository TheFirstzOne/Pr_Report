# Design: Show sent feedback issues alongside the form

## Context

The feedback tab (`content-feedback`, `index.html:785`) currently holds one `max-w-2xl` form card, which leaves a visibly empty right-hand side on wider screens — flagged as unbalanced. Fix: show the user's recently submitted feedback issues next to the form, addressing both the layout gap and giving visible confirmation that submissions actually land somewhere real.

## Scope

Mostly client-side (`index.html`): a new read-only panel that fetches directly from GitHub's public REST API, no `Code.gs` round trip for reading. One small `Code.gs` change: `submitFeedback_` now attaches a `feedback` label when creating each issue, so the read side can filter to only feedback-originated issues (the repo already has 2 unrelated pre-existing issues with no labels — confirmed live — which must NOT show up in this list).

## Why a direct client-side GitHub fetch, not a new `Code.gs` read action

Matches this app's existing architecture exactly: reads bypass the Apps Script backend entirely (`CLAUDE.md`'s "Architecture: split read/write paths"). GitHub's REST API allows unauthenticated `GET` on a public repo's issues — confirmed the repo is public — so there's no token needed for reading, and therefore nothing new to keep off the client. Writes stay exactly as they are (through `Code.gs`, using the server-side `GITHUB_TOKEN`).

```
GET https://api.github.com/repos/TheFirstzOne/Maintenance_System/issues?labels=feedback&state=all&sort=created&direction=desc&per_page=10
```

Accepted limitation: unauthenticated GitHub API calls are rate-limited to 60/hour per IP. Not fixed here — adding a token to lift this would mean either exposing it client-side (rejected) or routing every list-load through `Code.gs` (unnecessary complexity for a low-traffic internal tool's "recent 10 items" panel). If this becomes a real problem later, it's a config change, not a redesign.

## Manual setup step required

Create a `feedback` label on the GitHub repo once, manually, before this ships (repo → Issues → Labels → New label, name `feedback`, any color). GitHub may auto-create a label specified at issue-creation time that doesn't already exist, but this isn't being relied on — pre-creating it removes any doubt. Same category of one-time setup as the existing `GITHUB_TOKEN` Script Property and the `0000` members-sheet row.

## Layout

The existing single-card layout (`index.html:786`, `max-w-2xl`) becomes a 2-column grid: `<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">` wrapping the existing form card (now un-capped at `max-w-2xl`, sized by its grid column instead) and a new card on the right, "ข้อเสนอแนะที่ส่งไปแล้ว". Stacks to a single column below `lg`.

New card states, each a separate element toggled via `hidden`:
- **Loading:** shown while the fetch is in flight.
- **Empty:** "ยังไม่มีข้อเสนอแนะที่ส่งไป" — zero feedback-labeled issues found.
- **Error:** a quiet inline message if the fetch fails (network, rate limit) — does NOT block or affect the submit form on the left; these are independent concerns.
- **List:** up to 10 items, newest first, each showing: title, a formatted date (`toLocaleDateString('th-TH', {year:'numeric', month:'short', day:'numeric'})` on `created_at`), an open/closed badge (emerald for open, slate for closed), and an external-link icon to `html_url`.

## Refresh triggers

1. Every time `switchTab('feedback')` runs (`index.html:2609`) — a fresh fetch each time the tab is opened, no caching.
2. Immediately after a successful submission in `submitFeedback()`'s success branch (`index.html:3039-3047`), right after the existing toast — so the just-created issue appears without needing to leave and re-enter the tab. GitHub's issues-list endpoint is read-after-write consistent for a newly created issue, so no artificial delay is needed before this re-fetch.

## `Code.gs` change

`submitFeedback_`'s issue-creation request body gains one field:
```js
payload: JSON.stringify({ title: subject, body: body, labels: ['feedback'] }),
```
Nothing else about `submitFeedback_` changes — same token, same endpoint, same error handling.

## Error handling

- Fetch throws or returns non-2xx (rate limit, network) → caught, show the error state, log to console. The submit form is entirely unaffected — a broken list must never block sending new feedback.
- Zero results → empty state, not an error.
- Malformed/unexpected API response shape → treated the same as a fetch error (defensive `try/catch` around the whole fetch+parse+render sequence, not just the network call).

## Testing

No test framework in this project. Manual verification: create the `feedback` label on GitHub first; submit one piece of feedback and confirm it appears in the list within the same tab visit (no reload needed); confirm the 2 pre-existing unlabeled issues never appear in this list; temporarily point the fetch URL at a nonexistent repo path and confirm the error state shows without breaking the form.
