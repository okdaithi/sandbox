# User Test Plan: Current Functionality Limits & Next Improvements

## Objective
Validate what the currently running app can and cannot do from a real user perspective, then convert findings into prioritized product improvements.

## Scope Assumptions
Current environment status (from operator notes):
- App runs locally.
- Admin/facilitator account is installed and logged in.
- No additional functionality appears available from the UI.

This plan focuses on **observable behavior** of the shipped experience (not code-level unit testing).

---

## Test Approach
- Run short, task-based tests as different user personas.
- Capture outcomes as one of:
  - **Pass**: behavior exists and works consistently.
  - **Partial**: behavior exists but with major UX or reliability issues.
  - **Fail / Missing**: behavior not available or blocked.
- For each failure, log:
  - exact user goal,
  - blocker,
  - severity,
  - proposed improvement.

Suggested log template (copy/paste per test):

```
Test ID:
Persona:
Goal:
Result: Pass / Partial / Fail
Evidence (steps, screenshot, error text):
Severity: Critical / High / Medium / Low
Improvement candidate:
```

---

## Persona Set
1. **Facilitator/Admin** (currently available)
2. **Participant/Team Member** (if role creation/joining exists)
3. **Observer/Read-only Stakeholder** (if any non-editing view exists)

If only Facilitator is currently possible, still execute participant/observer scenarios and log them as capability gaps.

---

## Test Series A — Access, Auth, and Session Continuity

### A1. Cold start access
- Open app URL in fresh browser session.
- Verify login gate behavior.
- Confirm redirect behavior after login.

**Purpose:** confirm base navigation and authentication entry path.

### A2. Invalid credential handling
- Attempt login with wrong password.
- Attempt with unknown username.
- Verify message clarity and no app crash.

**Purpose:** identify resilience and user guidance quality.

### A3. Session persistence
- Refresh page while logged in.
- Close/reopen tab.
- Wait idle for 15+ minutes and perform action.

**Purpose:** determine practical auth/session timeout limits.

### A4. Logout path and re-entry
- Logout and confirm protected pages are no longer accessible.
- Use browser back button after logout.

**Purpose:** validate secure state transitions.

---

## Test Series B — Information Architecture and Discoverability

### B1. Primary navigation clarity
- From landing/dashboard, list all visible actions.
- Rate each action label as clear/unclear.

### B2. Empty-state quality
- Inspect screens with no sessions, teams, or decisions.
- Check whether next steps are obvious.

### B3. Dead-end detection
- Attempt to complete a “typical facilitator flow” (create/run/manage).
- Identify where flow becomes impossible.

**Purpose (B-series):** measure how quickly users understand “what can I do next?” and where product currently stops.

---

## Test Series C — Facilitator Core Workflow (Current Capability Boundary)

### C1. Scenario visibility
- Verify whether scenario list appears.
- Attempt to open details and understand initial state/rules at a high level.

### C2. Session creation attempt
- Attempt to create a new session from available UI controls.
- Record any required fields and validation behavior.

### C3. Session state controls
- If session exists, attempt status transitions (e.g., planned → active → closed).
- Observe whether UI feedback is immediate and persistent after refresh.

### C4. Decision intake visibility
- Check for any panel showing incoming team decisions.
- If absent, record as missing facilitator operation.

### C5. Audit/history traceability
- Attempt to find timeline/event history for the active session.

**Purpose:** confirm whether “run a simulation” is operational or only scaffolded.

---

## Test Series D — Participant Journey (Gap Discovery)

### D1. Participant account path
- Attempt to discover participant registration/invite flow.

### D2. Join session flow
- Attempt to join an existing session as non-facilitator.

### D3. Submit decision flow
- Attempt to submit a decision and confirm success feedback.

### D4. Real-time updates
- Open two browsers (facilitator + participant, if possible).
- Verify whether state changes broadcast live without refresh.

**Purpose:** determine if multi-user simulation loop is currently possible end-to-end.

---

## Test Series E — Reliability and Limits (Exploratory)

### E1. Multi-tab behavior
- Open same account in multiple tabs and perform concurrent actions.

### E2. Rapid action stress
- Trigger the same action repeatedly (e.g., save/create/start).
- Watch for duplicate records, hangs, or errors.

### E3. Network interruption recovery
- Temporarily disconnect/reconnect network while on active page.
- Check reconnection messaging and data consistency.

### E4. Long-running session stability
- Keep app open for 30–60 minutes.
- Observe memory/performance degradation and stale UI risk.

**Purpose:** reveal non-functional boundaries before adding features.

---

## Test Series F — UX and Accessibility Baseline

### F1. Keyboard-only operation
- Navigate key screens using Tab/Shift+Tab/Enter/Escape only.

### F2. Error message quality
- For each failed action, judge if message explains what to do next.

### F3. Mobile viewport sanity check
- Use responsive mode (or phone browser) and verify basic usability.

### F4. Terminology consistency
- Note inconsistent labels (session/scenario/round/team, etc.).

**Purpose:** gather fast UX debt backlog before feature expansion.

---

## Prioritization Framework for Next Round
After executing tests, map findings into this backlog structure:

## P0 (Critical, unblock core use)
- Items that prevent a facilitator from creating/running a session.
- Items that break auth or data integrity.

## P1 (High, required for real pilot)
- Participant join + submit decision path.
- Real-time state visibility and reliable feedback.

## P2 (Medium, quality and scale-up)
- Better empty states, navigation cues, and usability polish.
- Reliability hardening (reconnect, duplicate prevention, long-session stability).

## P3 (Low, optimization)
- Advanced dashboards, analytics, visual enhancements.

---

## Suggested First Improvement Slice (if most tests fail at setup)
If testing confirms only login/dashboard scaffolding works, implement next sprint in this order:

1. **Create session from UI** (scenario selector + start action)
2. **Participant join mechanism** (code/link + team assignment)
3. **Decision submission form** (single structured input path)
4. **Facilitator live decision feed** (real-time updates + acknowledgement)
5. **Clear empty/error states** for each core screen

This sequence produces a minimum end-to-end loop quickly and makes subsequent testing far more meaningful.

---

## Execution Plan (1 day)
- **Hour 1:** A + B series (access/navigation baseline)
- **Hours 2–3:** C + D series (core product boundary)
- **Hour 4:** E + F series (reliability/UX checks)
- **Hour 5:** triage findings into P0–P3 with implementation candidates

Deliverable: a prioritized backlog with user evidence tied to each gap.
