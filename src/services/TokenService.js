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

            // 修改模拟数据生成函数
            const generateMockTokens = (count) => {
                const tokens = [];
                const symbols = ['SOL', 'BONK', 'JTO', 'WEN', 'PYTH', 'ORCA', 'RAY', 'MEAN'];
                const now = new Date();
                
                for (let i = 0; i < count; i++) {
                    const marketCap = Math.random() * 20000000000;
                    const liquidity = marketCap * (Math.random() * 0.3); // 流动性为市值的0-30%
                    const price = Math.random() * 100;
                    const volume24h = liquidity * (Math.random() * 0.5); // 24h交易量为流动性的0-50%
                    
                    // 生成买入和卖出交易次数
                    const buyTxs = Math.floor(Math.random() * 100000);
                    const sellTxs = Math.floor(Math.random() * 100000);
                    
                    // 创建随机的创建时间（1-30天内）
                    const createdAt = new Date(now - Math.random() * 30 * 24 * 60 * 60 * 1000);
                    
                    tokens.push({
                        symbol: symbols[i % symbols.length] + (i > 9 ? i : ''),
                        createdAt: createdAt.toISOString(),
                        liquidity: liquidity,
                        marketCap: marketCap,
                        liqMcRatio: (liquidity / marketCap * 100).toFixed(2), // 流动性/市值比率
                        holders: Math.floor(Math.random() * 1000000),
                        txCount24h: {
                            total: buyTxs + sellTxs,
                            buy: buyTxs,
                            sell: sellTxs
                        },
                        volume24h: volume24h,
                        price: price,
                        change1m: (Math.random() * 20) - 10,
                        change5m: (Math.random() * 40) - 20,
                        change1h: (Math.random() * 60) - 30
                    });
                }

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