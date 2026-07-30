# Feedback Tab → GitHub Issue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "ข้อเสนอแนะ" tab where any logged-in user can submit a suggestion, which gets forwarded to a real GitHub Issue on `TheFirstzOne/Maintenance_System`.

**Architecture:** New `Code.gs` `doPost` action (`submitFeedback`) calls GitHub's REST API via `UrlFetchApp`, using a token from Script Properties — the only new backend surface. New `index.html` tab (nav button + content section + submit JS) follows the exact same tab/form/write conventions already used by every other tab in this file.

**Tech Stack:** Vanilla JS, Tailwind CDN (existing), Google Apps Script `UrlFetchApp` + `PropertiesService`, GitHub REST API v3 (`/repos/{owner}/{repo}/issues`).

## Global Constraints

- GitHub Issue, not PR — a suggestion isn't a code diff (per spec's "Why an Issue, not a Pull Request" section). Don't build any branch/commit/PR machinery.
- The GitHub PAT lives ONLY in Apps Script Script Properties (`GITHUB_TOKEN`) — never write it into `index.html` or any committed file. This plan assumes the token is already configured by the repo owner before Task 1 is deployed; Task 1's own manual-verify step will fail with a clear "not configured" message if it isn't, which is the correct behavior, not a bug.
- Repo target is hardcoded (`TheFirstzOne/Maintenance_System`) — no config UI, per spec ("a value that never changes").
- No `LockService` needed for the new `Code.gs` function — it's not a read-modify-write against a shared sheet row, just an independent outbound API call per submission.
- Both client-side (`required` attrs) and server-side (`Code.gs`) validation for subject/message, matching this file's existing double-validation convention (e.g. `addStock`/`updateStock`).
- No test framework in this project — every task ends with a manual verification.
- Thai UI copy only, matching the existing tabs' tone.

---

### Task 1: `Code.gs` — `submitFeedback_` + `doPost` wiring

**Files:**
- Modify: `Code.gs` (add `GITHUB_REPO` const + `submitFeedback_` function near the end, before `doPost`)
- Modify: `Code.gs` (`doPost`, add one new branch)

**Interfaces:**
- Produces: `submitFeedback_(payload)` where `payload: {subject, message, name, role}` → `{success: true, issueUrl: string, issueNumber: number}` or `{error: string}`. Consumed by Task 3's `submitFeedback()` frontend function via the `submitFeedback` `doPost` action.

- [ ] **Step 1: Add `GITHUB_REPO` and `submitFeedback_`**

Find (the end of `receiveOrder_`, right before `doPost` — the exact boundary is the blank line and comment immediately preceding `function doPost(e) {`):
```javascript
function doPost(e) {
  let payload;
  try {
    const body = JSON.parse(e.postData.contents); // parse manually regardless of declared content-type
    if (body.action === 'setVerify') {
```

Replace with:
```javascript
const GITHUB_REPO = 'TheFirstzOne/Maintenance_System';

// No LockService here — unlike adjustStockQty_/setVerify_, this doesn't
// read-modify-write a shared sheet row, so there's no race to guard
// against. Each call is an independent, unconditional POST to GitHub.
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

function doPost(e) {
  let payload;
  try {
    const body = JSON.parse(e.postData.contents); // parse manually regardless of declared content-type
    if (body.action === 'setVerify') {
```

- [ ] **Step 2: Wire the `submitFeedback` action into `doPost`**

Find:
```javascript
    } else if (body.action === 'receiveOrder') {
      if ((!body.poNo && !body.prNo) || !body.matCode || !body.qty) {
        throw new Error('Missing required fields');
      }
      payload = receiveOrder_(body);
    } else {
      payload = { error: 'Unknown action: ' + body.action };
    }
```

Replace with:
```javascript
    } else if (body.action === 'receiveOrder') {
      if ((!body.poNo && !body.prNo) || !body.matCode || !body.qty) {
        throw new Error('Missing required fields');
      }
      payload = receiveOrder_(body);
    } else if (body.action === 'submitFeedback') {
      if (!body.subject || !body.message) {
        throw new Error('Missing subject/message');
      }
      payload = submitFeedback_(body);
    } else {
      payload = { error: 'Unknown action: ' + body.action };
    }
```

- [ ] **Step 3: Manual verify**

Paste the full updated `Code.gs` into the Apps Script editor and redeploy (Deploy → Manage deployments → edit → new version). Confirm `GITHUB_TOKEN` is already set in Script Properties (⚙️ Project Settings → Script Properties) — if not, stop here and set it up first (fine-grained PAT, Issues: Read and write, scoped to this repo only). Then from a terminal:

