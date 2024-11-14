const Redis = require('ioredis');
const logger = require('../utils/logger');

const redisConfig = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    password: 'a44155702',
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    lazyConnect: true,
    showFriendlyErrorStack: true,
    connectTimeout: 10000,
    reconnectOnError(err) {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
            return true;
        }
        return false;
    }
};

const redis = new Redis(redisConfig);

const initRedis = async () => {
    try {
        await redis.auth('a44155702');
        logger.info('Redis authenticated successfully');
        
        const ping = await redis.ping();
        if (ping === 'PONG') {
            logger.info('Redis connection test successful');
        }
    } catch (error) {
        logger.error('Redis initialization error:', {
            error: error.message,
            stack: error.stack
        });
    }
};

redis.on('connect', () => {
    logger.info('Redis connecting...');
    initRedis().catch(err => {
        logger.error('Redis init error:', err);
    });
});

redis.on('ready', () => {
    logger.info('Redis connection established');
});

redis.on('error', (err) => {
    logger.error('Redis error:', {
        message: err.message,
        stack: err.stack
    });
});

redis.on('close', () => {
    logger.warn('Redis connection closed');
});

module.exports = redis; 