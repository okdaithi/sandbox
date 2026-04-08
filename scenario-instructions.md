# Scenario Instructions — Developer Guide

Step-by-step guide for integrating, modifying, executing, and testing scenarios in the Interactive Scenario Planning System.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Scenario Schema Reference](#2-scenario-schema-reference)
3. [Included Scenarios](#3-included-scenarios)
4. [Setup Instructions](#4-setup-instructions)
5. [How to Add a New Scenario](#5-how-to-add-a-new-scenario)
6. [How to Run and Test a Scenario](#6-how-to-run-and-test-a-scenario)
7. [Execution Lifecycle](#7-execution-lifecycle)
8. [Common Failure Modes and Fixes](#8-common-failure-modes-and-fixes)
9. [Example Workflow: Edit → Load → Run → Validate](#9-example-workflow-edit--load--run--validate)
10. [Engine Extension Points](#10-engine-extension-points)

---

## 1. Architecture Overview

### System Component Map

```
┌─────────────────────────────────────────────────────────┐
│  FRONTEND (React + TypeScript)                          │
│  src/components/Dashboard.tsx        — team interface   │
│  src/components/FacilitatorPanel.tsx — GM control panel │
│  src/store/index.ts                  — auth state       │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP + WebSocket (Socket.io)
┌────────────────────────▼────────────────────────────────┐
│  BACKEND (Node.js + Express)                            │
│  backend/server.js              — Socket.io hub         │
│  backend/routes/scenarios.js    — scenario listing/fetch│
│  backend/routes/sessions.js     — session + decisions   │
│  backend/engine/scenarioEngine.js — Game Master logic   │
└──────┬──────────────────────────────────────┬───────────┘
       │ SQL (pg)                              │ Redis
┌──────▼──────────┐                  ┌────────▼──────────┐
│  PostgreSQL 15  │                  │  Redis 7           │
│  scenarios table│                  │  scenario list     │
│  sessions table │                  │  cache (5 min TTL) │
│  decisions table│                  └───────────────────┘
└─────────────────┘
```

### Data Flow for Decision Processing

```
Team submits decision (Dashboard.tsx)
  → POST /api/sessions/:id/decisions
  → sessions.js: fetch session.current_state + scenario rules
  → scenarioEngine.processDecision(scenario, currentState, decision)
      → find active decision_point for current phase
      → match team input to best option (keyword scoring)
      → apply state_changes from matched option
      → evaluate event_triggers → cascade variable changes
      → check outcome_conditions → return result if terminal
  → UPDATE sessions SET current_state = engineResult.state
  → io.emit('state_updated', { state, feedback, outcome_result, ... })
  → All connected clients receive state update in real time
```

### Scenario Integration Points

| Location | Purpose |
|---|---|
| `database/seed-scenarios.sql` | Load scenarios into PostgreSQL |
| `scenarios/*.json` | Source of truth for scenario definitions |
| `database/schema.sql` → `scenarios` table | `initial_state` + `rules_definition` JSONB columns |
| `backend/engine/scenarioEngine.js` | Game Master — processes all decisions |
| `backend/routes/sessions.js` POST `/:id/decisions` | Decision injection point |
| `backend/routes/scenarios.js` GET `/:id` | Fetch full scenario for frontend |

---

## 2. Scenario Schema Reference

### Top-Level Structure

```json
{
  "id":          "UUID — stable identifier used in SQL seed",
  "name":        "Short display name (VARCHAR 255)",
  "description": "Full scenario briefing shown to participants",
  "initial_state": { ... },
  "rules_definition": { ... }
}
```

The `id`, `name`, and `description` fields map directly to the `scenarios` DB table.  
`initial_state` and `rules_definition` are stored as PostgreSQL JSONB.

---

### `initial_state` Schema

The starting state that is deep-copied into `sessions.current_state` when a session begins.

```json
{
  "phase":      "string — starting phase name (must exist in rules_definition.phases)",
  "round":      1,
  "max_rounds": 5,
  "variables":  {
    "variable_name": "number | boolean | string — current value"
  },
  "active_events": [],
  "history":       []
}
```

**Rules:**
- All variables referenced in `trigger_condition`, `state_changes`, or `outcome_conditions` **must** be initialised here.
- `history` and `active_events` must be empty arrays in `initial_state`.
- `round` must be `1`.

---

### `rules_definition` Schema

```json
{
  "phases": ["string", "..."],
  "actors": [ Actor ],
  "decision_points": [ DecisionPoint ],
  "event_triggers":  [ EventTrigger ],
  "outcome_conditions": [ OutcomeCondition ]
}
```

#### Actor

```json
{
  "id":          "string — unique identifier",
  "name":        "string — display name",
  "role":        "string — descriptive role label",
  "influence":   "float 0.0–1.0 — relative influence weight",
  "description": "string — briefing text for this actor"
}
```

#### DecisionPoint

```json
{
  "id":                "string — unique identifier",
  "phase":             "string | null — null means active in any phase",
  "title":             "string — display title",
  "description":       "string — full context shown to decision makers",
  "trigger_condition": "Condition | null — null means always active",
  "options": [ Option ]
}
```

#### Option

```json
{
  "id":           "string — stable identifier; teams can submit this as option_id",
  "label":        "string — human-readable option text",
  "keywords":     ["string", "..."],
  "state_changes": {
    "phase":     "string — optional phase transition",
    "variables": { "variable_name": "new_value (absolute replacement)" },
    "variables_delta": {
      "variable_name": "number delta shorthand, e.g. -8",
      "or_variable_name": { "op": "add", "value": -8 }
    }
  },
  "feedback": "string — message returned to the team after this option is matched"
}
```

**Keyword matching:** The engine scores each option by counting how many of its keywords appear in the team's free-text `decision.action`. The highest-scoring option wins. If no keywords match, the first option is used as fallback.

**Explicit selection:** Teams can bypass text matching by sending `{ "option_id": "opt_reroute" }` in `decision_data`.

#### Condition

```json
{
  "variable": "string — key in state.variables",
  "operator": "eq | ne | gt | gte | lt | lte",
  "value":    "number | boolean | string",
  "and":      "Condition | null — all must be true",
  "or":       "Condition | null — either branch is sufficient"
}
```

#### EventTrigger

```json
{
  "id":        "string",
  "condition": "Condition — evaluated against state.variables after option state_changes applied",
  "event": {
    "type":             "string — event type key (deduplicated in active_events)",
    "title":            "string",
    "description":      "string",
    "severity":         "positive | medium | high | critical",
    "variable_changes": { "variable_name": "new_value (absolute replacement)" },
    "variable_changes_delta": {
      "variable_name": "number delta shorthand, e.g. -8",
      "or_variable_name": { "op": "add", "value": -8 }
    }
  }
}
```

Events fire **after** option state_changes are applied. `variable_changes` performs absolute replacement, while `variable_changes_delta` applies additive deltas. Fired events are appended to `state.active_events` and deduplicated by `type` (each event type fires at most once per session).

#### OutcomeCondition

```json
{
  "id":          "string",
  "condition":   "Condition",
  "outcome":     "string — machine-readable outcome key",
  "severity":    "catastrophic | critical | high | success",
  "description": "string — human-readable outcome description"
}
```

Outcome conditions are evaluated in array order. **First match wins.** When an outcome fires, it is returned as `outcome_result` in the API response and the Socket.io broadcast.

---

## 3. Included Scenarios

### Scenario 1 — International Trade Breakdown
- **File:** `scenarios/international-trade.json`
- **DB ID:** `10000000-0000-4000-8000-000000000001`
- **Theme:** Geopolitical strait closure → cascading maritime logistics crisis
- **Rounds:** 5 | **Phases:** initial → escalation → crisis → resolution
- **Key Variables:** `port_capacity`, `inventory_level`, `cash_reserves`, `fuel_cost_index`
- **Decision Points:** Port closure response, supplier diversification, fuel hedging, crisis response, inventory triage

### Scenario 2 — National Infrastructure Failure
- **File:** `scenarios/national-infrastructure.json`
- **DB ID:** `10000000-0000-4000-8000-000000000002`
- **Theme:** Cyber attack on power grid → cascading water + comms failures
- **Rounds:** 6 | **Phases:** initial → triage → coordination → recovery → normalization
- **Key Variables:** `power_grid_status`, `water_system_status`, `public_trust`, `agency_coordination_level`
- **Decision Points:** Emergency declaration, resource prioritisation, comms strategy, command structure, cyber response, recovery timeline

### Scenario 3 — Internal Company Politics
- **File:** `scenarios/company-politics.json`
- **DB ID:** `10000000-0000-4000-8000-000000000003`
- **Theme:** CEO retirement → three-faction leadership conflict
- **Rounds:** 6 | **Phases:** initial → escalation → confrontation → resolution
- **Key Variables:** `stakeholder_alignment`, `political_capital`, `board_confidence`, `team_morale`
- **Decision Points:** Initial positioning, information management, alliance building, budget battle, conflict response, endgame strategy

---

## 4. Setup Instructions

### Step 1 — Clone and configure environment

```bash
git clone <repository-url>
cd sandbox

# Backend environment
cp backend/.env.example backend/.env
# Edit backend/.env — set JWT_SECRET, DATABASE_URL, REDIS_URL

# Frontend environment
cp frontend/.env.example frontend/.env
# Edit frontend/.env — set REACT_APP_API_URL=http://localhost:5000
```

### Step 2 — Start the infrastructure

**Option A — Docker Compose (recommended)**

```bash
cp docker/.env.example docker/.env
# Edit docker/.env with your credentials
docker compose -f docker/docker-compose.yml up -d
```

**Option B — Local services**

```bash
# Start PostgreSQL and Redis manually, then:
cd backend && npm install && node server.js
cd frontend && npm install && npm start
```

### Step 3 — Initialise the database schema

```bash
psql -U <username> -d scenario_planning -f database/schema.sql
```

### Step 4 — Seed the three placeholder scenarios

```bash
psql -U <username> -d scenario_planning -f database/seed-scenarios.sql
```

Verify:

```bash
psql -U <username> -d scenario_planning -c "SELECT id, name FROM scenarios;"
```

Expected output:

```
                  id                  |            name
--------------------------------------+-----------------------------
 10000000-0000-4000-8000-000000000001 | International Trade Breakdown
 10000000-0000-4000-8000-000000000002 | National Infrastructure Failure
 10000000-0000-4000-8000-000000000003 | Internal Company Politics
```

### Step 5 — Verify the engine module

```bash
cd backend
node -e "
const { processDecision } = require('./engine/scenarioEngine');
const s = require('../scenarios/international-trade.json');
const r = processDecision(s, null, { action: 'reroute through alternate port' });
console.log('Phase:', r.state.phase);
console.log('Feedback:', r.feedback);
console.log('Option matched:', r.matched_option);
"
```

Expected: phase changes to `escalation`, feedback describes rerouting consequences.

---

## 5. How to Add a New Scenario

### Step 1 — Copy the scenario template

```bash
cp scenarios/international-trade.json scenarios/my-new-scenario.json
```

### Step 2 — Assign a stable UUID

Generate a UUID:

```bash
node -e "const { randomUUID } = require('crypto'); console.log(randomUUID());"
```

Set this as the `id` field in your JSON file. You will also use it in the SQL insert.

### Step 3 — Define `initial_state`

- Choose a starting `phase` that matches one string in your `rules_definition.phases` array.
- List every variable you will reference in conditions or state_changes under `variables`.
- Set `round: 1`, `max_rounds: <N>`, `active_events: []`, `history: []`.

### Step 4 — Define `rules_definition`

1. **phases** — ordered array of phase name strings.
2. **actors** — list all stakeholders even if the engine does not yet use them; they serve as documentation and can be extended.
3. **decision_points** — list in the order the engine should evaluate them. The engine selects the **first** decision point whose `phase` matches and whose `trigger_condition` evaluates to true.
4. **event_triggers** — each trigger fires when its condition is met after state_changes are applied.
5. **outcome_conditions** — first matching condition ends the scenario with that outcome.

### Step 5 — Insert into the database

Add an INSERT block to `database/seed-scenarios.sql`:

```sql
INSERT INTO scenarios (id, name, description, initial_state, rules_definition, created_at, updated_at)
VALUES (
  '<your-uuid>',
  'My New Scenario',
  'Full briefing text...',
  '{"phase":"initial","round":1,"max_rounds":4,"variables":{...},"active_events":[],"history":[]}'::jsonb,
  '{"phases":[...],"actors":[...],"decision_points":[...],"event_triggers":[...],"outcome_conditions":[...]}'::jsonb,
  NOW(),
  NOW()
);
```

Or insert directly:

```bash
psql -U <username> -d scenario_planning << 'SQL'
INSERT INTO scenarios (id, name, description, initial_state, rules_definition, created_at, updated_at)
VALUES ('<uuid>', 'Name', 'Desc', '<initial_state_json>'::jsonb, '<rules_json>'::jsonb, NOW(), NOW());
SQL
```

### Step 6 — Invalidate Redis cache

The scenario list is cached for 5 minutes in Redis. After inserting:

```bash
redis-cli DEL scenarios:list
```

Or wait 5 minutes for natural expiry.

### Step 7 — Verify in the API

```bash
curl -s -H "Authorization: Bearer <token>" \
  http://localhost:5000/api/scenarios | jq '.data[] | .name'

curl -s -H "Authorization: Bearer <token>" \
  http://localhost:5000/api/scenarios/<your-uuid> | jq '.rules_definition.phases'
```

---

## 6. How to Run and Test a Scenario

### Step 1 — Authenticate

```bash
TOKEN=$(curl -s -c cookies.txt -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"facilitator1","password":"<password>"}' | jq -r '.token // empty')

# If using cookie auth:
COOKIE_OPTS="-b cookies.txt"
```

### Step 2 — Create a session

```bash
SESSION_ID=$(curl -s -X POST http://localhost:5000/api/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"scenario_id":"10000000-0000-4000-8000-000000000001"}' | jq -r '.id')
echo "Session: $SESSION_ID"
```

### Step 3 — Activate the session

```bash
curl -s -X PATCH http://localhost:5000/api/sessions/$SESSION_ID/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"status":"active"}'
```

### Step 4 — Create a team

```bash
TEAM_ID=$(psql -U <username> -d scenario_planning -t -c \
  "INSERT INTO teams (session_id, name, members) VALUES ('$SESSION_ID', 'Team Alpha', '[]'::jsonb) RETURNING id;" \
  | tr -d ' ')
```

### Step 5 — Submit a decision

```bash
# Free-text decision (engine uses keyword matching)
curl -s -X POST http://localhost:5000/api/sessions/$SESSION_ID/decisions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"team_id\":\"$TEAM_ID\",\"decision_data\":{\"action\":\"reroute through alternate port\"}}"

# Explicit option ID (bypasses keyword matching, fully deterministic)
curl -s -X POST http://localhost:5000/api/sessions/$SESSION_ID/decisions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"team_id\":\"$TEAM_ID\",\"decision_data\":{\"action\":\"reroute\",\"option_id\":\"opt_reroute\"}}"
```

Expected response:

```json
{
  "message": "Decision submitted",
  "feedback": "Rerouting adds 18 days and $1.5M...",
  "outcome_result": null
}
```

### Step 6 — Inspect session state

```bash
psql -U <username> -d scenario_planning \
  -c "SELECT current_state->>'phase', current_state->>'round', current_state->'variables' FROM sessions WHERE id='$SESSION_ID';"
```

### Step 7 — Complete the session

```bash
curl -s -X PATCH http://localhost:5000/api/sessions/$SESSION_ID/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"status":"completed"}'
```

---

## 7. Execution Lifecycle

```
1. Scenario loaded from DB (initial_state + rules_definition)
   ↓
2. Session created → status: pending
   ↓
3. Facilitator activates session → status: active, start_time set
   ↓
4. [Per round]
   a. Engine evaluates decision_points in order
   b. First matching decision_point is selected (phase + trigger_condition)
   c. Team submits decision: { action: "free text" } or { option_id: "opt_xyz" }
   d. Engine matches input to best option (keyword scoring or exact ID)
   e. state_changes from matched option applied to state.variables
   f. event_triggers evaluated → fired events cascade variable changes
   g. outcome_conditions checked → if match: session can be ended
   h. state.history appended; state.round incremented
   i. New state persisted to sessions.current_state
   j. state_updated broadcast to all session participants via Socket.io
   ↓
5. Facilitator ends session → status: completed, end_time set
```

---

## 8. Common Failure Modes and Fixes

### Scenario not appearing in the UI

**Cause:** Redis cache holds old scenario list.  
**Fix:** `redis-cli DEL scenarios:list` then reload the page.

### Decision returns generic feedback ("Decision recorded and applied...")

**Cause:** No decision point is active (phase mismatch or trigger_condition not met).  
**Fix:** Check `current_state.phase` against your decision point's `phase` field. Also verify the trigger_condition variables are initialised in `initial_state.variables`.

### Engine always matches the first option

**Cause:** Team's free-text `action` has no keyword overlap with any option.  
**Fix:** Add more `keywords` to your options. Alternatively, instruct teams to use `option_id` for deterministic testing.

### `state_changes` not taking effect on certain variables

**Cause:** The variable referenced in `state_changes.variables` does not exist in `initial_state.variables`.  
**Fix:** Initialise all variables in `initial_state.variables`. The engine merges changes into the existing variables map — it does not create new keys dynamically.

### Event fires multiple times

**Cause:** Event `type` string mismatch between trigger definitions and `active_events` deduplication.  
**Fix:** Ensure `event.type` is unique across all triggers and identical across rounds. The engine deduplicates by `type` string.

### `outcome_result` never returns despite conditions being met

**Cause:** Outcome condition uses a variable not updated by any option's `state_changes`.  
**Fix:** Verify the variable is being modified in the decision path leading to the outcome. Add debug logging in `scenarioEngine.js → checkOutcomeConditions`.

### Session state is null after first decision

**Cause:** `POST /api/sessions/:id/decisions` fails to join with scenarios table.  
**Fix:** Verify the session's `scenario_id` FK matches a valid `scenarios.id`. Run: `SELECT s.id, s.scenario_id, sc.name FROM sessions s JOIN scenarios sc ON sc.id = s.scenario_id WHERE s.id = '<session_id>';`

### PostgreSQL JSONB parse error on seed insert

**Cause:** Single quotes in scenario text not escaped in SQL.  
**Fix:** Double all single quotes in description and feedback strings (`'` → `''`), or use Python to regenerate the seed file:  
```bash
cd /path/to/repo && python3 -c "
import json
# Load scenario JSON and re-generate seed SQL with proper escaping
"
```

---

## 9. Example Workflow: Edit → Load → Run → Validate

This walks through modifying Scenario 1 and validating the change end-to-end.

```bash
# 1. Edit the scenario JSON
nano scenarios/international-trade.json
# Example: change opt_reroute state_changes.variables.shipping_delay_days from 18 to 12

# 2. Regenerate the SQL seed for this scenario only
python3 << 'EOF'
import json
with open('scenarios/international-trade.json') as f:
    s = json.load(f)
istate = json.dumps(s['initial_state'], separators=(',',':')).replace("'","''")
rules  = json.dumps(s['rules_definition'], separators=(',',':')).replace("'","''")
print(f"""
UPDATE scenarios
SET
  initial_state = '{istate}'::jsonb,
  rules_definition = '{rules}'::jsonb,
  updated_at = NOW()
WHERE id = '{s['id']}';
""")
EOF
# Copy the UPDATE statement output and run it:
# psql -U <username> -d scenario_planning -c "<paste UPDATE statement>"

# 3. Invalidate cache
redis-cli DEL scenarios:list

# 4. Test the engine locally (no server required)
node -e "
const { processDecision } = require('./backend/engine/scenarioEngine');
const s = require('./scenarios/international-trade.json');
const r = processDecision(s, null, { action: 'reroute', option_id: 'opt_reroute' });
console.log('shipping_delay_days:', r.state.variables.shipping_delay_days);
console.log('Expected: 12');
"

# 5. Run a full API round-trip
TOKEN=<your_token>
SID=$(curl -s -X POST http://localhost:5000/api/sessions \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"scenario_id":"10000000-0000-4000-8000-000000000001"}' | jq -r '.id')
curl -s -X PATCH http://localhost:5000/api/sessions/$SID/status \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"status":"active"}' > /dev/null
TID=$(psql -U <user> -d scenario_planning -t -c \
  "INSERT INTO teams (session_id,name,members) VALUES ('$SID','T1','[]') RETURNING id;" | tr -d ' ')
curl -s -X POST http://localhost:5000/api/sessions/$SID/decisions \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d "{\"team_id\":\"$TID\",\"decision_data\":{\"action\":\"reroute\",\"option_id\":\"opt_reroute\"}}" | jq .

# 6. Validate state in DB
psql -U <user> -d scenario_planning \
  -c "SELECT current_state->'variables'->>'shipping_delay_days' AS delay FROM sessions WHERE id='$SID';"
# Expected: 12
```

---

## 10. Engine Extension Points

The engine (`backend/engine/scenarioEngine.js`) is designed for direct extension:

### Add a new operator

In `OPERATORS` at the top of the file:

```javascript
const OPERATORS = {
  // ... existing operators ...
  contains: (a, b) => Array.isArray(a) && a.includes(b),
  between:  (a, b) => Array.isArray(b) && a >= b[0] && a <= b[1],
};
```

### Add relative variable changes

Extend `applyStateChanges` to support delta notation (e.g., `"+10"` means add 10 to current value):

```javascript
if (typeof varChanges[key] === 'string' && varChanges[key].startsWith('+')) {
  next.variables[key] = (state.variables[key] || 0) + parseFloat(varChanges[key].slice(1));
} else if (typeof varChanges[key] === 'string' && varChanges[key].startsWith('-')) {
  next.variables[key] = (state.variables[key] || 0) - parseFloat(varChanges[key].slice(1));
}
```

### Add per-team state

Extend the state shape in `initial_state`:

```json
{
  "team_states": {},
  "variables": { ... }
}
```

In the engine, merge team-specific changes into `state.team_states[decision.team_id]`.

### Add round-based automatic events

After outcome_conditions check, add a round trigger pass:

```javascript
const roundTriggers = (rules.round_triggers || []).filter(rt => rt.round === nextState.round);
for (const rt of roundTriggers) {
  nextState = applyStateChanges(nextState, rt.state_changes);
}
```

Round trigger shape in `rules_definition`:

```json
"round_triggers": [
  { "round": 3, "state_changes": { "variables": { "geopolitical_risk_level": 5 } }, "description": "Tensions escalate automatically in round 3" }
]
```
