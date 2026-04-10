# User Test Plan — Scenario Planning Application

> **Purpose:** Probe the limits of current functionality and surface gaps to prioritise the next
> development round.
>
> **Starting state:** App running locally via Docker Compose. Admin/facilitator account installed
> and logged in. No extra functionality beyond what is documented here.
>
> **Test notation:**
> - ✅ Expected to **PASS** (verifies working functionality)
> - ⚠️ Expected to **REVEAL LIMITS** (partial / incomplete behaviour)
> - ❌ Expected to **FAIL** (confirmed implementation gap)

---

## Background Facts

Three cross-cutting facts affect many tests — read these first.

**Fact A — `currentTeamId` is always empty (`Dashboard.tsx:29`, `routes/auth.js:35`)**
The login endpoint returns only `{ username, role }` — no `id`. The Dashboard resolves
`currentTeamId = user?.team_id ?? user?.id ?? ''`, which always yields `''`. The "No team ID"
warning will always appear and the Submit Decision button is always disabled in the UI.
Decision submission only works via direct API call.

**Fact B — No frontend route guards (`App.tsx`)**
`/dashboard` and `/facilitator` are unprotected. Any user (including unauthenticated visitors)
can navigate to either URL directly.

**Fact C — `team_id` ≡ `user.id` for team_members (`decisionService.js:51`)**
The check `String(teamId) !== userId` means a team_member can only submit decisions where
`team_id` equals their own user UUID. There is no team creation/joining flow even though the
`teams` table exists in the schema.

---

## Suite 1 — Authentication & Registration

### AUTH-001 ✅  Valid login end-to-end
**Steps:**
1. Navigate to `http://localhost:3000/`
2. Enter the facilitator username and password → click **Login**

**Expected:**
- `POST /api/auth/login` → 200 `{ user: { username, role: 'facilitator' } }`
- `Set-Cookie: token=…` — httpOnly, SameSite=Strict, maxAge 8 h
- Redux `auth.user` populated; browser navigates to `/dashboard`

---

### AUTH-002 ✅  Wrong password
**Steps:** Login with correct username, wrong password.

**Expected:** 400 `{ error: 'Invalid password' }` displayed as alert.

---

### AUTH-003 ⚠️  Unknown username (username enumeration risk)
**Steps:** Login with a username that does not exist.

**Expected:** 400 `{ error: 'User not found' }` — a **different** message from AUTH-002.

**Limit revealed:** Separate error messages allow an attacker to enumerate valid usernames.

---

### AUTH-004 ✅  Register a new team_member account
**Steps:**
1. Click "Need an account? Register"
2. Enter `username=testuser1`, `password=SecurePass1` → click **Register**
3. Login with the new credentials

**Expected:** 201 on register; login returns `role: 'team_member'`.

---

### AUTH-005 ❌  Self-registration as facilitator via direct API
**Steps (curl / DevTools console):**
```bash
curl -s -X POST http://localhost:5000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"badactor","password":"Password123","role":"facilitator"}'
```

**Expected (actual behaviour):** 201 — the `role` field is validated but not restricted;
anyone can become a facilitator by bypassing the UI.

---

### AUTH-006 ✅  Username validation boundary values
| Input | Expected |
|-------|----------|
| `ab` (2 chars) | 400 — too short |
| `abc` (3 chars) | 201 |
| `test-user` (hyphen) | 400 — invalid chars |
| 51 chars | 400 — too long |
| 50 chars | 201 |

---

### AUTH-007 ✅  Password minimum length (8 chars)
- 7-char password → 400
- 8-char password → 201

---

### AUTH-008 ✅  Duplicate username → 409
Register the same username twice.

**Expected:** 409 `{ error: 'Username already exists' }`.

---

### AUTH-009 ✅  Rate limiting — 11th request within 60 s → 429
```bash
for i in {1..11}; do
  curl -s -X POST http://localhost:5000/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"username":"x","password":"y"}'; echo
done
```

