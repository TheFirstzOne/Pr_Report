# Feedback Tab Sent-Issues List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the visibly unbalanced feedback tab by adding a right-hand panel listing the user's recently sent feedback issues, fetched directly from GitHub.

**Architecture:** One small `Code.gs` change (tag new issues with a `feedback` label). Everything else is client-side `index.html`: an unauthenticated direct fetch to GitHub's public Issues API (no new `Code.gs` read action — matches this app's existing read/write split), a new list card next to the existing form, and two refresh hooks (tab switch + post-submit).

**Tech Stack:** Vanilla JS, Tailwind CDN (existing), GitHub REST API v3 (unauthenticated `GET /repos/{owner}/{repo}/issues`).

## Global Constraints

- No new `Code.gs` read action — the list is fetched directly from the browser, per spec's "Why a direct client-side GitHub fetch" section.
- No token involved in the read path — GitHub's public-repo issues list is readable unauthenticated; never add a token to any client-side fetch.
- Filter strictly by the `feedback` label (`?labels=feedback`) — the repo has 2 pre-existing unlabeled issues that must never appear in this list.
- A `feedback` label must exist on the GitHub repo before this is used live — one-time manual setup step (repo → Issues → Labels → New label), not something this plan's tasks can do.
- A broken/failed list fetch must never block or visually disturb the submit form — they are independent UI regions.
- No test framework in this project — every task ends with a manual verification.
- Thai UI copy only, matching the existing tab's tone.

---

### Task 1: `Code.gs` — tag new feedback issues with the `feedback` label

