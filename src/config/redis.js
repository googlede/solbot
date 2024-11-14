const Redis = require('ioredis');
const logger = require('../utils/logger');

class RedisClient {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.isAuthenticating = false;
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
            autoResendUnfulfilledCommands: false,
            reconnectOnError: function (err) {
                const targetError = 'READONLY';
                if (err.message.includes(targetError)) {
                    return true;
                }
                return false;
            }
        });

        this.client.on('connect', async () => {
            logger.info('Redis connecting...');
            await this.authenticate();
        });

        this.client.on('ready', () => {
            this.isConnected = true;
            logger.info('Redis connection established');
        });

        this.client.on('error', async (err) => {
            if (err.message.includes('NOAUTH') && !this.isAuthenticating) {
                await this.authenticate();
            } else if (!err.message.includes('NOAUTH')) {
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
        if (this.isAuthenticating) return;
        
        try {
            this.isAuthenticating = true;
            await this.client.auth('a44155702');
            this.isConnected = true;
            this.isAuthenticating = false;
            logger.info('Redis authenticated successfully');
            
            const ping = await this.client.ping();
            if (ping === 'PONG') {
                logger.info('Redis connection test successful');
            }
        } catch (error) {
            this.isAuthenticating = false;
            this.isConnected = false;
            if (!error.message.includes('NOAUTH')) {
                logger.error('Redis authentication error:', {
                    error: error.message,
                    stack: error.stack
                });
            }
        }
    }

    async get(key) {
        try {
            if (!this.isConnected) {
                await this.authenticate();
            }
            const result = await this.client.get(key);
            return result;
        } catch (error) {
            if (error.message.includes('NOAUTH')) {
                await this.authenticate();
                return await this.client.get(key);
            }
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
            const result = await this.client.set(key, value, ...args);
            return result;
        } catch (error) {
            if (error.message.includes('NOAUTH')) {
                await this.authenticate();
                return await this.client.set(key, value, ...args);
            }
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