**Expected:** Requests 1–10 return 400; request 11 returns 429.
Note: Response headers use `RateLimit-*` (draft standard), not `X-RateLimit-*`.

---

### AUTH-010 ⚠️  Logout then navigate back to /dashboard
1. Click **Logout**
2. Manually navigate to `http://localhost:3000/dashboard`

**Expected (actual):** Dashboard renders with "Failed to load scenarios" error — no redirect to
login. `App.tsx` has no auth guard.

---

### AUTH-011 ✅  Protected API without cookie → 401 plain text
```bash
curl -s http://localhost:5000/api/scenarios
```

**Expected:** HTTP 401 body `Unauthorized` (plain text — `res.sendStatus(401)`, not JSON).

---

### AUTH-012 ⚠️  Expired / cleared token → 403 with no user-friendly message
1. Log in → open DevTools → delete the `token` cookie
2. Reload Dashboard

**Expected (actual):** 403 from `authenticateToken`; Dashboard shows generic
"Failed to load scenarios" with no "session expired" prompt.

---

## Suite 2 — Scenario Browsing

### SCEN-001 ✅  Scenario list loads
Navigate to Dashboard → 3 scenario cards appear.

**Expected:** `GET /api/scenarios` → 200 `{ data: [...], pagination: { page:1, limit:20, total:3, pages:1 } }`.

---

### SCEN-002 ⚠️  Redis cache covers only page=1, no limit param
1. Load Dashboard (populates cache key `scenarios:list`)
2. Load in a second tab → served from Redis (TTL 300 s)
3. `GET /api/scenarios?limit=20` (explicit param) → **bypasses cache**, hits DB

**Limit:** Cache logic: `if (page === 1 && !req.query.limit)` — explicitly passing the default
value skips the cache. No cache invalidation mechanism exists.

---

### SCEN-003 ⚠️  Pagination edge values
| Request | Expected result |
|---------|----------------|
| `?page=1&limit=1` | 1 scenario, pages=3 |
| `?page=2&limit=1` | 1 scenario (second) |
| `?page=abc&limit=xyz` | parseInt NaN → defaults to page=1, limit=20 |
| `?page=0&limit=0` | clamped to page=1, limit=1 |

---

### SCEN-004 ✅  GET /api/scenarios/:id returns full record
```bash
curl -b cookies.txt http://localhost:5000/api/scenarios/<id>
```

**Expected:** Full JSONB including `initial_state` and `rules_definition` — no field filtering.

---

### SCEN-005 ✅  Non-existent scenario UUID → 404

---

### SCEN-006 ❌  Non-UUID path param → 500 (should be 400)
```bash
curl -b cookies.txt http://localhost:5000/api/scenarios/not-a-uuid
```

**Expected (actual):** PostgreSQL throws a type-cast error → global handler returns 500.
No UUID validation guard on this route.

---

## Suite 3 — Session Lifecycle

### SESS-001 ✅  Facilitator creates a session
1. Navigate to `/facilitator`, select a scenario, click **Create Session**

**Expected:** 201 `{ id }`, status=`pending`, `current_state: null`.

---

### SESS-002 ✅  Start session (pending → active)
Click **Start**.

**Expected:** `start_time` set in DB; `session_status_changed { status:'active' }` broadcast.

---

### SESS-003 ✅  Pause session (active → paused)
Click **Pause**.

**Expected:** Status = `paused`; neither `start_time` nor `end_time` changes.

---

### SESS-004 ⚠️  Complete session — Start button still enabled
Click **End**.

**Expected (partial):** `end_time` set; chip shows "completed". But:
`disabled={session.status === 'active'}` → Start button is **enabled** on a completed session
(not guarded against `completed` status).

---

### SESS-005 ❌  Backward status transition: completed → active
```bash
curl -b cookies.txt -X PATCH http://localhost:5000/api/sessions/<id>/status \
  -H 'Content-Type: application/json' -d '{"status":"active"}'
```