```bash
curl -X POST "<EXEC_URL from index.html:839>" \
  -d '{"action":"submitFeedback","subject":"ทดสอบระบบ","message":"นี่คือข้อความทดสอบจาก curl","name":"ทดสอบ","role":"QA"}'
```

Confirm the response is `{"success":true,"issueUrl":"https://github.com/TheFirstzOne/Maintenance_System/issues/N","issueNumber":N}`, and that a real Issue with that title/body actually appears in the repo. Close/delete that test issue afterward if you don't want it cluttering the tracker.

- [ ] **Step 4: Commit**

```bash
git add Code.gs
git commit -m "feat: add submitFeedback GitHub Issue write action"
```

---

### Task 2: Feedback tab — nav entry + content section

**Files:**
- Modify: `index.html:140-152` (sidebar nav — add a new group before `</nav>`)
- Modify: `index.html:771-772` (insert new `content-feedback` section after `content-quotes` closes)
- Modify: `index.html:2579-2585` (`switchTab`'s `titles` object)

**Interfaces:**
- Produces: `tab-feedback` button (`onclick="switchTab('feedback')"`), `content-feedback` section, form ids `form-feedback-subject`/`form-feedback-message`/`feedback-submit-btn`/`feedback-success`/`feedback-issue-link` — all consumed by Task 3's `submitFeedback()`.

- [ ] **Step 1: Add the nav button as a new group before `</nav>`**

Find:
```html
            <!-- Group 3: Budget & Finance -->
            <div>
                <p class="text-xs font-semibold text-slate-300/80 uppercase tracking-wider px-3 mb-2">การเงินและงบประมาณ</p>
                <div class="space-y-1">
                    <button onclick="switchTab('budget')" id="tab-budget" class="tab-btn w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 text-slate-300 hover:bg-slate-900 hover:text-white focus:ring-2 focus:ring-indigo-500/50 focus:outline-none">
                        <i data-lucide="wallet" class="w-4.5 h-4.5"></i>
                        <span>งบประมาณ</span>
                    </button>
                </div>
            </div>
        </nav>
```

Replace with:
```html
            <!-- Group 3: Budget & Finance -->
            <div>
                <p class="text-xs font-semibold text-slate-300/80 uppercase tracking-wider px-3 mb-2">การเงินและงบประมาณ</p>
                <div class="space-y-1">
                    <button onclick="switchTab('budget')" id="tab-budget" class="tab-btn w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 text-slate-300 hover:bg-slate-900 hover:text-white focus:ring-2 focus:ring-indigo-500/50 focus:outline-none">
                        <i data-lucide="wallet" class="w-4.5 h-4.5"></i>
                        <span>งบประมาณ</span>
                    </button>
                </div>
            </div>

            <!-- Group 4: Support -->
            <div>
                <p class="text-xs font-semibold text-slate-300/80 uppercase tracking-wider px-3 mb-2">ช่วยเหลือ</p>
                <div class="space-y-1">
                    <button onclick="switchTab('feedback')" id="tab-feedback" class="tab-btn w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 text-slate-300 hover:bg-slate-900 hover:text-white focus:ring-2 focus:ring-indigo-500/50 focus:outline-none">
                        <i data-lucide="message-square" class="w-4.5 h-4.5"></i>
                        <span>ข้อเสนอแนะ</span>
                    </button>
                </div>
            </div>
        </nav>
```

- [ ] **Step 2: Add the `content-feedback` section**

Find:
```html
                            <tbody id="quotes-table-body">
                                <!-- Dynamic Quotation list -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>
        </div>
    </main>
```

Replace with:
```html
                            <tbody id="quotes-table-body">
                                <!-- Dynamic Quotation list -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            <!-- 6. FEEDBACK TAB -->
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
        </div>
    </main>
```

- [ ] **Step 3: Add `feedback` to the `titles` map**

Find:
```javascript
            const titles = {
                stock: "คลังอะไหล่",
                orders: "รายการคำสั่งซื้อ",
                rfq: "รายการขอราคา",
                budget: "งบประมาณ",
                quotes: "ประวัติใบเสนอราคา"
            };
```

Replace with:
```javascript
            const titles = {
                stock: "คลังอะไหล่",
                orders: "รายการคำสั่งซื้อ",
                rfq: "รายการขอราคา",
                budget: "งบประมาณ",
                quotes: "ประวัติใบเสนอราคา",
                feedback: "ข้อเสนอแนะ"
            };
```

- [ ] **Step 4: Manual verify**

Reload the app. Confirm a new "ช่วยเหลือ" group with an "ข้อเสนอแนะ" button appears at the bottom of the sidebar nav, directly above the user profile footer. Click it — confirm it switches to a blank-looking form (subject + textarea + submit button), the page title updates to "ข้อเสนอแนะ", and submitting does nothing yet (expected — `submitFeedback()` doesn't exist until Task 3; the browser console will show an error, which is fine at this point in the plan).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: add feedback tab markup and titles entry"
```

---

### Task 3: Wire the feedback form to `Code.gs`

**Files:**
- Modify: `index.html` (add `inFlightFeedback` near the other in-flight state, and a new `submitFeedback` function near the other submit handlers)

**Interfaces:**
- Consumes: `EXEC_URL`, `triggerToast` (existing), `submitFeedback_` via the `submitFeedback` `doPost` action (Task 1), form ids from Task 2.
- Produces: `submitFeedback(event)` — referenced by Task 2's `<form onsubmit="submitFeedback(event)">`.

- [ ] **Step 1: Add `inFlightFeedback` state**

Find:
```javascript
        const inFlightRequests = new Set();
        const inFlightStock = new Set();
        const inFlightReceiving = new Set();
```

Replace with:
```javascript
        const inFlightRequests = new Set();
        const inFlightStock = new Set();
        const inFlightReceiving = new Set();
        let inFlightFeedback = false;
```

- [ ] **Step 2: Add `submitFeedback()`**

Insert immediately after `submitAddStock` ends (the function whose last line is `}` right before the comment `// Toggle displaying low-stock items`):

```javascript
        function submitFeedback(event) {
            event.preventDefault();
            if (inFlightFeedback) return;

            const subject = document.getElementById("form-feedback-subject").value.trim();
            const message = document.getElementById("form-feedback-message").value.trim();
            if (!subject || !message) return;

            const userRaw = localStorage.getItem("maintxProCurrentUser");
            const user = userRaw ? JSON.parse(userRaw) : null;
            const name = user && user.name ? user.name : "ไม่ระบุตัวตน";
            const role = user && user.role ? user.role : "";

            inFlightFeedback = true;
            const btn = document.getElementById("feedback-submit-btn");
            btn.setAttribute("disabled", "true");
            btn.innerText = "กำลังส่ง...";

            fetch(EXEC_URL, {
                method: "POST",
                body: JSON.stringify({
                    action: "submitFeedback",
                    subject: subject,
                    message: message,
                    name: name,
                    role: role
                })
            })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.error) {
                    throw new Error(data.error);
                }
                const successBox = document.getElementById("feedback-success");
                const link = document.getElementById("feedback-issue-link");
                link.href = data.issueUrl;
                successBox.classList.remove("hidden");
                triggerToast("ส่งข้อเสนอแนะสำเร็จ", "success");
            })
            .catch(function (err) {
                console.error(err);
                triggerToast(err.message || "ส่งข้อเสนอแนะไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", "error");
            })
            .finally(function () {
                inFlightFeedback = false;
                btn.removeAttribute("disabled");
                btn.innerText = "ส่งข้อเสนอแนะ";
            });
        }

```

- [ ] **Step 3: Manual verify — end to end**

With Task 1's `Code.gs` deployed, reload the app, go to "ข้อเสนอแนะ", fill in a subject and message, submit. Confirm: the button shows "กำลังส่ง..." and disables briefly, then either the green success box appears with a working "ดู Issue ที่นี่" link that opens the real created Issue on GitHub, or (if you haven't set up `GITHUB_TOKEN` yet) a red toast shows the "GITHUB_TOKEN ยังไม่ถูกตั้งค่า..." message specifically — not a generic error. Log in as `0000` (once that member row exists per the companion login plan) and confirm a submission attributes to "ไม่ระบุตัวตน" in the created Issue's body.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: wire feedback form submission to Code.gs"
```

---

## Self-Review Notes

- **Spec coverage:** GitHub API access / why Issue not PR → Task 1. Frontend tab/form → Task 2. Submit flow/attribution → Task 3. Error handling (missing token, empty fields, GitHub API error) → Task 1's `submitFeedback_` + Task 3's `.catch()`. Every spec section has a task.
- **Type/name consistency checked:** `submitFeedback_`'s return shape (`{success, issueUrl, issueNumber}` or `{error}`) matches exactly what Task 3's `.then()`/`.catch()` reads. Form field ids introduced in Task 2 (`form-feedback-subject`, `form-feedback-message`, `feedback-submit-btn`, `feedback-success`, `feedback-issue-link`) are each referenced exactly once in Task 3, no name drift.
- **Task ordering:** Task 2's form has `onsubmit="submitFeedback(event)"` before that function exists (Task 3) — called out explicitly in Task 2's manual-verify step as an expected, temporary dangling reference, same pattern used in the two prior plans this session.
