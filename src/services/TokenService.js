cat > src/services/TokenService.js << 'EOL'
const axios = require('axios');
const LRU = require('lru-cache');
const logger = require('../utils/logger');

class TokenService {
  constructor() {
    // 初始化缓存
    this.cache = new LRU({
      max: 500,
      ttl: 1000 * 60 * 5 // 5分钟缓存
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
      
      // 检查缓存
      const cached = this.cache.get('top100');
      if (cached) {
        logger.info('Returning cached tokens data');
        return cached;
      }

      // 获取代币列表
      logger.info('Fetching tokens from Jupiter API...');
      const response = await this._retryRequest(() => 
        axios.get('https://token.jup.ag/all')
      );
      
      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Invalid response from Jupiter API');
      }

      logger.info(`Received ${response.data.length} tokens from Jupiter`);

      // 处理数据
      const tokens = response.data
        .filter(token => token.address && token.symbol) // 过滤无效数据
        .map(token => ({
          symbol: token.symbol,
          name: token.name || token.symbol,
          address: token.address,
          decimals: token.decimals,
          logoURI: token.logoURI,
          tags: token.tags || []
        }))
        .slice(0, 100); // 只取前100个

      // 获取价格数据
      const tokenAddresses = tokens.map(t => t.address).join(',');
      logger.info('Fetching price data...');
      const priceResponse = await this._retryRequest(() =>
        axios.get(`${this.JUPITER_API_URL}/price`, {
          params: { ids: tokenAddresses }
        })
      );

      // 合并价格数据
      const tokensWithPrice = tokens.map(token => ({
        ...token,
        price: priceResponse.data?.data?.[token.address]?.price || 0,
        volume24h: priceResponse.data?.data?.[token.address]?.volume24h || 0
      }));

      // 缓存结果
      this.cache.set('top100', tokensWithPrice);
      
      logger.info(`Successfully processed ${tokensWithPrice.length} tokens`);
      return tokensWithPrice;

    } catch (error) {
      logger.error('Error in getTop100Tokens:', error);
      logger.error('Error details:', error.response?.data || error.message);
      
      // 尝试返回缓存数据，即使已过期
      const staleCache = this.cache.get('top100');
      if (staleCache) {
        logger.info('Returning stale cache data due to error');
        return staleCache;
      }
      
      throw error;
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
EOL