**Expected (actual):** 200 — backend has no state-machine validation; any transition succeeds.

---

### SESS-006 ✅  Invalid status value → 400
```bash
-d '{"status":"deleted"}'   # or "pending"
```

**Expected:** 400 `{ error: 'status must be one of: active, paused, completed' }`.

---

### SESS-007 ❌  team_member creates a session → 201 (no role guard)
```bash
# While logged in as team_member
curl -b cookies.txt -X POST http://localhost:5000/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{"scenario_id":"<valid-uuid>"}'
```

---

### SESS-008 ❌  Facilitator B changes Facilitator A's session status → 200 (no ownership check)

---

### SESS-009 ✅  Non-existent session → 404

---

### SESS-010 ✅  GET /api/sessions/:id/decisions → empty array for new session; populated after decisions submitted

---

## Suite 4 — Decision Submission

### DEC-001 ✅  Keyword match routes to correct option
```bash
curl -b cookies.txt -X POST http://localhost:5000/api/sessions/<id>/decisions \
  -H 'Content-Type: application/json' \
  -d '{"team_id":"<your-user-uuid>","decision_data":{"action":"reroute through cape"}}'
```

**Expected:** Matches `opt_reroute`; state advances; `state_updated` socket event emitted.

---

### DEC-002 ✅  Exact option_id match takes priority over keyword scoring
```bash
-d '{"team_id":"<uuid>","decision_data":{"option_id":"opt_reroute"}}'
```

---

### DEC-003 ⚠️  Gibberish input → silent fallback to first option
```bash
-d '{"team_id":"<uuid>","decision_data":{"action":"xqzwplm sdfghj"}}'
```

**Expected (actual):** Score = 0 for all options; engine returns `options[0]` with no warning.
User receives confident feedback message for an option they did not choose.

---

### DEC-004 ✅  Empty action → 400 validation error

---

### DEC-005 ✅  Whitespace-only action → 400 (`"   ".trim()` = empty)

---

### DEC-006 ✅  Missing team_id → 400

---

### DEC-007 ❌  team_member uses a team_id that differs from their user.id → 403
This blocks legitimate team-based play because the model conflates user identity with team identity.

---

### DEC-008 ✅  First decision bootstraps state from initial_state when current_state is null

---

### DEC-009 ✅  Decision to non-existent session → 404

---

### DEC-010 ✅  Sequential decisions accumulate: history grows, round increments each time

---

### DEC-011 ⚠️  Outcome condition fires but session is NOT auto-completed
Drive `inventory_level` below 10 → `outcome_result` returned in response.

**Limit:** Session remains `active`; facilitator must manually end it.

---

### DEC-012 ❌  Decision submitted to a completed session → 200 (no lifecycle gate)
No status check in `submitDecision`; completed sessions continue to accept and process decisions.

---

### DEC-013 ⚠️  Keyword tie → first option wins (non-intuitive)
Input `"diplomatic"` scores 1 for both `opt_wait` (arrives first in array) and `opt_diplomatic`.
Strict `score > bestScore` means the first option found at the tie score wins.

---

## Suite 5 — Real-time Communication

### RT-001 ✅  Unauthenticated socket → rejected with `'Authentication required'`

---

### RT-002 ✅  Authenticated socket joins session room; receives `session_status_changed`

---

### RT-003 ⚠️  join_session with unknown ID → server sends `error` event but Dashboard has no `socket.on('error', …)` handler — silently swallowed

---

### RT-004 ⚠️  Session room access control
- Facilitator B joining Facilitator A's room → blocked ✅
- Any `team_member` can join **any** session room → not blocked ⚠️

---

### RT-005 ✅  Both open windows receive `state_updated` when one submits a decision

---

### RT-006 ✅  21st socket event within 10 s → `{ message: 'Too many requests' }` error event

---

### RT-007 ✅  Non-string `join_session` payload (number / null / object) → `{ message: 'Invalid session id' }`

