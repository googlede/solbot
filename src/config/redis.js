const Redis = require('ioredis');
const logger = require('../utils/logger');

const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    password: 'a44155702',
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    autoResubscribe: true,
    autoResendUnfulfilledCommands: true,
    reconnectOnError(err) {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
            return true;
        }
        return false;
    }
});

redis.on('connect', () => {
    logger.info('Redis connecting...');
});

redis.on('ready', () => {
    logger.info('Redis connection established');
});

redis.on('error', (err) => {
    logger.error('Redis error:', {
        message: err.message,
        stack: err.stack
    });
    
    if (err.message.includes('NOAUTH')) {
        redis.auth('a44155702').catch(authErr => {
            logger.error('Redis auth retry failed:', authErr);
        });
    }
});

redis.on('close', () => {
    logger.warn('Redis connection closed');
});

redis.auth('a44155702').catch(err => {
    logger.error('Initial Redis auth failed:', err);
});

module.exports = redis; 