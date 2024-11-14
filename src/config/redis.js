const Redis = require('ioredis');
const logger = require('../utils/logger');

class RedisClient {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.isAuthenticating = false;
        this.authRetryCount = 0;
        this.maxAuthRetries = 3;
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
            reconnectOnError(err) {
                if (err.message.includes('READONLY') || err.message.includes('NOAUTH')) {
                    return 2;
                }
                return false;
            }
        });

        this.client.on('connect', () => {
            logger.info('Redis connecting...');
            this.authenticate().catch(err => {
                logger.error('Initial authentication failed:', err);
            });
        });

        this.client.on('ready', () => {
            this.isConnected = true;
            logger.info('Redis connection established');
        });

        this.client.on('error', (err) => {
            if (!err.message.includes('NOAUTH')) {
                logger.error('Redis error:', {
                    message: err.message,
                    stack: err.stack
                });
            }
            this.handleError(err);
        });

        this.client.on('close', () => {
            this.isConnected = false;
            logger.warn('Redis connection closed');
        });
    }

    async handleError(err) {
        if (err.message.includes('NOAUTH') && !this.isAuthenticating) {
            await this.authenticate();
        }
    }

    async authenticate() {
        if (this.isAuthenticating || this.authRetryCount >= this.maxAuthRetries) {
            return;
        }

        try {
            this.isAuthenticating = true;
            this.authRetryCount++;
            
            await this.client.auth('a44155702');
            
            this.isConnected = true;
            this.isAuthenticating = false;
            this.authRetryCount = 0;
            
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
                    stack: error.stack,
                    retryCount: this.authRetryCount
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

const redisClient = new RedisClient();
module.exports = redisClient; 