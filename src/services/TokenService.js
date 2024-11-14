const RPCService = require('./RPCService');
const axios = require('axios');
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY;
const BIRDEYE_BASE_URL = 'https://public-api.birdeye.so';

class TokenService {
  constructor() {
    this.rpcService = RPCService;
    this.cache = new Map();
    this.COINGECKO_API_URL = process.env.COINGECKO_API_URL;
    this.JUPITER_API_URL = process.env.JUPITER_API_URL;
    this.cacheTimeout = 15 * 60 * 1000; // 15分钟缓存
  }

  async getTop100Tokens() {
    try {
      console.log('Starting getTop100Tokens...');
      
      // 尝试从 Jupiter API 获取数据
      console.log('Fetching from Jupiter API...');
      const jupiterTokens = await this.getJupiterTop100();
      if (jupiterTokens.length > 0) {
        console.log('Successfully got tokens from Jupiter');
        return jupiterTokens;
      }

      // 如果 Jupiter API 失败，尝试 CoinGecko
      console.log('Jupiter API failed, trying CoinGecko...');
      const tokens = await this.getCoingeckoTop100();
      console.log('Got tokens from CoinGecko:', tokens.length);
      return tokens;
    } catch (error) {
      console.error('Error in getTop100Tokens:', error);
      return [];
    }
  }

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

  async getSmartMoneyAnalysis(address) {
    try {
      // 使用 Solana RPC 直接获取交易历史
      const transactions = await this.rpcService.getSignaturesForAddress(address, {
        limit: 100
      });
      
      // 分析交易金额筛选大额交易
      const largeTransactions = await Promise.all(
        transactions.map(async tx => {
          const txDetail = await this.rpcService.getTransaction(tx.signature);
          return {
            signature: tx.signature,
            timestamp: tx.blockTime,
            amount: txDetail.meta?.preBalances[0] - txDetail.meta?.postBalances[0],
            // ... 其他分析数据
          };
        })
      );

      return {
        largeTransactions: largeTransactions.filter(tx => tx.amount > 1000 * 1e9), // 大于 1000 SOL
        topHolders: await this.getTopHoldersFromRPC(address),
        recentActivity: transactions.slice(0, 20)
      };
    } catch (error) {
      console.error('Error in smart money analysis:', error);
      throw error;
    }
  }

  async getLargeTransactions(address) {
    const url = `${BIRDEYE_BASE_URL}/defi/large-transactions`;
    const response = await axios.get(url, {
      headers: { 'X-API-KEY': BIRDEYE_API_KEY },
      params: {
        address,
        limit: 100
      }
    });
    return response.data;
  }

  async getTopHolders(address) {
    const url = `${BIRDEYE_BASE_URL}/defi/token_holders`;
    const response = await axios.get(url, {
      headers: { 'X-API-KEY': BIRDEYE_API_KEY },
      params: {
        address,
        limit: 50
      }
    });
    return response.data;
  }

  async getSmartMoneyFlow(address) {
    const url = `${BIRDEYE_BASE_URL}/defi/smart_money_flow`;
    const response = await axios.get(url, {
      headers: { 'X-API-KEY': BIRDEYE_API_KEY },
      params: {
        address,
        timeRange: '24h'
      }
    });
    return response.data;
  }

  async getWalletProfile(walletAddress) {
    const url = `${BIRDEYE_BASE_URL}/defi/wallet_profile`;
    const response = await axios.get(url, {
      headers: { 'X-API-KEY': BIRDEYE_API_KEY },
      params: { address: walletAddress }
    });
    return response.data;
  }

  // 使用 RPC 获取持有者信息
  async getTopHoldersFromRPC(tokenAddress) {
    try {
      const accounts = await this.rpcService.getTokenLargestAccounts(tokenAddress);
      return accounts.value.map(account => ({
        address: account.address,
        amount: account.amount,
        share: account.share
      }));
    } catch (error) {
      console.error('Error getting top holders:', error);
      return [];
    }
  }

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

  // 添加 Jupiter API 相关方法
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

  async getJupiterTop100() {
    try {
      console.log('Fetching tokens from Jupiter...');
      const response = await axios.get('https://token.jup.ag/all');
      console.log('Jupiter tokens response received');

      if (!response.data) {
        throw new Error('Invalid response from Jupiter');
      }

      // 只取前 100 个代币，并按市值排序
      const tokens = response.data
        .filter(token => token.address && token.symbol) // 确保有必要的字段
        .slice(0, 100);
      
      console.log(`Processing ${tokens.length} Jupiter tokens...`);

      // 批量获取价格数据
      const tokenAddresses = tokens.map(token => token.address);
      console.log('Fetching prices for tokens...');
      
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

      console.log(`Successfully processed ${formattedTokens.length} tokens`);
      return formattedTokens;
    } catch (error) {
      console.error('Detailed Jupiter error:', error.message);
      if (error.response) {
        console.error('Jupiter API response:', error.response.data);
      }
      return [];
    }
  }

  async getCoingeckoTop100() {
    try {
      console.log('Fetching from CoinGecko...');
      const response = await axios.get(
        `${this.COINGECKO_API_URL}/coins/markets`, {
        params: {
          vs_currency: 'usd',
          order: 'market_cap_desc',
          per_page: 100,
          platform: 'solana'
        }
      });

      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Invalid response from CoinGecko');
      }

      // 格式化数据
      const tokens = response.data.map(token => ({
        symbol: token.symbol.toUpperCase(),
        name: token.name,
        address: token.platforms?.solana || '',
        price: token.current_price,
        marketCap: token.market_cap,
        volume24h: token.total_volume,
        priceChange24h: token.price_change_percentage_24h
      }));

      // 缓存结果
      this.cache.set('top100', {
        data: tokens,
        timestamp: Date.now()
      });

      console.log(`Successfully processed ${tokens.length} tokens from CoinGecko`);
      return tokens;
    } catch (error) {
      console.error('Error fetching from CoinGecko:', error);
      // 如果 CoinGecko 失败，尝试使用 Jupiter API
      return this.getJupiterTop100();
    }
  }
}

module.exports = new TokenService(); 