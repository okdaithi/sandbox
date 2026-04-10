#!/usr/bin/env bash
# =============================================================================
# live-test.sh — Live API test runner for the Scenario Planning application
#
# Runs curl-based checks against a locally running instance.
# Covers the gaps identified in docs/USER_TEST_PLAN.md.
#
# Usage:
#   ./scripts/live-test.sh [BASE_URL] [ADMIN_USER] [ADMIN_PASS]
#
# Defaults:
#   BASE_URL   = http://localhost:5000
#   ADMIN_USER = admin
#   ADMIN_PASS = (prompted if not supplied)
#
# Requirements: curl, jq
# =============================================================================

set -euo pipefail

BASE="${1:-http://localhost:5000}"
ADMIN_USER="${2:-admin}"
COOKIE_JAR="$(mktemp /tmp/sp_cookies.XXXXXX)"

# Prompt for password if not supplied
if [[ $# -ge 3 ]]; then
  ADMIN_PASS="$3"
else
  read -rsp "Admin password: " ADMIN_PASS
  echo
fi

# Colours
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

PASS=0; FAIL=0; WARN=0

pass()  { echo -e "${GREEN}  PASS${NC}  $1"; ((PASS++)); }
fail()  { echo -e "${RED}  FAIL${NC}  $1"; ((FAIL++)); }
warn()  { echo -e "${YELLOW}  WARN${NC}  $1 (limit revealed)"; ((WARN++)); }
header(){ echo -e "\n${YELLOW}=== $1 ===${NC}"; }

# Check dependencies
for cmd in curl jq; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Error: $cmd is required"; exit 1; }
done

# =============================================================================
header "SYS-001 Health check"
# =============================================================================

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/health")
if [[ "$STATUS" == "200" ]]; then
  pass "SYS-001 /api/health → 200"
else
  fail "SYS-001 /api/health → $STATUS (expected 200)"
fi

# =============================================================================
header "AUTH — Login"
# =============================================================================

LOGIN_RESP=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")

LOGIN_ROLE=$(echo "$LOGIN_RESP" | jq -r '.user.role // empty' 2>/dev/null)

if [[ "$LOGIN_ROLE" == "facilitator" ]]; then
  pass "AUTH-001 Admin login returns role:facilitator"
else
  fail "AUTH-001 Admin login failed. Response: $LOGIN_RESP"
  echo "Cannot continue without a valid session. Check credentials and retry."
  rm -f "$COOKIE_JAR"
  exit 1
fi

# =============================================================================
header "AUTH-002 Wrong password → 400"
# =============================================================================

HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"WRONG_PASSWORD_XYZ\"}")
if [[ "$HTTP" == "400" ]]; then
  pass "AUTH-002 Wrong password → 400"
else
  fail "AUTH-002 Expected 400, got $HTTP"
fi

# =============================================================================
header "AUTH-003 Unknown username → 400 'User not found' (enumeration risk)"
# =============================================================================

BODY=$(curl -s -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"absolutely_nonexistent_xyz987","password":"any"}')
MSG=$(echo "$BODY" | jq -r '.error // empty')
if [[ "$MSG" == "User not found" ]]; then
  warn "AUTH-003 'User not found' (distinct from 'Invalid password') enables username enumeration"
else
  fail "AUTH-003 Unexpected error message: $MSG"
fi

# =============================================================================
header "AUTH-005 Self-registration as facilitator via API"
# =============================================================================

UNIQ="badactor_$(date +%s)"
REG_BODY=$(curl -s -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$UNIQ\",\"password\":\"Password123\",\"role\":\"facilitator\"}")
REG_ID=$(echo "$REG_BODY" | jq -r '.id // empty')
if [[ -n "$REG_ID" ]]; then
  fail "AUTH-005 Self-registration as facilitator succeeded (role enforcement is UI-only)"
else
  pass "AUTH-005 Server rejected facilitator self-registration"
fi

# =============================================================================
header "AUTH-006 Username validation"
# =============================================================================

check_register() {
  local label="$1" payload="$2" expected_code="$3"
  local http
  http=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
    -H 'Content-Type: application/json' -d "$payload")
  if [[ "$http" == "$expected_code" ]]; then
    pass "$label → $expected_code"
  else
    fail "$label → $expected_code (got $http)"
  fi
}

