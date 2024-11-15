const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const logger = require('../utils/logger');
const redis = require('../config/redis');
const PriceService = require('./PriceService');

class TokenService {
    constructor() {
        // 添加多个 RPC 节点作为备选
        this.rpcUrls = [
            'https://api.mainnet-beta.solana.com',
            'https://solana-api.projectserum.com',
            'https://rpc.ankr.com/solana'
        ];
        this.currentRpcIndex = 0;
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
                confirmTransactionInitialTimeout: 60000
            });
        } catch (error) {
            logger.error('Failed to initialize Solana connection:', error);
            this.switchRpcNode();
        }
    }

    switchRpcNode() {
        this.currentRpcIndex = (this.currentRpcIndex + 1) % this.rpcUrls.length;
        logger.info(`Switching to RPC node: ${this.rpcUrls[this.currentRpcIndex]}`);
        this.initConnection();
    }

    async getTopTokens(marketCapFilter = this.defaultFilter, limit = 200) {
        try {
            const cacheKey = `top_tokens_${marketCapFilter}_${limit}`;
            logger.info('Starting getTopTokens with filter:', { marketCapFilter, limit });

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

            // 获取 token 账户
            let tokenAccounts;
            try {
                logger.info('Fetching token accounts from Solana');
                tokenAccounts = await this.connection.getProgramAccounts(
                    TOKEN_PROGRAM_ID,
                    {
                        filters: [
                            {
                                dataSize: 165,
                            },
                        ],
                    }
                );
                logger.info(`Found ${tokenAccounts.length} token accounts`);
            } catch (rpcError) {
                logger.error('RPC error, switching nodes:', rpcError);
                this.switchRpcNode();
                throw new Error('Failed to fetch token accounts, retrying...');
            }

            // 获取 token 信息
            const tokenInfoPromises = tokenAccounts.map(async account => {
                try {
                    const mintInfo = await this.connection.getParsedAccountInfo(
                        account.pubkey
                    );
                    
                    if (!mintInfo.value?.data.parsed) {
                        logger.warn(`Invalid mint info for token: ${account.pubkey.toString()}`);
                        return null;
                    }

                    return {
                        address: account.pubkey.toString(),
                        ...mintInfo.value.data.parsed.info
                    };
                } catch (error) {
                    logger.error(`Error fetching token info for ${account.pubkey.toString()}:`, error);
                    return null;
                }
            });

            const tokenInfos = (await Promise.all(tokenInfoPromises)).filter(Boolean);
            logger.info(`Successfully processed ${tokenInfos.length} tokens`);

            // 获取价格数据
            const addresses = tokenInfos.map(token => token.address);
            const priceData = await PriceService.getTokenPrices(addresses);

            // 合并数据
            const tokens = tokenInfos.map(token => {
                const price = priceData[token.address.toLowerCase()] || {};
                return {
                    address: token.address,
                    symbol: token.symbol || 'Unknown',
                    marketCap: price.usd_market_cap || 0,
                    price: price.usd || 0,
                    volume24h: price.usd_24h_vol || 0,
                    change24h: price.usd_24h_change || 0,
                    supply: token.supply,
                    decimals: token.decimals
                };
            });

            // 应用过滤和排序
            const minMarketCap = this.marketCapFilters[marketCapFilter] || this.marketCapFilters[this.defaultFilter];
            const filteredTokens = tokens
                .filter(token => token.marketCap >= minMarketCap)
                .sort((a, b) => b.marketCap - a.marketCap)
                .slice(0, limit);

            logger.info(`Filtered to ${filteredTokens.length} tokens with market cap >= ${minMarketCap}`);

            const result = {
                tokens: filteredTokens,
                filter: {
                    marketCap: minMarketCap,
                    filterLabel: this.formatMarketCapLabel(marketCapFilter),
                    totalCount: tokens.filter(t => t.marketCap >= minMarketCap).length,
                    displayCount: limit,
                    timestamp: new Date().toISOString()
                }
            };

            // 缓存结果
            try {
                await redis.set(cacheKey, JSON.stringify(result), 'EX', 60);
                logger.info('Successfully cached token data');
            } catch (cacheError) {
                logger.error('Failed to cache token data:', cacheError);
            }

            return result;
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