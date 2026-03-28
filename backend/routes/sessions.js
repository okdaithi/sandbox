const express = require('express');
const pool = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');
const { createSessionValidation, submitDecisionValidation } = require('../middleware/validate');

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

// Decisions are handled inline here and emit via the io instance attached to app
router.post('/:id/decisions', authenticateToken, submitDecisionValidation, async (req, res, next) => {
  const { id } = req.params;
  const { team_id, decision_data } = req.body;
  try {
    await pool.query(
      'INSERT INTO decisions (session_id, team_id, decision_data, timestamp) VALUES ($1, $2, $3, NOW())',
      [id, team_id, JSON.stringify(decision_data)]
    );
    req.app.get('io').to(`session-${id}`).emit('state_updated', { message: 'Decision processed' });
    res.status(201).json({ message: 'Decision submitted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
