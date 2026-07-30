# Login Restriction + Anonymous User Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate login down to exactly two identities (`1026308039` and `0000`) for a soft-launch phase, add the `0000` anonymous identity, and add a login-page hint pointing users to it.

**Architecture:** Purely additive changes to `index.html`. One new hardcoded allowlist array checked inside the existing `submitLogin()` function, plus one new line of static HTML under the login input. No `Code.gs` changes — login has always been a read-only lookup against the `members` sheet.

**Tech Stack:** Vanilla JS, Tailwind CDN (existing).

## Global Constraints

- No `Code.gs` changes — this feature only touches `index.html` (per spec's Scope section).
- The allowlist check must produce the exact same UI outcome as "member not found" today (same error text, same error element) — gated-out real employees get no special "you're blocked" signal, per spec.
- No test framework in this project — every task ends with a manual browser verification.
- Thai UI copy only, matching the existing login gate's tone.
- One manual, non-code step is required for this feature to fully work: adding a `user_name=0000` row to the `members` Google Sheet tab, with `name=ไม่ระบุตัวตน`. This is a spreadsheet edit, not something committed to this repo, and cannot be done by whoever executes this plan — call this out clearly rather than silently skipping it.

---

### Task 1: Add `LOGIN_ALLOWLIST` and gate `submitLogin()`

**Files:**
- Modify: `index.html:1126-1151` (`submitLogin`)

**Interfaces:**
- Produces: `LOGIN_ALLOWLIST` (a `const string[]`), referenced only within `submitLogin()`.

- [ ] **Step 1: Add the allowlist constant and the gate check**

Find:
```javascript
        function submitLogin() {
            const input = document.getElementById("login-username-input");
            const error = document.getElementById("login-error");
            if (!input) return;
            
            const typedValue = input.value.trim();
            const member = membersList.find(function (m) { return m.userName === typedValue; });
            
            if (!member) {
                if (error) {
                    error.classList.remove("hidden");
                }
                return;
            }
            
            localStorage.setItem("maintxProCurrentUser", JSON.stringify({
                name: member.name,
                role: member.role
            }));
            updateUserProfileSidebar();
            
            const gate = document.getElementById("login-gate");
            if (gate) {
                gate.classList.add("hidden");
            }
        }
```

Replace with:
```javascript
        // Soft-launch gate: only these two user_name values may log in today,
        // even though the members sheet lists 11 people. Remove/extend this
        // array when the wider rollout begins — nothing else about login changes.
        const LOGIN_ALLOWLIST = ["1026308039", "0000"];

        function submitLogin() {
            const input = document.getElementById("login-username-input");
            const error = document.getElementById("login-error");
            if (!input) return;
            
            const typedValue = input.value.trim();
            const member = membersList.find(function (m) { return m.userName === typedValue; });
            
            if (!member || LOGIN_ALLOWLIST.indexOf(member.userName) === -1) {
                if (error) {
                    error.classList.remove("hidden");
                }
                return;
            }
            
            localStorage.setItem("maintxProCurrentUser", JSON.stringify({
                name: member.name,
                role: member.role
            }));
            updateUserProfileSidebar();
            
            const gate = document.getElementById("login-gate");
            if (gate) {
                gate.classList.add("hidden");
            }
        }
```

- [ ] **Step 2: Manual verify**

Serve `index.html` (`python -m http.server`, never `file://`). At the login gate, type an existing real employee's `user_name` that is NOT `1026308039` (e.g. `1026108044`, per the live `members` sheet) — confirm it now shows the same "ไม่พบผู้ใช้งาน" error as a completely unknown code. Then type `1026308039` and confirm normal login still works (sidebar shows "ธนรัตน์ ทรงประไพ" / "หัวหน้าช่าง").

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: restrict login to two identities for soft launch"
```

---

### Task 2: Add anonymous-login hint under the login input

**Files:**
- Modify: `index.html:786-790` (login gate input block)

**Interfaces:**
- None — static HTML only, no new functions or ids referenced elsewhere.

- [ ] **Step 1: Add the hint paragraph**

Find:
```html
            <div class="w-full text-left">
                <label for="login-username-input" class="block text-xs font-bold uppercase text-slate-500 mb-2">ระบุรหัสผู้ใช้งานเพื่อเข้าสู่ระบบ</label>
                <input type="text" id="login-username-input" aria-describedby="login-error" oninput="onLoginInputChange()" placeholder="ใส่รหัสผู้ใช้งาน..." class="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-semibold text-slate-700 bg-white placeholder:text-slate-500">
                <p id="login-error" class="hidden text-xs text-rose-600 mt-2">ไม่พบผู้ใช้งาน<br><span class="text-slate-500 font-medium">ติดต่อผู้ดูแลระบบหากไม่พบรหัสของคุณ</span></p>
            </div>
```

Replace with:
```html
            <div class="w-full text-left">
                <label for="login-username-input" class="block text-xs font-bold uppercase text-slate-500 mb-2">ระบุรหัสผู้ใช้งานเพื่อเข้าสู่ระบบ</label>
                <input type="text" id="login-username-input" aria-describedby="login-error" oninput="onLoginInputChange()" placeholder="ใส่รหัสผู้ใช้งาน..." class="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-semibold text-slate-700 bg-white placeholder:text-slate-500">
                <p id="login-error" class="hidden text-xs text-rose-600 mt-2">ไม่พบผู้ใช้งาน<br><span class="text-slate-500 font-medium">ติดต่อผู้ดูแลระบบหากไม่พบรหัสของคุณ</span></p>
                <p class="text-xs text-slate-400 mt-2">ไม่ต้องการระบุตัวตน? กรอกรหัส <span class="font-semibold">0000</span> เพื่อเข้าใช้งานแบบไม่ระบุตัวตน</p>
            </div>
```

- [ ] **Step 2: Manual verify**

Reload the login gate. Confirm the new hint line renders under the error message area (always visible, not just on error), in a lighter/quieter gray than the input label.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add anonymous-login hint to login gate"
```

---

## Manual step required outside this plan (not code, cannot be automated by an executor)

Add one row to the `members` Google Sheet tab (the sheet bound to `SHEET_ID` in `index.html:1178`):

| user_name | name | role |
|---|---|---|
| `0000` | `ไม่ระบุตัวตน` | *(blank, or a short generic label)* |

Until this row exists, typing `0000` at the login gate will show "ไม่พบผู้ใช้งาน" — this is expected and not a bug in Tasks 1-2's code; the allowlist only restricts *which* matched members may log in, it doesn't create the `0000` member itself.

## Self-Review Notes

- **Spec coverage:** Restriction mechanism → Task 1. Login hint → Task 2. The `0000` sheet row is explicitly called out as a manual step outside the plan's automatable scope (spec's own "manual sheet edit" framing).
- **Type/consistency checked:** `LOGIN_ALLOWLIST` is a plain array of the same string type `member.userName` already is (`String(row[usernameIdx] || '')` in `csvToMembers_`) — `.indexOf()` comparison is a direct string match, no type coercion surprises.