**Files:**
- Modify: `Code.gs` (`submitFeedback_`'s `UrlFetchApp.fetch` call)

**Interfaces:**
- No new function. Existing `submitFeedback_(payload)` signature and return shape (`{success, issueUrl, issueNumber}` / `{error}`) are unchanged.

- [ ] **Step 1: Add the `labels` field to the issue-creation payload**

Find:
```javascript
  const response = UrlFetchApp.fetch('https://api.github.com/repos/' + GITHUB_REPO + '/issues', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
    payload: JSON.stringify({ title: subject, body: body }),
    muteHttpExceptions: true
  });
```

Replace with:
```javascript
  const response = UrlFetchApp.fetch('https://api.github.com/repos/' + GITHUB_REPO + '/issues', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
    payload: JSON.stringify({ title: subject, body: body, labels: ['feedback'] }),
    muteHttpExceptions: true
  });
```

- [ ] **Step 2: Manual verify**

Before deploying: create the `feedback` label on GitHub if it doesn't already exist (repo → Issues → Labels → New label, name `feedback`, any color) — check first with `curl -s https://api.github.com/repos/TheFirstzOne/Maintenance_System/labels` to see if it's already there. Paste the updated `Code.gs` into the Apps Script editor, redeploy (Deploy → Manage deployments → edit → New version). Submit one real feedback item from the app, then confirm via `curl -s https://api.github.com/repos/TheFirstzOne/Maintenance_System/issues?labels=feedback` that the new issue appears in that filtered list.

- [ ] **Step 3: Commit**

```bash
git add Code.gs
git commit -m "feat: tag feedback-submitted GitHub issues with a feedback label"
```

---

### Task 2: Feedback tab — 2-column layout + sent-issues list card

**Files:**
- Modify: `index.html:785-808` (`content-feedback` section)

**Interfaces:**
- Produces: `feedback-list-loading`, `feedback-list-empty`, `feedback-list-error`, `feedback-list-body` element ids — consumed by Task 3's `fetchFeedbackList()`.

- [ ] **Step 1: Restructure into a 2-column grid and add the list card**

Find:
```html
            <section id="content-feedback" class="tab-content hidden space-y-6">
                <div class="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden max-w-2xl">
                    <div class="p-6 border-b border-slate-100 bg-slate-50/50">
                        <h3 class="font-bold text-base text-slate-800">ส่งข้อเสนอแนะ</h3>
                        <p class="text-xs text-slate-500 mt-1">ข้อเสนอแนะของคุณจะถูกส่งไปยัง GitHub Issue ของทีมพัฒนาโดยตรง</p>
                    </div>
                    <form onsubmit="submitFeedback(event)" class="p-6 space-y-4">
                        <div>
                            <label for="form-feedback-subject" class="block text-xs font-bold uppercase text-slate-500 mb-1">หัวข้อ</label>
                            <input type="text" id="form-feedback-subject" placeholder="สรุปสั้นๆ ว่าเรื่องอะไร..." class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder:text-slate-500" required>
                        </div>
                        <div>
                            <label for="form-feedback-message" class="block text-xs font-bold uppercase text-slate-500 mb-1">รายละเอียด</label>
                            <textarea id="form-feedback-message" rows="5" placeholder="อธิบายรายละเอียด..." class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder:text-slate-500" required></textarea>
                        </div>
                        <div class="flex justify-end">
                            <button type="submit" id="feedback-submit-btn" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors">ส่งข้อเสนอแนะ</button>
                        </div>
                        <div id="feedback-success" class="hidden bg-emerald-50 border border-emerald-100 rounded-lg p-4 text-sm text-emerald-700 font-semibold">
                            ส่งข้อเสนอแนะสำเร็จ! <a id="feedback-issue-link" href="#" target="_blank" class="underline">ดู Issue ที่นี่</a>
                        </div>
                    </form>
                </div>
            </section>
```

Replace with:
```html
            <section id="content-feedback" class="tab-content hidden space-y-6">
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
                        <div class="p-6 border-b border-slate-100 bg-slate-50/50">
                            <h3 class="font-bold text-base text-slate-800">ส่งข้อเสนอแนะ</h3>
                            <p class="text-xs text-slate-500 mt-1">ข้อเสนอแนะของคุณจะถูกส่งไปยัง GitHub Issue ของทีมพัฒนาโดยตรง</p>
                        </div>
                        <form onsubmit="submitFeedback(event)" class="p-6 space-y-4">
                            <div>
                                <label for="form-feedback-subject" class="block text-xs font-bold uppercase text-slate-500 mb-1">หัวข้อ</label>
                                <input type="text" id="form-feedback-subject" placeholder="สรุปสั้นๆ ว่าเรื่องอะไร..." class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder:text-slate-500" required>
                            </div>
                            <div>
                                <label for="form-feedback-message" class="block text-xs font-bold uppercase text-slate-500 mb-1">รายละเอียด</label>
                                <textarea id="form-feedback-message" rows="5" placeholder="อธิบายรายละเอียด..." class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder:text-slate-500" required></textarea>
                            </div>
                            <div class="flex justify-end">
                                <button type="submit" id="feedback-submit-btn" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors">ส่งข้อเสนอแนะ</button>
                            </div>
                            <div id="feedback-success" class="hidden bg-emerald-50 border border-emerald-100 rounded-lg p-4 text-sm text-emerald-700 font-semibold">
                                ส่งข้อเสนอแนะสำเร็จ! <a id="feedback-issue-link" href="#" target="_blank" class="underline">ดู Issue ที่นี่</a>
                            </div>
                        </form>
                    </div>

                    <div class="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
                        <div class="p-6 border-b border-slate-100 bg-slate-50/50">
                            <h3 class="font-bold text-base text-slate-800">ข้อเสนอแนะที่ส่งไปแล้ว</h3>
                            <p class="text-xs text-slate-500 mt-1">แสดง 10 รายการล่าสุดจาก GitHub Issues</p>
                        </div>
                        <div id="feedback-list-loading" class="p-6 text-sm text-slate-500">กำลังโหลด...</div>
                        <div id="feedback-list-empty" class="hidden p-6 text-sm text-slate-500">ยังไม่มีข้อเสนอแนะที่ส่งไป</div>
                        <div id="feedback-list-error" class="hidden p-6 text-sm text-rose-600">โหลดรายการไม่สำเร็จ ลองรีเฟรชหน้าอีกครั้ง</div>
                        <ul id="feedback-list-body" class="divide-y divide-slate-100"></ul>
                    </div>
                </div>
            </section>
```

- [ ] **Step 2: Manual verify**

Reload the app, go to the feedback tab. Confirm the form card and a new "ข้อเสนอแนะที่ส่งไปแล้ว" card now sit side by side on a wide screen (and stack vertically on a narrow one), with the right card showing "กำลังโหลด..." (it will stay stuck on loading until Task 3 wires the actual fetch — expected at this point).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: split feedback tab into two-column layout with sent-issues list card"
```

---

### Task 3: Fetch and render the sent-issues list

**Files:**
- Modify: `index.html` (new `fetchFeedbackList()` function, added near `submitFeedback`)
- Modify: `index.html:2609-2638` (`switchTab`, add a call for the `feedback` tab)
- Modify: `index.html` (`submitFeedback`'s success branch, add a refresh call)

**Interfaces:**
- Consumes: element ids from Task 2 (`feedback-list-loading`, `feedback-list-empty`, `feedback-list-error`, `feedback-list-body`).
- Produces: `fetchFeedbackList()` — called from `switchTab('feedback')` and from `submitFeedback()`'s success handler.

- [ ] **Step 1: Add `fetchFeedbackList()`**

Insert immediately after `submitFeedback` ends (its last line is `}` right before whatever function currently follows it):

```javascript
        function fetchFeedbackList() {
            const loading = document.getElementById("feedback-list-loading");
            const empty = document.getElementById("feedback-list-empty");
            const errorBox = document.getElementById("feedback-list-error");
            const body = document.getElementById("feedback-list-body");

            loading.classList.remove("hidden");
            empty.classList.add("hidden");
            errorBox.classList.add("hidden");
            body.innerHTML = "";

            fetch("https://api.github.com/repos/TheFirstzOne/Maintenance_System/issues?labels=feedback&state=all&sort=created&direction=desc&per_page=10")
                .then(function (res) { return res.json(); })
                .then(function (issues) {
                    loading.classList.add("hidden");
                    if (!Array.isArray(issues) || issues.length === 0) {
                        empty.classList.remove("hidden");
                        return;
                    }
                    body.innerHTML = issues.map(function (issue) {
                        const isOpen = issue.state === "open";
                        const badgeClass = isOpen ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500";
                        const badgeText = isOpen ? "เปิดอยู่" : "ปิดแล้ว";
                        const dateText = new Date(issue.created_at).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
                        return `
                            <li class="p-4 flex items-start justify-between gap-3">
                                <div class="min-w-0">
                                    <p class="text-sm font-semibold text-slate-800 truncate">${issue.title}</p>
                                    <p class="text-xs text-slate-400 mt-0.5">${dateText}</p>
                                </div>
                                <div class="flex items-center gap-2 flex-shrink-0">
                                    <span class="px-2 py-0.5 text-xs font-semibold rounded-full ${badgeClass}">${badgeText}</span>
                                    <a href="${issue.html_url}" target="_blank" class="text-indigo-600 hover:text-indigo-800">
                                        <i data-lucide="external-link" class="w-4 h-4"></i>
                                    </a>
                                </div>
                            </li>
                        `;
                    }).join("");
                    lucide.createIcons();
                })
                .catch(function (err) {
                    console.error(err);
                    loading.classList.add("hidden");
                    errorBox.classList.remove("hidden");
                });
        }

