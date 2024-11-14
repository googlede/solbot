const Redis = require('ioredis');
const logger = require('../utils/logger');

class CacheService {
    constructor() {
        this.redis = new Redis({
            host: process.env.REDIS_HOST,
            port: process.env.REDIS_PORT,
            password: process.env.REDIS_PASSWORD,
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            }
        });

        this.defaultTTL = 300; // 5分钟
    }

    async get(key) {
        try {
            const data = await this.redis.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error('Cache get error:', error);
            return null;
        }
    }

    async set(key, value, ttl = this.defaultTTL) {
        try {
            await this.redis.set(
                key,
                JSON.stringify(value),
                'EX',
                ttl
            );
        } catch (error) {
            logger.error('Cache set error:', error);
        }
    }

    async mget(keys) {
        try {
            const values = await this.redis.mget(keys);
            return values.map(v => v ? JSON.parse(v) : null);
        } catch (error) {
            logger.error('Cache mget error:', error);
            return keys.map(() => null);
        }
    }

    async mset(keyValuePairs, ttl = this.defaultTTL) {
        try {
            const pipeline = this.redis.pipeline();
            
            keyValuePairs.forEach(([key, value]) => {
                pipeline.set(key, JSON.stringify(value), 'EX', ttl);
            });
            
            await pipeline.exec();
        } catch (error) {
            logger.error('Cache mset error:', error);
        }
    }
}

module.exports = new CacheService(); 