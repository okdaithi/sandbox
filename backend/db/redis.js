const redis = require('redis');
const logger = require('../middleware/logger');

const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => logger.error('Redis client error', { err }));
redisClient.on('connect', () => logger.info('Redis connected'));

redisClient.connect().catch((err) => logger.error('Redis connection failed', { err }));

module.exports = redisClient;
