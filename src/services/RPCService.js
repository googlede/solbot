const { Connection } = require('@solana/web3.js');
const config = require('../config/api.config');
const LRU = require('lru-cache');

class RPCService {
  constructor() {
    this.cacheTimeout = 60000;
    
    this.providers = {
      primary: this._initializeProvider(config.primary),
      fallback: this._initializeProvider(config.fallback)
    };
    
    this.currentProvider = 'primary';
    this.requestCounts = { primary: 0, fallback: 0 };
    this.lastRequestTime = { primary: 0, fallback: 0 };
    this.failureCounts = { primary: 0, fallback: 0 };
    
    // 启动健康检查
    this._startHealthCheck();
    this.cache = new LRU({
      max: 500,
      maxAge: this.cacheTimeout
    });
    this.metrics = {
      requestCount: 0,
      errorCount: 0,
      avgResponseTime: 0
    };
  }

  _initializeProvider(providerConfig) {
    return {
      connection: new Connection(providerConfig.rpcEndpoint),
      config: providerConfig,
      lastRequest: 0,
      requestCount: 0,
      isHealthy: true
    };
  }

  async _checkRateLimit(provider) {
    const now = Date.now();
    const { maxRequests, interval } = provider.config.options.rateLimit;
    
    if (now - provider.lastRequest < interval) {
      if (provider.requestCount >= maxRequests) {
        return false;
      }
    } else {
      provider.requestCount = 0;
      provider.lastRequest = now;
    }
    return true;
  }

  async _getOptimalProvider() {
    // 检查当前提供商的健康状态和请求限制
    const current = this.providers[this.currentProvider];
    if (current.isHealthy && await this._checkRateLimit(current)) {
      return current;
    }

    // 切换到另一个提供商
    const otherProvider = this.currentProvider === 'primary' ? 'fallback' : 'primary';
    const other = this.providers[otherProvider];
    
    if (other.isHealthy && await this._checkRateLimit(other)) {
      this.currentProvider = otherProvider;
      return other;
    }

    // 如果都不可用，等待一段时间后重试
    await new Promise(resolve => setTimeout(resolve, 1000));
    return this._getOptimalProvider();
  }

  async executeRequest(method, ...args) {
    const startTime = Date.now();
    try {
      const result = await super.executeRequest(method, ...args);
      this._updateMetrics(Date.now() - startTime);
      return result;
    } catch (error) {
      this.metrics.errorCount++;
      throw error;
    }
  }

  _updateMetrics(responseTime) {
    this.metrics.requestCount++;
    this.metrics.avgResponseTime = 
      (this.metrics.avgResponseTime * (this.metrics.requestCount - 1) + responseTime) 
      / this.metrics.requestCount;
  }

  getMetrics() {
    return {
      ...this.metrics,
      errorRate: this.metrics.errorCount / this.metrics.requestCount,
      uptime: process.uptime()
    };
  }

  _startHealthCheck() {
    setInterval(async () => {
      for (const [name, provider] of Object.entries(this.providers)) {
        try {
          await provider.connection.getHealth();
          provider.isHealthy = true;
          this.failureCounts[name] = 0;
        } catch (error) {
          provider.isHealthy = false;
        }
      }
    }, config.loadBalancing.healthCheck.interval);
  }

  // 公共 API 方法
  async getBlock(slot) {
    const cacheKey = `block:${slot}`;
    const cached = await this._getCachedData(cacheKey);
    if (cached) return cached;

    const result = await this.executeRequestWithRetry('getBlock', slot, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed'
    });
    
    await this._setCacheData(cacheKey, result);
    return result;
  }

  async getTransaction(signature) {
    return this.executeRequest('getTransaction', signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed'
    });
  }

  // 在 RPCService 类中添加重试机制
  async executeRequestWithRetry(method, ...args) {
    const provider = await this._getOptimalProvider();
    const { maxRetries, initialDelay, maxDelay } = provider.config.options.retry;
    
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // 添加超时控制
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), 15000);
        });
        const requestPromise = this.executeRequest(method, ...args);
        return await Promise.race([requestPromise, timeoutPromise]);
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries) break;
        
        // 只有特定错误才重试
        if (!this._shouldRetry(error)) throw error;
        
        const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
        await new Promise(resolve => setTimeout(resolve, delay + Math.random() * 1000)); // 添加随机抖动
      }
    }
    throw lastError;
  }

  _shouldRetry(error) {
    const retryableErrors = [
      'Connection refused',
      'timeout',
      'Too Many Requests',
      'Service Unavailable'
    ];
    return retryableErrors.some(msg => error.message?.includes(msg));
  }

  async _getCachedData(key) {
    return this.cache.get(key);
  }

  async _setCacheData(key, data) {
    this.cache.set(key, data);
  }

  async batchRequest(method, items, batchSize = 10) {
    const results = [];
    const errors = [];
    
    const processBatch = async (batch, retryCount = 0) => {
      try {
        const batchPromises = batch.map(item => 
          this.executeRequestWithRetry(method, item)
            .catch(error => ({ error, item }))
        );
        
        const batchResults = await Promise.all(batchPromises);
        
        // 分离成功和失败的结果
        batchResults.forEach(result => {
          if (result.error) {
            errors.push(result);
          } else {
            results.push(result);
          }
        });
      } catch (error) {
        if (retryCount < 3) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          return processBatch(batch, retryCount + 1);
        }
        errors.push(...batch.map(item => ({ error, item })));
      }
    };

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      await processBatch(batch);
      
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return {
      results,
      errors,
      success: results.length,
      failed: errors.length
    };
  }
}

module.exports = new RPCService(); 