SHORT_UNIQ="x$(date +%s%N | tail -c6)"
check_register "AUTH-006 username 2 chars" '{"username":"ab","password":"Password123"}' "400"
check_register "AUTH-006 username with hyphen" '{"username":"test-user","password":"Password123"}' "400"
check_register "AUTH-006 username 51 chars" "{\"username\":\"$(python3 -c 'print("a"*51)')\",\"password\":\"Password123\"}" "400"
check_register "AUTH-007 password 7 chars" "{\"username\":\"${SHORT_UNIQ}\",\"password\":\"Short1!\"}" "400"

# =============================================================================
header "AUTH-011 Unauthenticated API call → 401"
# =============================================================================

HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/scenarios")
if [[ "$HTTP" == "401" ]]; then
  pass "AUTH-011 No cookie → 401"
else
  fail "AUTH-011 Expected 401, got $HTTP"
fi

# =============================================================================
header "SCEN-001 Scenario list"
# =============================================================================

SCEN_RESP=$(curl -s -b "$COOKIE_JAR" "$BASE/api/scenarios")
SCEN_COUNT=$(echo "$SCEN_RESP" | jq '.data | length' 2>/dev/null)
if [[ "$SCEN_COUNT" -ge 1 ]]; then
  pass "SCEN-001 Returned $SCEN_COUNT scenarios"
else
  fail "SCEN-001 Expected ≥1 scenario, got: $SCEN_RESP"
fi

# Grab first scenario ID for later tests
SCEN_ID=$(echo "$SCEN_RESP" | jq -r '.data[0].id')

# =============================================================================
header "SCEN-006 Non-UUID scenario ID → should be 400, actually 500"
# =============================================================================

HTTP=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/api/scenarios/not-a-uuid")
if [[ "$HTTP" == "400" ]]; then
  pass "SCEN-006 Non-UUID id → 400 (validation guard present)"
elif [[ "$HTTP" == "500" ]]; then
  fail "SCEN-006 Non-UUID id → 500 (PostgreSQL type error; UUID validation missing on route)"
else
  warn "SCEN-006 Non-UUID id → $HTTP (unexpected)"
fi

# =============================================================================
header "SESS-001 Create a session"
# =============================================================================

SESS_RESP=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/sessions" \
  -H 'Content-Type: application/json' \
  -d "{\"scenario_id\":\"$SCEN_ID\"}")
SESS_ID=$(echo "$SESS_RESP" | jq -r '.id // empty')
if [[ -n "$SESS_ID" ]]; then
  pass "SESS-001 Session created: $SESS_ID"
else
  fail "SESS-001 Session creation failed: $SESS_RESP"
fi

# =============================================================================
header "SESS-002/003 Status transitions"
# =============================================================================

patch_status() {
  local sess="$1" status="$2"
  curl -s -b "$COOKIE_JAR" -X PATCH "$BASE/api/sessions/$sess/status" \
    -H 'Content-Type: application/json' \
    -d "{\"status\":\"$status\"}"
}

HTTP=$(patch_status "$SESS_ID" "active" | jq -r '.status // empty')
[[ "$HTTP" == "active" ]] && pass "SESS-002 pending → active" || fail "SESS-002 status not active: $HTTP"

HTTP=$(patch_status "$SESS_ID" "paused" | jq -r '.status // empty')
[[ "$HTTP" == "paused" ]] && pass "SESS-003 active → paused" || fail "SESS-003 status not paused: $HTTP"

HTTP=$(patch_status "$SESS_ID" "completed" | jq -r '.status // empty')
[[ "$HTTP" == "completed" ]] && pass "SESS-004 paused → completed" || fail "SESS-004 status not completed: $HTTP"

# =============================================================================
header "SESS-005 Backward transition: completed → active (no state machine)"
# =============================================================================

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" \
  -X PATCH "$BASE/api/sessions/$SESS_ID/status" \
  -H 'Content-Type: application/json' -d '{"status":"active"}')
if [[ "$HTTP_CODE" == "200" ]]; then
  fail "SESS-005 completed→active succeeded (no state-machine guard on backend)"
