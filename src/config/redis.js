const Redis = require('ioredis');
const logger = require('../utils/logger');

class RedisClient {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.initializeClient();
    }

    initializeClient() {
        this.client = new Redis({
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
            autoResubscribe: false,
            autoResendUnfulfilledCommands: false
        });

        this.client.on('connect', () => {
            logger.info('Redis connecting...');
            this.authenticate();
        });

        this.client.on('ready', () => {
            this.isConnected = true;
            logger.info('Redis connection established');
        });

        this.client.on('error', (err) => {
            this.isConnected = false;
            if (err.message.includes('NOAUTH')) {
                this.authenticate();
            } else {
                logger.error('Redis error:', {
                    message: err.message,
                    stack: err.stack
                });
            }
        });

        this.client.on('close', () => {
            this.isConnected = false;
            logger.warn('Redis connection closed');
        });
    }

    async authenticate() {
        try {
            await this.client.auth('a44155702');
            logger.info('Redis authenticated successfully');
            
            const ping = await this.client.ping();
            if (ping === 'PONG') {
                this.isConnected = true;
                logger.info('Redis connection test successful');
            }
        } catch (error) {
            logger.error('Redis authentication error:', {
                error: error.message,
                stack: error.stack
            });
            this.isConnected = false;
        }
    }

    async get(key) {
        try {
            if (!this.isConnected) {
                await this.authenticate();
            }
            return await this.client.get(key);
        } catch (error) {
            logger.error('Redis get error:', {
                key,
                error: error.message
            });
            return null;
        }
    }

    async set(key, value, ...args) {
        try {
            if (!this.isConnected) {
                await this.authenticate();
            }
            return await this.client.set(key, value, ...args);
        } catch (error) {
            logger.error('Redis set error:', {
                key,
                error: error.message
            });
            return false;
        }
    }
}

// 创建单例实例
const redisClient = new RedisClient();

module.exports = redisClient; 