const axios = require('axios');
const logger = require('../utils/logger');
const NodeCache = require('node-cache');

class PriceService {
    constructor() {
        this.cache = new NodeCache({ stdTTL: 60 }); // 1分钟缓存
        this.coingeckoUrl = 'https://api.coingecko.com/api/v3';
    }

    async getTokenPrices(tokenAddresses) {
        try {
            const cacheKey = 'token_prices';
            let prices = this.cache.get(cacheKey);

            if (!prices) {
                const response = await axios.get(
                    `${this.coingeckoUrl}/simple/token_price/solana`, {
                    params: {
                        contract_addresses: tokenAddresses.join(','),
                        vs_currencies: 'usd',
                        include_24hr_vol: true,
                        include_24hr_change: true,
                        include_market_cap: true
                    }
                });
                prices = response.data;
                this.cache.set(cacheKey, prices);
            }

            return prices;
        } catch (error) {
            logger.error('Error fetching token prices:', error);
            return {};
        }
    }
}

module.exports = new PriceService(); 