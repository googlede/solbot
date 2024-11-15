const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const logger = require('../utils/logger');
const redis = require('../config/redis');
const PriceService = require('./PriceService');

class TokenService {
    constructor() {
        // 更新为更稳定的 RPC 节点列表
        this.rpcUrls = [
            'https://rpc.ankr.com/solana',
            'https://solana.public-rpc.com',
            'https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY',  // 需要申请 API key
            'https://solana-mainnet.g.alchemy.com/v2/YOUR_API_KEY'   // 需要申请 API key
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

            // 模拟数据生成函数
            const generateMockTokens = (count) => {
                const tokens = [];
                const symbols = ['SOL', 'BONK', 'JTO', 'WEN', 'PYTH', 'ORCA', 'RAY', 'MEAN', 'DUST', 'RATIO'];
                
                for (let i = 0; i < count; i++) {
                    const marketCap = Math.random() * 20000000000; // 0 到 200亿之间
                    const price = Math.random() * 100; // 0 到 100美元之间
                    const volume = marketCap * (Math.random() * 0.2); // 市值的0-20%
                    
                    tokens.push({
                        symbol: symbols[i % symbols.length] + (i > 9 ? i : ''),
                        marketCap: marketCap,
                        price: price,
                        volume24h: volume,
                        holders: Math.floor(Math.random() * 1000000), // 0 到 100万持有者
                        txCount1h: Math.floor(Math.random() * 50000), // 0 到 5万笔交易
                        change1h: (Math.random() * 20) - 10, // -10% 到 +10%
                        change24h: (Math.random() * 40) - 20, // -20% 到 +20%
                        change7d: (Math.random() * 60) - 30, // -30% 到 +30%
                    });
                }

                // 按市值排序
                return tokens.sort((a, b) => b.marketCap - a.marketCap);
            };

            // 生成模拟数据
            const minMarketCap = this.marketCapFilters[marketCapFilter];
            const mockTokens = generateMockTokens(100) // 生成100个token
                .filter(token => token.marketCap >= minMarketCap)
                .slice(0, limit);

            const mockData = {
                tokens: mockTokens,
                filter: {
                    marketCap: minMarketCap,
                    filterLabel: this.formatMarketCapLabel(marketCapFilter),
                    totalCount: mockTokens.length,
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