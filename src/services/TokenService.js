const { Connection, PublicKey } = require('@solana/web3.js');
const logger = require('../utils/logger');
const redis = require('../config/redis');

class TokenService {
    constructor() {
        this.connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
        this.cacheKey = 'top_100_tokens';
        this.cacheExpiry = 60; // 1分钟缓存
    }

    async getTop100Tokens() {
        try {
            // 尝试从缓存获取数据
            const cached = await redis.get(this.cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }

            // 获取实时数据
            const tokens = await this.fetchTokenData();
            
            // 缓存数据
            await redis.set(this.cacheKey, JSON.stringify(tokens), 'EX', this.cacheExpiry);
            
            return tokens;
        } catch (error) {
            logger.error('Error getting top 100 tokens:', error);
            throw error;
        }
    }

    async fetchTokenData() {
        try {
            // 这里添加实际的 Solana token 数据获取逻辑
            // 目前返回模拟数据
            return [
                {
                    symbol: 'SOL',
                    marketCap: 100000000,
                    price: 100,
                    volume24h: 5000000,
                    holders: 1000000,
                    txCount1h: 5000,
                    change1h: 2.5,
                    change24h: 5.0,
                    change7d: 10.0
                },
                // ... 添加更多 token 数据
            ];
        } catch (error) {
            logger.error('Error fetching token data:', error);
            throw error;
        }
    }
}

module.exports = new TokenService();