```

- [ ] **Step 2: Call it when the feedback tab is opened**

Find (`index.html:2630-2632`):
```javascript
            document.getElementById("current-page-title").innerText = titles[tabId];

            if (window.innerWidth < 768) {
```

Replace with:
```javascript
            document.getElementById("current-page-title").innerText = titles[tabId];

            if (tabId === "feedback") {
                fetchFeedbackList();
            }

            if (window.innerWidth < 768) {
```

- [ ] **Step 3: Refresh the list right after a successful submission**

Find:
```javascript
                const successBox = document.getElementById("feedback-success");
                const link = document.getElementById("feedback-issue-link");
                link.href = data.issueUrl;
                successBox.classList.remove("hidden");
                triggerToast("ส่งข้อเสนอแนะสำเร็จ", "success");
```

Replace with:
```javascript
                const successBox = document.getElementById("feedback-success");
                const link = document.getElementById("feedback-issue-link");
                link.href = data.issueUrl;
                successBox.classList.remove("hidden");
                triggerToast("ส่งข้อเสนอแนะสำเร็จ", "success");
                fetchFeedbackList();
```

- [ ] **Step 4: Manual verify — end to end**

With Task 1 deployed and the `feedback` label created on GitHub, reload the app and open the feedback tab. Confirm the right card loads real data (or the empty state, if no feedback issues exist yet with that label). Submit a new piece of feedback and confirm the list refreshes automatically to include it, without needing to leave the tab. Switch to another tab and back — confirm the list re-fetches each time (e.g., visibly flashes "กำลังโหลด..." briefly). To check the error state, temporarily break the URL in `fetchFeedbackList()` (e.g. typo the repo name), reload, confirm the red error message shows and the form on the left is completely unaffected — then revert the typo.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: fetch and render sent feedback issues list"
```

---

## Self-Review Notes

- **Spec coverage:** Direct client-side fetch (no new `Code.gs` read) → Task 3. `feedback` label tagging → Task 1. 2-column layout + card states → Task 2. Refresh triggers (tab switch + post-submit) → Task 3, Steps 2-3. Error handling (list failure doesn't affect the form) → Task 3's `fetchFeedbackList()` isolates all its own DOM updates to the list card's own elements, never touching the form. Every spec section has a task.
- **Type/id consistency checked:** `feedback-list-loading`/`feedback-list-empty`/`feedback-list-error`/`feedback-list-body` defined once in Task 2, each referenced exactly once (read/toggled) in Task 3's `fetchFeedbackList()` — no name drift. `fetchFeedbackList` is the same name in its definition (Task 3, Step 1) and both call sites (Task 3, Steps 2-3).
- **Task ordering:** Task 2 leaves the list card permanently on "กำลังโหลด..." until Task 3 lands — called out explicitly in Task 2's manual-verify step, same intentional-gap pattern used in every prior plan this session. Do Tasks 2 and 3 back-to-back.
