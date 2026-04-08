const pool = require('../db/pool');
const { processDecision } = require('../engine/scenarioEngine');

const ensureTeamBelongsToSession = async (sessionId, teamId) => {
  const relationshipTableCheck = await pool.query(
    `SELECT to_regclass('public.session_teams') AS session_teams,
            to_regclass('public.session_participants') AS session_participants`
  );

  const { session_teams, session_participants } = relationshipTableCheck.rows[0];

  if (session_teams) {
    const relation = await pool.query(
      'SELECT 1 FROM session_teams WHERE session_id = $1 AND team_id = $2 LIMIT 1',
      [sessionId, teamId]
    );
    return relation.rows.length > 0;
  }

  if (session_participants) {
    const relation = await pool.query(
      'SELECT 1 FROM session_participants WHERE session_id = $1 AND team_id = $2 LIMIT 1',
      [sessionId, teamId]
    );
    return relation.rows.length > 0;
  }

  return true;
};

const submitDecision = async ({ app, sessionId, teamId, decisionData, user }) => {
  const sessionResult = await pool.query(
    `SELECT s.current_state, s.facilitator_id, sc.initial_state, sc.rules_definition
     FROM sessions s
     JOIN scenarios sc ON sc.id = s.scenario_id
     WHERE s.id = $1`,
    [sessionId]
  );

  if (sessionResult.rows.length === 0) {
    return { status: 404, body: { error: 'Session not found' } };
  }

  const { current_state, facilitator_id, initial_state, rules_definition } = sessionResult.rows[0];

  const userId = String(user?.id || '');
  if (user?.role === 'facilitator' && String(facilitator_id) !== userId) {
    return { status: 403, body: { error: 'Access denied for this session' } };
  }

  if (user?.role === 'team_member' && String(teamId) !== userId) {
    return { status: 403, body: { error: 'team_id must match authenticated team member' } };
  }

  const teamBelongsToSession = await ensureTeamBelongsToSession(sessionId, teamId);
  if (!teamBelongsToSession) {
    return { status: 403, body: { error: 'team_id is not part of this session' } };
  }

  const engineResult = processDecision(
    { initial_state, rules_definition },
    current_state,
    decisionData
  );

  await pool.query(
    'INSERT INTO decisions (session_id, team_id, decision_data, timestamp, processed) VALUES ($1, $2, $3, NOW(), TRUE)',
    [sessionId, teamId, JSON.stringify(decisionData)]
  );

  await pool.query(
    'UPDATE sessions SET current_state = $1 WHERE id = $2',
    [JSON.stringify(engineResult.state), sessionId]
  );

  app.get('io').to(`session-${sessionId}`).emit('state_updated', {
    state: engineResult.state,
    feedback: engineResult.feedback,
    triggered_events: engineResult.triggered_events,
    outcome_result: engineResult.outcome_result,
    decision_point: engineResult.decision_point,
    matched_option: engineResult.matched_option
  });

  return {
    status: 201,
    body: {
      message: 'Decision submitted',
      feedback: engineResult.feedback,
      outcome_result: engineResult.outcome_result
    }
  };
};

module.exports = { submitDecision };
