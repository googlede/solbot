const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const logger = require('../utils/logger');
const redis = require('../config/redis');
const PriceService = require('./PriceService');

class TokenService {
    constructor() {
        this.connection = new Connection(
            process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
            'confirmed'
        );
        this.marketCapFilters = {
            '10k': 10000,
            '50k': 50000,
            '150k': 150000,
            '500k': 500000,
            '1m': 1000000
        };
        this.defaultFilter = '50k';
    }

    async getTopTokens(marketCapFilter = this.defaultFilter, limit = 200) {
        try {
            const cacheKey = `top_tokens_${marketCapFilter}_${limit}`;
            
            // 尝试从缓存获取
            const cached = await redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }

            // 获取所有 token 账户
            const tokenAccounts = await this.connection.getProgramAccounts(
                TOKEN_PROGRAM_ID,
                {
                    filters: [
                        {
                            dataSize: 165,
                        },
                    ],
                }
            );

            // 获取 token 信息
            const tokenInfos = await Promise.all(
                tokenAccounts.map(async account => {
                    try {
                        const mintInfo = await this.connection.getParsedAccountInfo(
                            account.pubkey
                        );
                        
                        if (!mintInfo.value?.data.parsed) return null;

                        return {
                            address: account.pubkey.toString(),
                            ...mintInfo.value.data.parsed.info
                        };
                    } catch (error) {
                        logger.error('Error fetching token info:', error);
                        return null;
                    }
                })
            );

            // 获取价格数据
            const validTokens = tokenInfos.filter(Boolean);
            const addresses = validTokens.map(token => token.address);
            const priceData = await PriceService.getTokenPrices(addresses);

            // 合并数据
            const tokens = validTokens.map(token => {
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

            // 应用市值过滤
            const minMarketCap = this.marketCapFilters[marketCapFilter] || this.marketCapFilters[this.defaultFilter];
            
            const filteredTokens = tokens
                .filter(token => token.marketCap >= minMarketCap)
                .sort((a, b) => b.marketCap - a.marketCap)
                .slice(0, limit);

            // 添加过滤条件信息到返回数据
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

            // 缓存结果（1分钟）
            await redis.set(cacheKey, JSON.stringify(result), 'EX', 60);

            return result;
        } catch (error) {
            logger.error('Error getting top tokens:', error);
            throw error;
        }
    }

    // 获取可用的市值过滤选项
    getMarketCapFilters() {
        return Object.entries(this.marketCapFilters).map(([key, value]) => ({
            key,
            value,
            label: this.formatMarketCapLabel(key)
        }));
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