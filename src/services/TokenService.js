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

    // 修改模拟数据生成函数
    generateMockTokens(count) {
        const tokens = [];
        const symbols = ['SOL', 'BONK', 'JTO', 'WEN', 'PYTH', 'ORCA', 'RAY', 'MEAN'];
        
        // 模拟的合约地址
        const mockAddresses = {
            'SOL': 'So11111111111111111111111111111111111111112',
            'BONK': 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
            'JTO': 'jtojtojtojtojtojtojtojtojtojtojtojtojtojtojto',
            'WEN': 'WENWENWENWENWENWENWENWENWENWENWENWENWENwen123',
            'PYTH': 'PYTHPYTHPYTHPYTHPYTHPYTHPYTHPYTHPYTHpyth123',
            'ORCA': 'orcaorcaorcaorcaorcaorcaorcaorcaorcaorcaorcaorca123',
            'RAY': 'RAYRAYRAYRAYRAYRAYRAYRAYRAYRAYRAYRAYRAYRAYRAYray123',
            'MEAN': 'MEANMEANMEANMEANMEANMEANMEANMEANMEANmean123'
        };

        for (let i = 0; i < count; i++) {
            const symbol = symbols[i % symbols.length] + (i >= symbols.length ? i : '');
            const baseSymbol = symbols[i % symbols.length];
            
            tokens.push({
                symbol: symbol,
                address: mockAddresses[baseSymbol] || `MOCK${i.toString().padStart(40, '0')}`,
                iconUrl: `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${mockAddresses[baseSymbol]}/logo.png`,
                createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
                liquidity: Math.random() * 20000000,
                marketCap: Math.random() * 100000000,
                holders: Math.floor(Math.random() * 1000000),
                txCount24h: {
                    total: Math.floor(Math.random() * 200000),
                    buy: Math.floor(Math.random() * 100000),
                    sell: Math.floor(Math.random() * 100000)
                },
                volume24h: Math.random() * 5000000,
                price: Math.random() * 100,
                change1m: (Math.random() * 20) - 10,
                change5m: (Math.random() * 40) - 20,
                change1h: (Math.random() * 60) - 30
            });
        }

        return tokens.sort((a, b) => b.marketCap - a.marketCap);
    }

    async getTopTokens(marketCapFilter = this.defaultFilter, limit = 200) {
        try {
            const cacheKey = `top_tokens_${marketCapFilter}_${limit}`;
            
            // 尝试从缓存获取
            const cached = await redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }

            // 生成模拟数据
            const mockTokens = this.generateMockTokens(100);
            
            // 应用过滤和排序
            const minMarketCap = this.marketCapFilters[marketCapFilter];
            const filteredTokens = mockTokens
                .filter(token => token.marketCap >= minMarketCap)
                .slice(0, limit);

            const result = {
                tokens: filteredTokens,
                filter: {
                    marketCap: minMarketCap,
                    filterLabel: this.formatMarketCapLabel(marketCapFilter),
                    totalCount: mockTokens.length,
                    displayCount: limit,
                    timestamp: new Date().toISOString()
                }
            };

            // 缓存结果
            await redis.set(cacheKey, JSON.stringify(result), 'EX', 60);

            return result;
        } catch (error) {
            logger.error('Error in getTopTokens:', error);
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