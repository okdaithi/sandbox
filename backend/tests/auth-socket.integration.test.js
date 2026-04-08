const express = require('express');
const request = require('supertest');

jest.mock('../db/pool', () => ({
  query: jest.fn()
}));

jest.mock('bcryptjs', () => ({
  compare: jest.fn()
}));

jest.mock('../middleware/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

jest.mock('../middleware/rateLimit', () => ({
  authLimiter: (req, res, next) => next()
}));

jest.mock('../middleware/validate', () => ({
  loginValidation: (req, res, next) => next(),
  registerValidation: (req, res, next) => next()
}));

const pool = require('../db/pool');
const bcrypt = require('bcryptjs');
const authRouter = require('../routes/auth');
const { socketAuthMiddleware } = require('../middleware/socketAuth');

describe('auth login + socket handshake', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
  });

  test('accepts socket handshake when login cookie contains a valid JWT', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: 7, username: 'alice', role: 'facilitator', password_hash: 'hash' }]
    });
    bcrypt.compare.mockResolvedValue(true);

    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'password123' });

    expect(loginRes.status).toBe(200);
    const setCookie = loginRes.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookieHeader = setCookie.find((cookie) => cookie.startsWith('token='));
    expect(cookieHeader).toBeDefined();

    const socket = { handshake: { headers: { cookie: cookieHeader } } };

    await new Promise((resolve, reject) => {
      socketAuthMiddleware(socket, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    expect(socket.user).toMatchObject({ id: 7, username: 'alice', role: 'facilitator' });
  });
});
