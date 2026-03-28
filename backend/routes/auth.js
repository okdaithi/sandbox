const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const logger = require('../middleware/logger');
const { authLimiter } = require('../middleware/rateLimit');
const { loginValidation, registerValidation } = require('../middleware/validate');

const router = express.Router();

router.post('/login', authLimiter, loginValidation, async (req, res, next) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) return res.status(400).json({ error: 'User not found' });

    const user = result.rows[0];
    if (!await bcrypt.compare(password, user.password_hash)) {
      return res.status(400).json({ error: 'Invalid password' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res
      .cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 8 * 60 * 60 * 1000
      })
      .json({ user: { username: user.username, role: user.role } });
  } catch (err) {
    next(err);
  }
});

router.post('/register', authLimiter, registerValidation, async (req, res, next) => {
  const { username, password, role = 'team_member' } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
      [username, hashedPassword, role]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username already exists' });
    }
    next(err);
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token').json({ message: 'Logged out' });
});

module.exports = router;
