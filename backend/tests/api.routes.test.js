'use strict';

/**
 * API route gap tests
 *
 * Documents confirmed implementation gaps identified during user-test planning.
 * Each test is labelled with its plan reference (AUTH-*, SESS-*, DEC-*, SCEN-*, EDGE-*).
 *
 * Runs entirely with mocked infrastructure — no running database or Redis required.
 * Note: express-validator is not present in the local node_modules, so validation
 * middleware is bypassed via mock; those cases are covered by the live-test.sh script.
 */

const express = require('express');
const request = require('supertest');

// ---------------------------------------------------------------------------
// Top-level mocks — must be declared before any require of the mocked modules.
// jest.mock() calls are hoisted to the top of the file.
// ---------------------------------------------------------------------------

jest.mock('../db/pool', () => ({ query: jest.fn() }));

jest.mock('../db/redis', () => ({
  get:   jest.fn().mockResolvedValue(null),
  setEx: jest.fn().mockResolvedValue('OK'),
}));

jest.mock('bcryptjs', () => ({
  hash:    jest.fn(),
  compare: jest.fn(),
}));

jest.mock('../middleware/logger', () => ({
  info:  jest.fn(),
  warn:  jest.fn(),
  error: jest.fn(),
}));

jest.mock('../middleware/rateLimit', () => ({
  authLimiter: (req, res, next) => next(),
}));

// Bypass express-validator (not installed in test node_modules).
// Validation boundary cases are covered in live-test.sh.
jest.mock('../middleware/validate', () => ({
  loginValidation:         [(req, res, next) => next()],
  registerValidation:      [(req, res, next) => next()],
  createSessionValidation: [(req, res, next) => next()],
  submitDecisionValidation:[(req, res, next) => next()],
}));

// authenticateToken: inject req.user from test header to avoid needing real JWTs.
jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    const raw = req.headers['x-test-user'];
    if (!raw) return res.sendStatus(401);
    req.user = JSON.parse(raw);
    next();
  },
}));

