const RPCService = require('./RPCService');
const axios = require('axios');

class TokenService {
  constructor() {
    // 初始化服务和缓存
    this.rpcService = RPCService;
    this.cache = new Map();
    this.COINGECKO_API_URL = process.env.COINGECKO_API_URL;
    this.JUPITER_API_URL = process.env.JUPITER_API_URL;
    this.cacheTimeout = 15 * 60 * 1000; // 15分钟缓存
  }

  // 获取 Top 100 代币列表
  async getTop100Tokens() {
    try {
      console.log('Starting getTop100Tokens...');
      
      // 尝试从 Jupiter API 获取数据
      console.log('Fetching from Jupiter API...');
      const jupiterResponse = await axios.get('https://token.jup.ag/all');
      console.log('Jupiter API raw response:', jupiterResponse.data ? 'data received' : 'no data');
      
      if (!jupiterResponse.data) {
        throw new Error('Invalid response from Jupiter');
      }

      // 处理数据
      const tokens = jupiterResponse.data
        .filter(token => token.address && token.symbol)
        .slice(0, 100);
      
      console.log(`Processing ${tokens.length} Jupiter tokens...`);

      return tokens;
    } catch (error) {
      console.error('Error in getTop100Tokens:', error);
      console.error('Error details:', error.response?.data || error.message);
      return [];
    }
  }

  // 获取代币价格
  async getTokenPrice(address) {
    try {
      // 使用缓存减少 API 调用次数
      const cacheKey = `price:${address}`;
      const cached = await this._getCachedData(cacheKey);
      if (cached) return cached;

      const response = await axios.get(
        `${this.COINGECKO_API_URL}/simple/token_price/solana`, {
        params: {
          contract_addresses: address,
          vs_currencies: 'usd',
          include_24hr_vol: true,
          include_market_cap: true
        }
      });

      const price = response.data[address.toLowerCase()]?.usd || 0;
      await this._setCacheData(cacheKey, price);
      return price;
    } catch (error) {
      console.error(`Error fetching price from CoinGecko: ${error}`);
      // 如果 CoinGecko 失败，回退到 Jupiter API
      return this.getJupiterPrice(address);
    }
  }

  // 缓存相关方法
  async _getCachedData(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  async _setCacheData(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  // Jupiter API 相关方法
  async getJupiterPrice(address) {
    try {
      const response = await axios.get(`${this.JUPITER_API_URL}/price`, {
        params: {
          ids: address
        }
      });

      if (response.data?.data?.[address]?.price) {
        return response.data.data[address].price;
      }
      return 0;
    } catch (error) {
      console.error(`Error fetching price from Jupiter for ${address}:`, error);
      return 0;
    }
  }

  // 从 Jupiter 获取 Top 100 代币
  async getJupiterTop100() {
    try {
      console.log('Fetching tokens from Jupiter...');
      const response = await axios.get('https://token.jup.ag/all');
      console.log('Jupiter tokens response received');

      if (!response.data) {
        throw new Error('Invalid response from Jupiter');
      }

      // 处理数据
      const tokens = response.data
        .filter(token => token.address && token.symbol)
        .slice(0, 100);
      
      console.log(`Processing ${tokens.length} Jupiter tokens...`);

      // 获取价格数据
      const tokenAddresses = tokens.map(token => token.address);
      const priceResponse = await axios.get(`${this.JUPITER_API_URL}/price`, {
        params: {
          ids: tokenAddresses.join(',')
        }
      });

      const priceData = priceResponse.data?.data || {};

      // 格式化返回数据
      const formattedTokens = tokens.map(token => ({
        symbol: token.symbol,
        name: token.name || token.symbol,
        address: token.address,
        decimals: token.decimals,
        price: priceData[token.address]?.price || 0,
        volume24h: priceData[token.address]?.volume24h || 0,
        logoURI: token.logoURI || null
      }));

      // 缓存结果
      this.cache.set('top100', {
        data: formattedTokens,
        timestamp: Date.now()
      });

      return formattedTokens;
    } catch (error) {
      console.error('Detailed Jupiter error:', error.message);
      return [];
    }
  }
}

module.exports = new TokenService(); 