---

## Suite 6 — Facilitator Panel End-to-End

### FAC-001 ✅  Full workflow: create → start → receive team decision → pause → end

---

### FAC-002 ⚠️  No session list view; UI allows only one session at a time
Once a session is created, the creation form is hidden. Multiple sessions can exist in the DB
(created via API) but the facilitator has no way to switch between them.

---

### FAC-003 ⚠️  Activity feed shows raw `JSON.stringify(...)` output
Decision events appear as one long unformatted JSON string — unreadable after a few rounds.

---

### FAC-004 ✅  Facilitator's own status changes appear in their activity feed

---

### FAC-005 ❌  Navigate to /facilitator as team_member → fully functional
No frontend route guard; team_member can create and manage sessions via the Facilitator UI.

---

## Suite 7 — Edge Cases & Boundaries

### EDGE-001 ❌  Concurrent decisions → last-write-wins race condition
Fire two simultaneous submissions:
```js
// Browser console (while logged in)
Promise.all([
  fetch('/api/sessions/<id>/decisions', {method:'POST',credentials:'include',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({team_id:'<uuid>',decision_data:{action:'reroute'}})}),
  fetch('/api/sessions/<id>/decisions', {method:'POST',credentials:'include',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({team_id:'<uuid>',decision_data:{action:'wait'}})})
]).then(rs => Promise.all(rs.map(r=>r.json()))).then(console.log)
```

**Expected (actual):** Both decisions recorded in `decisions` table; only the second write's
state mutations survive. No optimistic concurrency control.

---

### EDGE-002 ⚠️  10,000-char action string → accepted (no max-length validation)

---

### EDGE-003 ⚠️  Extra fields in decision_data → silently persisted; engine ignores them

---

### EDGE-004 ✅  `action: 42` (number) → 400 (correct type check)

---

### EDGE-005 ❌  Redis down → GET /api/scenarios returns 500 (no DB fallback)
```bash
docker compose stop redis
curl -b cookies.txt http://localhost:5000/api/scenarios
# Then restart: docker compose start redis
```

---

### EDGE-006 ❌  team_member reads another user's session → 200 full state (no read access control)

---

### EDGE-007 ⚠️  Float precision drift in delta calculations
No rounding or clamping; repeated fractional deltas can cause floating-point drift that
breaks condition comparisons (e.g. `inventory_level >= 70` fails at `69.99999999998`).

---

### EDGE-008 ❌  max_rounds not enforced
`initial_state.max_rounds` exists (5 or 6 depending on scenario) but the engine never checks it.
Sessions run indefinitely past the designed round limit.

---

### EDGE-009 ❌  Seed SQL vs scenario JSON inconsistency for `evt_fuel_spike`
The JSON scenario files use absolute `variable_changes`; the seed SQL uses
`variable_changes_delta`. The seed SQL is what is loaded into the database, so results differ
from documented scenario design intent.

---

## Suite 8 — UX & Navigation

### UX-001 ❌  /dashboard without auth → "Failed to load scenarios" (no redirect to login)

---

### UX-002 ⚠️  Facilitator post-login is redirected to /dashboard (team view)
`Login.tsx` calls `navigate('/dashboard')` unconditionally — no role-aware routing.
Facilitator must manually navigate to `/facilitator`.

---

### UX-003 ✅  Loading spinner during scenario fetch

---

### UX-004 ✅  "Select Scenario" shows "Connecting…" and disables all buttons during session creation

---

### UX-005 ✅  Submit Decision disabled when input field is empty

---

### UX-006 ❌  "No team ID" warning always visible (Submit always disabled in UI)
See **Fact A** above. This is the single most impactful bug for team_member users.

---

### UX-007 ✅  ErrorBoundary renders "Something went wrong" on React render errors

---

### UX-008 ⚠️  Activity feed overflow: raw JSON, no timestamps, no categorisation
After ~5 decisions the feed is unreadable.