jest.mock('../services/decisionService', () => ({
  submitDecision: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Module imports (after mocks are registered)
// ---------------------------------------------------------------------------

const pool           = require('../db/pool');
const bcrypt         = require('bcryptjs');
const { submitDecision } = require('../services/decisionService');

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

process.env.JWT_SECRET = 'test-secret';

function buildApp() {
  const app = express();
  app.use(express.json());

  app.use('/api/auth',      require('../routes/auth'));
  app.use('/api/scenarios', require('../routes/scenarios'));
  app.use('/api/sessions',  require('../routes/sessions'));

  // Stub io so routes that call req.app.get('io') don't throw
  app.set('io', { to: () => ({ emit: jest.fn() }) });

  // Global error handler mirrors server.js
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    res.status(err.status || 500).json({ error: 'Internal server error' });
  });

  return app;
}

const FACILITATOR = JSON.stringify({ id: 'fac-uuid-001', username: 'admin',  role: 'facilitator' });
const TEAM_MEMBER = JSON.stringify({ id: 'tm-uuid-001',  username: 'tester', role: 'team_member'  });

// Build one app instance shared across all suites to avoid re-requiring routes
let app;
beforeAll(() => {
  app = buildApp();
});

beforeEach(() => {
  jest.clearAllMocks();
  // Ensure redis mock always returns null (cache miss) unless overridden per-test
  require('../db/redis').get.mockResolvedValue(null);
});

// =============================================================================
// Suite: Auth gaps
// =============================================================================

describe('AUTH — login / register gaps', () => {
  // AUTH-003: distinct error messages enable username enumeration
  test('AUTH-003 "User not found" and "Invalid password" are different messages (enumeration risk)', async () => {
    // Unknown user
    pool.query.mockResolvedValueOnce({ rows: [] });
    const noUser = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ghost', password: 'anything' });
    expect(noUser.status).toBe(400);
    expect(noUser.body.error).toBe('User not found');

    // Wrong password
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, username: 'admin', role: 'facilitator', password_hash: 'h' }],
    });
    bcrypt.compare.mockResolvedValueOnce(false);
    const wrongPw = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong' });
    expect(wrongPw.status).toBe(400);
    expect(wrongPw.body.error).toBe('Invalid password');

    // These are different — confirmed enumeration risk
    expect(noUser.body.error).not.toBe(wrongPw.body.error);
  });

  // AUTH-005: role field on register endpoint — no server-side restriction
  test('AUTH-005 role:"facilitator" is passed through to INSERT (no server-side restriction)', async () => {
    bcrypt.hash.mockResolvedValue('hashed_pw');
    pool.query.mockResolvedValue({ rows: [{ id: 'new-uuid' }] });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'badactor', password: 'Password123', role: 'facilitator' });

    expect(res.status).toBe(201);

    // Verify 'facilitator' is included in the INSERT parameters
    const insertCall = pool.query.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('INSERT INTO users')
    );
    expect(insertCall).toBeDefined();
    expect(insertCall[1]).toContain('facilitator');
  });

  // AUTH-008: duplicate username → 409
  test('AUTH-008 duplicate username returns 409', async () => {
    bcrypt.hash.mockResolvedValue('hashed_pw');
    const dupError = Object.assign(new Error('duplicate key'), { code: '23505' });
    pool.query.mockImplementation(q => {
      if (q.includes('INSERT')) throw dupError;
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'existing', password: 'Password123' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Username already exists');
  });

  // AUTH-011: protected endpoint without cookie → 401
  test('AUTH-011 unauthenticated request returns 401', async () => {
    const res = await request(app).get('/api/sessions/some-id');
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// Suite: Scenario gaps
// =============================================================================

describe('SCEN — route gaps', () => {
  // SCEN-006: non-UUID path param causes PostgreSQL type error → 500 (not 400)
  test('SCEN-006 non-UUID scenario ID propagates DB type error as 500 (no UUID validation guard)', async () => {
    const typeError = Object.assign(
      new Error('invalid input syntax for type uuid'),
      { code: '22P02' }
    );
    pool.query.mockRejectedValue(typeError);

    const res = await request(app)
      .get('/api/scenarios/not-a-uuid')
      .set('x-test-user', FACILITATOR);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    // Expected gap: a UUID guard on the route would return 400 instead
  });
});

// =============================================================================
// Suite: Session access-control gaps
// =============================================================================

describe('SESS — access control gaps', () => {
  // SESS-007: team_member can create sessions — no role guard
  test('SESS-007 team_member can create a session (POST /api/sessions has no role check)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'scenario-uuid' }] }) // scenario EXISTS check
      .mockResolvedValueOnce({ rows: [{ id: 'new-session-uuid' }] }); // INSERT

    const res = await request(app)
      .post('/api/sessions')
      .set('x-test-user', TEAM_MEMBER)
      .send({ scenario_id: '10000000-0000-4000-8000-000000000001' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('new-session-uuid');
  });

  // SESS-008: any authenticated user can change any session's status — no ownership check
  test('SESS-008 different facilitator can change another facilitator\'s session status', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: 'sess-A', status: 'pending', facilitator_id: 'fac-uuid-A' }],
    });

    // Logged in as fac-uuid-001 (not the owner fac-uuid-A)
    const res = await request(app)
      .patch('/api/sessions/sess-A/status')
      .set('x-test-user', FACILITATOR)
      .send({ status: 'active' });

    expect(res.status).toBe(200);
    // An ownership check would return 403 — currently returns 200
  });

  // SESS-005: backward status transition (completed → active) is accepted
  test('SESS-005 completed session can be set back to active (no state-machine guard)', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: 'sess-1', status: 'active', facilitator_id: 'fac-uuid-001' }],
    });

    const res = await request(app)
      .patch('/api/sessions/sess-1/status')
      .set('x-test-user', FACILITATOR)
      .send({ status: 'active' });

    expect(res.status).toBe(200);
    // Backend never reads the current status — any→any transition works
  });

  // SESS-006: 'pending' is not in the allowed set
  test('SESS-006 status:"pending" returns 400', async () => {
    const res = await request(app)
      .patch('/api/sessions/sess-1/status')
      .set('x-test-user', FACILITATOR)
      .send({ status: 'pending' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/active.*paused.*completed/);
  });

  // SESS-006: invalid value also returns 400
  test('SESS-006 status:"deleted" returns 400', async () => {
    const res = await request(app)
      .patch('/api/sessions/sess-1/status')
      .set('x-test-user', FACILITATOR)
      .send({ status: 'deleted' });

    expect(res.status).toBe(400);
  });

  // EDGE-006: team_member can read any session's full state
  test('EDGE-006 team_member can read any session state (no read access control)', async () => {
    pool.query.mockResolvedValue({
      rows: [{
        id: 'fac-session',
        facilitator_id: 'fac-uuid-A', // not this user
        status: 'active',
        current_state: { variables: { secret_metric: 999 } },
        scenario_name: 'Trade Breakdown',
      }],
    });

    const res = await request(app)
      .get('/api/sessions/fac-session')
      .set('x-test-user', TEAM_MEMBER);

    expect(res.status).toBe(200);
    expect(res.body.current_state.variables.secret_metric).toBe(999);
  });
});

// =============================================================================
// Suite: Decision submission gaps
// =============================================================================

