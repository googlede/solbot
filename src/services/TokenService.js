const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const logger = require('../utils/logger');
const redis = require('../config/redis');
const PriceService = require('./PriceService');

class TokenService {
    constructor() {
        // 更新 RPC 节点列表，使用更可靠的节点
        this.rpcUrls = [
            'https://api.mainnet-beta.solana.com',
            'https://rpc.ankr.com/solana',
            'https://solana-mainnet.rpc.extrnode.com',
            'https://solana.public-rpc.com'
        ];
        this.currentRpcIndex = 0;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.initConnection();

        this.marketCapFilters = {
            '10k': 10000,
            '50k': 50000,
            '150k': 150000,
            '500k': 500000,
            '1m': 1000000
        };
        this.defaultFilter = '50k';
    }

    initConnection() {
        try {
            const rpcUrl = this.rpcUrls[this.currentRpcIndex];
            logger.info(`Initializing Solana connection with RPC: ${rpcUrl}`);
            
            this.connection = new Connection(rpcUrl, {
                commitment: 'confirmed',
                confirmTransactionInitialTimeout: 60000,
                wsEndpoint: undefined // 禁用 WebSocket 连接
            });
        } catch (error) {
            logger.error('Failed to initialize Solana connection:', error);
            this.switchRpcNode();
        }
    }

    async switchRpcNode() {
        this.currentRpcIndex = (this.currentRpcIndex + 1) % this.rpcUrls.length;
        logger.info(`Switching to RPC node: ${this.rpcUrls[this.currentRpcIndex]}`);
        this.initConnection();
        this.retryCount++;

        if (this.retryCount >= this.maxRetries * this.rpcUrls.length) {
            logger.error('Max retries reached for all RPC nodes');
            this.retryCount = 0;
            throw new Error('All RPC nodes failed');
        }
    }

    async getTopTokens(marketCapFilter = this.defaultFilter, limit = 200) {
        try {
            const cacheKey = `top_tokens_${marketCapFilter}_${limit}`;
            
            // 尝试从缓存获取
            try {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    logger.info('Returning cached token data');
                    return JSON.parse(cached);
                }
            } catch (cacheError) {
                logger.error('Cache error:', cacheError);
            }

            // 如果没有缓存数据，返回模拟数据（临时解决方案）
            const mockData = {
                tokens: [
                    {
                        symbol: 'SOL',
                        marketCap: 20000000000,
                        price: 60.5,
                        volume24h: 1500000000,
                        holders: 500000,
                        txCount1h: 25000,
                        change1h: 2.5,
                        change24h: 5.2,
                        change7d: -3.1
                    },
                    // 添加更多模拟数据...
                ],
                filter: {
                    marketCap: this.marketCapFilters[marketCapFilter],
                    filterLabel: this.formatMarketCapLabel(marketCapFilter),
                    totalCount: 1,
                    displayCount: limit,
                    timestamp: new Date().toISOString()
                }
            };

            // 缓存模拟数据
            try {
                await redis.set(cacheKey, JSON.stringify(mockData), 'EX', 60);
                logger.info('Cached mock data');
            } catch (cacheError) {
                logger.error('Failed to cache mock data:', cacheError);
            }

            return mockData;
        } catch (error) {
            logger.error('Error in getTopTokens:', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    formatMarketCapLabel(key) {
        switch(key) {
            case '10k': return 'Market Cap ≥ $10,000';
            case '50k': return 'Market Cap ≥ $50,000';
            case '150k': return 'Market Cap ≥ $150,000';
            case '500k': return 'Market Cap ≥ $500,000';
            case '1m': return 'Market Cap ≥ $1,000,000';
            default: return key;
        }
    }
}

module.exports = new TokenService();