---

### UX-009 ⚠️  Login ↔ Register toggle does NOT clear field values

---

### UX-010 ✅  Create Session button disabled until a scenario is selected

---

### UX-011 ❌  Unknown route (e.g. /unknown) → blank page (no 404 catch-all in App.tsx)

---

### UX-012 ⚠️  Enter key submits Login form ✅ but NOT the decision input (no `<form>` wrapper in Dashboard)

---

## Suite 9 — System / Health

### SYS-001 ✅  GET /api/health → 200 `{ status:"ok", timestamp }` (no auth required)

### SYS-002 ✅  CORS allows localhost:3000; blocks other origins

### SYS-003 ✅  Helmet security headers present (`X-Content-Type-Options`, `X-Frame-Options`, no `X-Powered-By`)

### SYS-004 ✅  Unhandled DB errors return 500 `{ error:'Internal server error' }` — no stack trace exposed

---

## Gaps Summary & Next Development Priorities

### Priority 1 — Blocking (Core feature broken)

| Ref | Problem | Root cause | Files to change |
|-----|---------|-----------|----------------|
| P1-A | Submit Decision always disabled in UI | Login response omits `id`; `currentTeamId` always `''` | `routes/auth.js:35`, `Dashboard.tsx:29` |
| P1-B | No team creation or session joining flow | No API routes; `ensureTeamBelongsToSession` falls through to `true` | `routes/sessions.js`, `Dashboard.tsx` |

### Priority 2 — Security

| Ref | Problem | Fix direction |
|-----|---------|--------------|
| P2-A | Self-register as facilitator via API | Remove `role` from public register endpoint |
| P2-B | No role/ownership checks on session write endpoints | `requireRole('facilitator')` middleware; ownership check on PATCH |
| P2-C | No state-machine validation on status transitions | Read current status; enforce legal transition table |
| P2-D | Username enumeration via distinct error messages | Unify to "Invalid credentials"; add constant-time delay |

### Priority 3 — UX / Collaboration

| Ref | Problem | Fix direction |
|-----|---------|--------------|
| P3-A | No route guards — unauthenticated and wrong-role access | `<PrivateRoute>` in `App.tsx`; role-aware post-login redirect |
| P3-B | Raw JSON in activity feeds | Parse and display `round`, `feedback`, `triggered_events`, `outcome_result` |
| P3-C | Silent fallback on gibberish input | Return `keyword_matched: false` flag; show UI warning |
| P3-D | Completed sessions accept more decisions; outcomes don't auto-close session | Lifecycle gate in `submitDecision`; auto-PATCH on non-null `outcome_result` |

### Priority 4 — Robustness

| Ref | Problem | Fix direction |
|-----|---------|--------------|
| P4-A | Redis down → scenarios endpoint 500 | try/catch Redis; fall through to DB |
| P4-B | Concurrent decisions race condition | Add `state_version` column; optimistic locking UPDATE |
| P4-C | No frontend token-expiry handling | Axios interceptor; redirect to `/login` on 401/403 |

### Priority 5 — Engine & Data Quality

| Ref | Problem | Fix direction |
|-----|---------|--------------|
| P5-A | `max_rounds` not enforced | Check `round >= max_rounds` in `processDecision` |
| P5-B | Decision point ordering shadows paths | Reorder DPs so trigger_condition variants precede catch-all |
| P5-C | Seed SQL/JSON inconsistency for event variable changes | Audit and reconcile all three scenarios |

---

## Quick-start Verification Commands

```bash
# 1. Health check
curl http://localhost:5000/api/health

# 2. Log in and save cookie
curl -c /tmp/sp_cookies.txt -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"<password>"}'

# 3. List scenarios
curl -b /tmp/sp_cookies.txt http://localhost:5000/api/scenarios

# 4. Run automated backend tests
make test
```

For socket / real-time tests open two browser windows and use the DevTools Network tab
to inspect WebSocket frames.