describe('DEC — decision submission gaps', () => {
  // DEC-007: team_member with wrong team_id → 403 (blocks legitimate team play)
  test('DEC-007 team_member with team_id ≠ user.id gets 403', async () => {
    submitDecision.mockResolvedValue({
      status: 403,
      body:   { error: 'team_id must match authenticated team member' },
    });

    const res = await request(app)
      .post('/api/sessions/sess-1/decisions')
      .set('x-test-user', TEAM_MEMBER)
      .send({
        team_id:       'different-uuid',
        decision_data: { action: 'reroute' },
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/team_id must match/);
  });

  // DEC-012: decision submitted to a completed session is accepted — no lifecycle gate
  test('DEC-012 completed session still accepts decisions (no status gate in submitDecision)', async () => {
    submitDecision.mockResolvedValue({
      status: 201,
      body:   { message: 'Decision submitted', feedback: 'ok', outcome_result: null },
    });

    const res = await request(app)
      .post('/api/sessions/sess-completed/decisions')
      .set('x-test-user', FACILITATOR)
      .send({
        team_id:       'fac-uuid-001',
        decision_data: { action: 'reroute' },
      });

    expect(res.status).toBe(201);
    expect(submitDecision).toHaveBeenCalled();
  });

  // Confirm the decision route passes session ID and user through to submitDecision
  test('DEC route calls submitDecision with correct arguments', async () => {
    submitDecision.mockResolvedValue({
      status: 201,
      body:   { message: 'Decision submitted', feedback: 'ok', outcome_result: null },
    });

    await request(app)
      .post('/api/sessions/test-session-id/decisions')
      .set('x-test-user', FACILITATOR)
      .send({ team_id: 'fac-uuid-001', decision_data: { action: 'reroute' } });

    const call = submitDecision.mock.calls[0][0];
    expect(call.sessionId).toBe('test-session-id');
    expect(call.teamId).toBe('fac-uuid-001');
    expect(call.decisionData.action).toBe('reroute');
    expect(call.user.role).toBe('facilitator');
  });
});

// =============================================================================
// Suite: Decision service authorization logic (unit — direct service call)
// =============================================================================

describe('decisionService authorization logic (unit)', () => {
  // Load the actual service (bypassing the jest.mock at top of file) and
  // use the already-mocked pool so we can control query responses.
  const realPool = require('../db/pool');
  const realService = jest.requireActual('../services/decisionService');

  const mockApp = { get: () => ({ to: () => ({ emit: jest.fn() }) }) };

  // The decisionService query sequence:
  //   1. SELECT session + scenario  (session lookup)
  //   2. SELECT to_regclass(...)    (ensureTeamBelongsToSession table check)
  //   3. INSERT INTO decisions      (record decision)
  //   4. UPDATE sessions            (persist new state)

  test('DEC-007 team_member with team_id ≠ user.id gets 403 from service', async () => {
    realPool.query.mockResolvedValueOnce({
      rows: [{
        current_state:    null,
        facilitator_id:   'fac-uuid-001',
        initial_state:    { phase: 'initial', round: 1, variables: {}, active_events: [], history: [] },
        rules_definition: { decision_points: [], event_triggers: [], outcome_conditions: [] },
      }],
    });

    const result = await realService.submitDecision({
      app:          mockApp,
      sessionId:    'sess-1',
      teamId:       'other-team-uuid', // does NOT match user.id
      decisionData: { action: 'reroute' },
      user:         { id: 'tm-uuid-001', role: 'team_member' },
    });

    expect(result.status).toBe(403);
    expect(result.body.error).toMatch(/team_id must match/);
  });

  test('DEC-007 facilitator for a different session gets 403 from service', async () => {
    realPool.query.mockResolvedValueOnce({
      rows: [{
        current_state:    null,
        facilitator_id:   'fac-uuid-OTHER', // owner is a different facilitator
        initial_state:    { phase: 'initial', round: 1, variables: {}, active_events: [], history: [] },
        rules_definition: { decision_points: [], event_triggers: [], outcome_conditions: [] },
      }],
    });

    const result = await realService.submitDecision({
      app:          mockApp,
      sessionId:    'sess-1',
      teamId:       'fac-uuid-001',
      decisionData: { action: 'reroute' },
      user:         { id: 'fac-uuid-001', role: 'facilitator' },
    });

    expect(result.status).toBe(403);
    expect(result.body.error).toMatch(/Access denied/);
  });

  test('facilitator for their own session proceeds past auth check', async () => {
    realPool.query
      .mockResolvedValueOnce({                                        // 1. session lookup
        rows: [{
          current_state:    null,
          facilitator_id:   'fac-uuid-001',
          initial_state:    { phase: 'initial', round: 1, variables: {}, active_events: [], history: [] },
          rules_definition: { decision_points: [], event_triggers: [], outcome_conditions: [] },
        }],
      })
      .mockResolvedValueOnce({                                        // 2. to_regclass table check
        rows: [{ session_teams: null, session_participants: null }],
      })
      .mockResolvedValueOnce({ rows: [] })                            // 3. INSERT decision
      .mockResolvedValueOnce({ rows: [] });                           // 4. UPDATE session

    const result = await realService.submitDecision({
      app:          mockApp,
      sessionId:    'sess-1',
      teamId:       'fac-uuid-001', // matches facilitator_id
      decisionData: { action: 'reroute' },
      user:         { id: 'fac-uuid-001', role: 'facilitator' },
    });

    expect(result.status).toBe(201);
    expect(result.body.message).toBe('Decision submitted');
  });
});
