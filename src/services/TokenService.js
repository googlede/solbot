const RPCService = require('./RPCService');
const axios = require('axios');
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY;
const BIRDEYE_BASE_URL = 'https://public-api.birdeye.so';

class TokenService {
  constructor() {
    this.rpcService = RPCService;
    this.cache = new Map();
    this.COINGECKO_API_URL = 'https://api.coingecko.com/api/v3';
    this.cacheTimeout = 15 * 60 * 1000; // 15分钟缓存
  }

  async getTop100Tokens() {
    try {
      const cacheKey = 'top100';
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;

      // 获取 Solana 生态系统的所有代币
      const response = await axios.get(
        `${this.COINGECKO_API_URL}/coins/markets`, {
        params: {
          vs_currency: 'usd',
          order: 'market_cap_desc',
          per_page: 100,
          platform: 'solana'
        }
      });

      const tokens = response.data.map(token => ({
        symbol: token.symbol.toUpperCase(),
        address: token.platforms?.solana || '',
        price: token.current_price,
        marketCap: token.market_cap,
        volume24h: token.total_volume
      }));

      this.cache.set(cacheKey, tokens);
      return tokens;
    } catch (error) {
      console.error('Error fetching from CoinGecko:', error);
      // 回退到 Jupiter API
      return this.getJupiterTop100();
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
}

module.exports = new TokenService(); 