elif [[ "$HTTP_CODE" == "409" || "$HTTP_CODE" == "400" ]]; then
  pass "SESS-005 Server rejected backward transition → $HTTP_CODE"
else
  warn "SESS-005 Unexpected response: $HTTP_CODE"
fi

# =============================================================================
header "SESS-006 Invalid status value → 400"
# =============================================================================

HTTP=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" \
  -X PATCH "$BASE/api/sessions/$SESS_ID/status" \
  -H 'Content-Type: application/json' -d '{"status":"deleted"}')
[[ "$HTTP" == "400" ]] && pass "SESS-006 status:deleted → 400" || fail "SESS-006 Expected 400, got $HTTP"

HTTP=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" \
  -X PATCH "$BASE/api/sessions/$SESS_ID/status" \
  -H 'Content-Type: application/json' -d '{"status":"pending"}')
[[ "$HTTP" == "400" ]] && pass "SESS-006 status:pending → 400" || fail "SESS-006 Expected 400, got $HTTP"

# =============================================================================
header "SESS-010 Decision list starts empty"
# =============================================================================

DECS=$(curl -s -b "$COOKIE_JAR" "$BASE/api/sessions/$SESS_ID/decisions")
COUNT=$(echo "$DECS" | jq 'length' 2>/dev/null)
[[ "$COUNT" == "0" ]] && pass "SESS-010 Decisions list empty for new session" \
  || warn "SESS-010 Unexpected decision count: $COUNT"

# =============================================================================
header "DEC — Decision submission"
# =============================================================================

# Re-activate the session so decisions can be meaningful
patch_status "$SESS_ID" "active" >/dev/null

USER_ID=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" \
  | jq -r '.user.id // empty' 2>/dev/null || echo "")

# DEC-001: keyword decision
DEC_RESP=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/sessions/$SESS_ID/decisions" \
  -H 'Content-Type: application/json' \
  -d "{\"team_id\":\"$ADMIN_USER\",\"decision_data\":{\"action\":\"reroute through cape\"}}" 2>/dev/null)
DEC_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" \
  -X POST "$BASE/api/sessions/$SESS_ID/decisions" \
  -H 'Content-Type: application/json' \
  -d "{\"team_id\":\"$(echo $DEC_RESP | jq -r '.team_id // "test"')\",\"decision_data\":{\"action\":\"reroute through cape\"}}" 2>/dev/null || echo "000")

# Use the admin user's UUID from the session (facilitator submitting as team_id = own ID)
ADMIN_UUID=$(curl -s -b "$COOKIE_JAR" "$BASE/api/sessions/$SESS_ID" | jq -r '.facilitator_id // empty')
if [[ -z "$ADMIN_UUID" ]]; then
  warn "DEC-001 Could not determine facilitator UUID; skipping decision tests"
else
  DEC_RESP=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/sessions/$SESS_ID/decisions" \
    -H 'Content-Type: application/json' \
    -d "{\"team_id\":\"$ADMIN_UUID\",\"decision_data\":{\"action\":\"reroute through cape\"}}")
  MSG=$(echo "$DEC_RESP" | jq -r '.message // empty')
  if [[ "$MSG" == "Decision submitted" ]]; then
    pass "DEC-001 Keyword decision accepted"
  else
    warn "DEC-001 Unexpected response: $DEC_RESP"
  fi

  # DEC-003: Gibberish falls back silently
  GIB_RESP=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/sessions/$SESS_ID/decisions" \
    -H 'Content-Type: application/json' \
    -d "{\"team_id\":\"$ADMIN_UUID\",\"decision_data\":{\"action\":\"xqzwplm sdfghj zzz\"}}")
  GIB_MSG=$(echo "$GIB_RESP" | jq -r '.message // empty')
  if [[ "$GIB_MSG" == "Decision submitted" ]]; then
    warn "DEC-003 Gibberish accepted and silently fell back to first option (no warning returned)"
  fi

  # DEC-012: Completed session still accepts decisions
  patch_status "$SESS_ID" "completed" >/dev/null
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" \
    -X POST "$BASE/api/sessions/$SESS_ID/decisions" \
    -H 'Content-Type: application/json' \
    -d "{\"team_id\":\"$ADMIN_UUID\",\"decision_data\":{\"action\":\"reroute\"}}")
  if [[ "$HTTP" == "201" ]]; then
    fail "DEC-012 Completed session accepted a decision (no lifecycle gate)"
  elif [[ "$HTTP" == "409" || "$HTTP" == "403" ]]; then
    pass "DEC-012 Completed session rejected decision → $HTTP"
  else
    warn "DEC-012 Unexpected response: $HTTP"
  fi
