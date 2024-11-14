const axios = require('axios');
const LRU = require('lru-cache');
const logger = require('../utils/logger');

class TokenService {
  constructor() {
    this.cache = new LRU({
      max: 500,
      ttl: 1000 * 60 * 5
    });

    this.JUPITER_API_URL = process.env.JUPITER_API_URL || 'https://price.jup.ag/v4';
    this.retryConfig = {
      maxRetries: 3,
      delay: 1000,
      backoff: 2
    };
  }

  async getTop100Tokens() {
    try {
      logger.info('Starting getTop100Tokens request...');
      
      const cached = this.cache.get('top100');
      if (cached) {
        logger.info('Returning cached tokens data');
        return cached;
      }

      logger.info('Fetching tokens from Jupiter API...');
      const response = await this._retryRequest(() => {
        logger.info('Making request to https://token.jup.ag/all');
        return axios.get('https://token.jup.ag/all', {
          timeout: 10000,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'SolBot/1.0'
          }
        });
      });
      
      logger.info('Jupiter API Response:', {
        status: response.status,
        statusText: response.statusText,
        dataLength: response.data?.length,
        hasData: !!response.data
      });

      if (!response.data || !Array.isArray(response.data)) {
        throw new Error(`Invalid response from Jupiter API: ${JSON.stringify(response.data)}`);
      }

      const tokens = response.data
        .filter(token => {
          const isValid = token.address && token.symbol;
          if (!isValid) {
            logger.warn('Invalid token data:', token);
          }
          return isValid;
        })
        .map(token => ({
          symbol: token.symbol,
          name: token.name || token.symbol,
          address: token.address,
          decimals: token.decimals,
          logoURI: token.logoURI,
          tags: token.tags || []
        }))
        .slice(0, 100);

      logger.info(`Filtered ${tokens.length} valid tokens`);

      const tokenAddresses = tokens.map(t => t.address).join(',');
      logger.info(`Fetching price data for ${tokens.length} tokens`);
      
      const priceResponse = await this._retryRequest(() =>
        axios.get(`${this.JUPITER_API_URL}/price`, {
          params: { ids: tokenAddresses },
          timeout: 10000
        })
      );

      logger.info('Price data response:', {
        status: priceResponse.status,
        hasData: !!priceResponse.data,
        tokenCount: Object.keys(priceResponse.data?.data || {}).length
      });

      const tokensWithPrice = tokens.map(token => ({
        ...token,
        price: priceResponse.data?.data?.[token.address]?.price || 0,
        volume24h: priceResponse.data?.data?.[token.address]?.volume24h || 0
      }));

      this.cache.set('top100', tokensWithPrice);
      logger.info(`Successfully processed ${tokensWithPrice.length} tokens with prices`);
      
      return tokensWithPrice;

    } catch (error) {
      logger.error('Error in getTop100Tokens:', {
        message: error.message,
        stack: error.stack,
        response: error.response?.data
      });
      
      const staleCache = this.cache.get('top100');
      if (staleCache) {
        logger.info('Returning stale cache data due to error');
        return staleCache;
      }
      
      throw new Error(`Failed to fetch tokens: ${error.message}`);
    }
  }

  async _retryRequest(requestFn) {
    let lastError;
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;
        if (attempt === this.retryConfig.maxRetries) break;
        
        const delay = this.retryConfig.delay * Math.pow(this.retryConfig.backoff, attempt);
        logger.info(`Retry attempt ${attempt + 1} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }
}

module.exports = new TokenService();