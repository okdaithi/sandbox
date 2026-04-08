const express = require('express');
const pool = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');
const { createSessionValidation, submitDecisionValidation } = require('../middleware/validate');
const { submitDecision } = require('../services/decisionService');

const router = express.Router();

router.post('/', authenticateToken, createSessionValidation, async (req, res, next) => {
  const { scenario_id } = req.body;
  try {
    // Verify scenario exists
    const scenarioCheck = await pool.query('SELECT id FROM scenarios WHERE id = $1', [scenario_id]);
    if (scenarioCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Scenario not found' });
    }

    const result = await pool.query(
      'INSERT INTO sessions (scenario_id, facilitator_id, status) VALUES ($1, $2, $3) RETURNING id',
      [scenario_id, req.user.id, 'pending']
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticateToken, async (req, res, next) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT s.*, sc.name AS scenario_name
       FROM sessions s
       JOIN scenarios sc ON sc.id = s.scenario_id
       WHERE s.id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/status', authenticateToken, async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;
  const allowed = ['active', 'paused', 'completed'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }
  try {
    const extra = status === 'active'
      ? ', start_time = NOW()'
      : status === 'completed'
        ? ', end_time = NOW()'
        : '';
    const result = await pool.query(
      `UPDATE sessions SET status = $1${extra} WHERE id = $2 RETURNING *`,
      [status, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    req.app.get('io').to(`session-${id}`).emit('session_status_changed', { status });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/decisions', authenticateToken, async (req, res, next) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM decisions WHERE session_id = $1 ORDER BY timestamp ASC',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// Decisions are processed through the scenario engine and persisted
router.post('/:id/decisions', authenticateToken, submitDecisionValidation, async (req, res, next) => {
  const { id } = req.params;
  const { team_id, decision_data } = req.body;
  try {
    const result = await submitDecision({
      app: req.app,
      sessionId: id,
      teamId: team_id,
      decisionData: decision_data,
      user: req.user
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
