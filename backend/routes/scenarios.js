const express = require('express');
const pool = require('../db/pool');
const redisClient = require('../db/redis');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const SCENARIOS_CACHE_KEY = 'scenarios:list';
const CACHE_TTL = 300; // 5 minutes

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const cached = await redisClient.get(SCENARIOS_CACHE_KEY);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const [dataResult, countResult] = await Promise.all([
      pool.query('SELECT id, name, description FROM scenarios ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]),
      pool.query('SELECT COUNT(*) FROM scenarios')
    ]);

    const response = {
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    };

    // Only cache first page with default limit (most common request)
    if (page === 1 && !req.query.limit) {
      await redisClient.setEx(SCENARIOS_CACHE_KEY, CACHE_TTL, JSON.stringify(response));
    }

    res.json(response);
  } catch (err) {
    next(err);
  }
});

// GET /api/scenarios/:id — full scenario record including initial_state and rules_definition
router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, name, description, initial_state, rules_definition, created_at, updated_at FROM scenarios WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scenario not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