fi

# =============================================================================
header "DEC-004/005/006 Validation"
# =============================================================================

NEW_SESS=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/sessions" \
  -H 'Content-Type: application/json' \
  -d "{\"scenario_id\":\"$SCEN_ID\"}" | jq -r '.id // empty')

if [[ -n "$NEW_SESS" ]]; then
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" \
    -X POST "$BASE/api/sessions/$NEW_SESS/decisions" \
    -H 'Content-Type: application/json' \
    -d '{"team_id":"00000000-0000-0000-0000-000000000001","decision_data":{"action":""}}')
  [[ "$HTTP" == "400" ]] && pass "DEC-004 Empty action → 400" || fail "DEC-004 Expected 400, got $HTTP"

  HTTP=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" \
    -X POST "$BASE/api/sessions/$NEW_SESS/decisions" \
    -H 'Content-Type: application/json' \
    -d '{"team_id":"00000000-0000-0000-0000-000000000001","decision_data":{"action":"   "}}')
  [[ "$HTTP" == "400" ]] && pass "DEC-005 Whitespace action → 400" || fail "DEC-005 Expected 400, got $HTTP"

  HTTP=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" \
    -X POST "$BASE/api/sessions/$NEW_SESS/decisions" \
    -H 'Content-Type: application/json' \
    -d '{"decision_data":{"action":"reroute"}}')
  [[ "$HTTP" == "400" ]] && pass "DEC-006 Missing team_id → 400" || fail "DEC-006 Expected 400, got $HTTP"
fi

# =============================================================================
header "EDGE-006 team_member reads another user's session (no read access control)"
# =============================================================================

# Register a fresh team_member to check cross-session reads
TM_USER="tm_$(date +%s)"
curl -s -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$TM_USER\",\"password\":\"Password123\"}" >/dev/null

TM_COOKIE="$(mktemp /tmp/sp_tm_cookies.XXXXXX)"
curl -s -c "$TM_COOKIE" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$TM_USER\",\"password\":\"Password123\"}" >/dev/null

TM_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -b "$TM_COOKIE" "$BASE/api/sessions/$SESS_ID")
if [[ "$TM_HTTP" == "200" ]]; then
  fail "EDGE-006 team_member read facilitator's session → 200 (no access control)"
elif [[ "$TM_HTTP" == "403" || "$TM_HTTP" == "404" ]]; then
  pass "EDGE-006 team_member blocked from reading facilitator's session → $TM_HTTP"
else
  warn "EDGE-006 Unexpected response: $TM_HTTP"
fi
rm -f "$TM_COOKIE"

# =============================================================================
header "AUTH-009 Rate limiting (11 rapid login requests)"
# =============================================================================

echo "  Sending 11 rapid login requests..."
LAST_HTTP=""
for i in $(seq 1 11); do
  LAST_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"username":"ratelimit_probe","password":"wrong"}')
done
if [[ "$LAST_HTTP" == "429" ]]; then
  pass "AUTH-009 11th request rate-limited → 429"
else
  warn "AUTH-009 11th request → $LAST_HTTP (rate limit may not have triggered in this window)"
fi

# =============================================================================
# Summary
# =============================================================================

echo ""
echo "============================================"
echo -e " Results: ${GREEN}$PASS PASS${NC}  ${RED}$FAIL FAIL${NC}  ${YELLOW}$WARN LIMIT${NC}"
echo "============================================"
echo ""
if [[ "$FAIL" -gt 0 ]]; then
  echo "  FAIL = confirmed implementation gap (see docs/USER_TEST_PLAN.md)"
fi
if [[ "$WARN" -gt 0 ]]; then
  echo "  LIMIT = behaviour works but reveals incomplete functionality"
fi
echo ""

rm -f "$COOKIE_JAR"
[[ "$FAIL" -gt 0 ]] && exit 1 || exit 0
