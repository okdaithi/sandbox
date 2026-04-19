require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const logger = require('./middleware/logger');
const { socketAuthMiddleware } = require('./middleware/socketAuth');
const pool = require('./db/pool');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Expose io instance on app for use in route handlers
app.set('io', io);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(compression());
app.use(express.json());
app.use(cookieParser());

// Health check — used by load balancer health checks
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/scenarios', require('./routes/scenarios'));
app.use('/api/sessions', require('./routes/sessions'));

// Socket.io auth middleware — verify JWT before allowing connection
io.use(socketAuthMiddleware);

// Socket.io event handlers
io.on('connection', (socket) => {
  logger.info('User connected', { socketId: socket.id, userId: socket.user?.id });

  const eventWindowMs = 10 * 1000;
  const eventMaxCount = 20;
  const eventCounters = new Map();

  const isRateLimited = (eventName) => {
    const now = Date.now();
    const existing = eventCounters.get(eventName);

    if (!existing || now - existing.windowStart >= eventWindowMs) {
      eventCounters.set(eventName, { windowStart: now, count: 1 });
      return false;
    }

    existing.count += 1;
    if (existing.count > eventMaxCount) {
      return true;
    }

    return false;
  };

  socket.on('join_session', async (sessionId) => {
    try {
      if (isRateLimited('join_session')) {
        socket.emit('error', { message: 'Too many requests' });
        return;
      }

      if (typeof sessionId !== 'string' || !sessionId.trim()) {
        socket.emit('error', { message: 'Invalid session id' });
        return;
      }

      const sessionResult = await pool.query(
        'SELECT id, facilitator_id FROM sessions WHERE id = $1',
        [sessionId]
      );

      if (sessionResult.rows.length === 0) {
        socket.emit('error', { message: 'Session not found' });
        return;
      }

      const session = sessionResult.rows[0];
      const userId = String(socket.user?.id || '');
      const isFacilitator = String(session.facilitator_id) === userId;
      const userRole = socket.user?.role;

      if (userRole === 'facilitator' && !isFacilitator) {
        socket.emit('error', { message: 'Access denied for this session' });
        return;
      }

      socket.join(`session-${sessionId}`);
      socket.data.sessionId = sessionId;
      socket.to(`session-${sessionId}`).emit('participant_joined', {
        userId: socket.user?.id,
        username: socket.user?.username
      });
      logger.info('User joined session', { socketId: socket.id, sessionId });
    } catch (err) {
      logger.warn('join_session failed', { socketId: socket.id, err: err.message });
      socket.emit('error', { message: 'Unable to join session' });
    }
  });

  socket.on('disconnect', () => {
    const sessionId = socket.data.sessionId;
    if (sessionId) {
      socket.to(`session-${sessionId}`).emit('participant_left', {
        userId: socket.user?.id,
        username: socket.user?.username
      });
    }
    logger.info('User disconnected', { socketId: socket.id });
  });
});

// Global error handler (must be last middleware)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { err: err.message, stack: err.stack, path: req.path });
  res.status(err.status || 500).json({ error: 'Internal server error' });
});

async function start() {
  // Initialize Socket.io Redis adapter for multi-replica support
  const pubClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
  const subClient = pubClient.duplicate();
  pubClient.on('error', (err) => logger.error('Redis pub client error', { err }));
  subClient.on('error', (err) => logger.error('Redis sub client error', { err }));
  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
  logger.info('Socket.io Redis adapter initialized');

  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });
}

start().catch((err) => {
  logger.error('Failed to start server', { err });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    const pool = require('./db/pool');
    pool.end();
    process.exit(0);
  });
});

module.exports = app;
