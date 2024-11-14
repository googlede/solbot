const { Connection } = require('@solana/web3.js');
const config = require('../config/api.config');
const LRU = require('lru-cache');
const PQueue = require('p-queue');
const winston = require('winston');
const fs = require('fs');
const path = require('path');

// RPC 服务类 - 处理与 Solana 区块链的所有交互
class RPCService {
  constructor() {
    // 基础配置
    this.cacheTimeout = 60000; // 缓存过期时间：1分钟
    
    // 初始化 RPC 提供商
    this.providers = {
      primary: this._initializeProvider(config.primary),    // 主要提供商
      fallback: this._initializeProvider(config.fallback)   // 备用提供商
    };
    
    // 提供商状态追踪
    this.currentProvider = 'primary';
    this.requestCounts = { primary: 0, fallback: 0 };
    this.lastRequestTime = { primary: 0, fallback: 0 };
    this.failureCounts = { primary: 0, fallback: 0 };
    
    // 启动健康检查
    this._startHealthCheck();

    // 初始化 LRU 缓存
    this.cache = new LRU({
      max: 500,        // 最大缓存条目数
      maxAge: this.cacheTimeout
    });

    // 性能指标收集
    this.metrics = {
      requestCount: 0,
      errorCount: 0,
      avgResponseTime: 0,
      responseTimeHistogram: new Map(),  // 响应时间分布
      methodStats: new Map(),            // 各方法的统计信息
      lastMinuteRequests: [],            // 最近一分钟的请求
      circuitBreakerTrips: 0,           // 熔断器触发次数
      cacheHits: 0,                     // 缓存命中次数
      cacheMisses: 0                    // 缓存未命中次数
    };
    
    // 请求队列配置
    this.requestQueue = new PQueue({
      concurrency: 20,  // 最大并发请求数
      interval: 1000,   // 时间窗口（毫秒）
      intervalCap: 50   // 每个时间窗口内的最大请求数
    });
    
    // 熔断器配置
    this.circuitBreaker = {
      failureThreshold: 5,     // 错误阈值
      resetTimeout: 30000,     // 重置时间（毫秒）
      lastFailureTime: 0,
      failureCount: 0,
      isOpen: false
    };
    
    // 初始化日志系统
    this._initializeLogger();
  }

  // 初始化日志系统
  _initializeLogger() {
    const logDir = path.join(__dirname, '../../logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir);
    }
    
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ 
          filename: path.join(logDir, 'error.log'), 
          level: 'error' 
        }),
        new winston.transports.File({ 
          filename: path.join(logDir, 'combined.log')
        })
      ]
    });
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
    if (!await this._checkCircuitBreaker()) {
      this.logger.error('Circuit breaker is open');
      throw new Error('Circuit breaker is open');
    }

    return this.requestQueue.add(async () => {
      const startTime = Date.now();
      const provider = await this._getOptimalProvider();
      
      try {
        this.logger.info(`Executing ${method} request`, { args });
        const result = await provider.connection[method](...args);
        const duration = Date.now() - startTime;
        this.logger.info(`${method} request completed`, { duration });
        this._updateMetrics(method, duration);
        provider.requestCount++;
        return result;
      } catch (error) {
        this.logger.error(`Error executing ${method}`, { 
          error: error.message,
          args,
          provider: this.currentProvider 
        });
        this.metrics.errorCount++;
        this._updateCircuitBreaker(error);
        throw error;
      }
    });
  }

  _updateMetrics(method, responseTime, isError = false) {
    const now = Date.now();
    
    // 更新基本指标
    this.metrics.requestCount++;
    if (isError) this.metrics.errorCount++;
    
    // 更新响应时间
    this.metrics.avgResponseTime = 
      (this.metrics.avgResponseTime * (this.metrics.requestCount - 1) + responseTime) 
      / this.metrics.requestCount;
    
    // 更新响应时间分布
    const timeRange = Math.floor(responseTime / 100) * 100;
    this.metrics.responseTimeHistogram.set(
      timeRange, 
      (this.metrics.responseTimeHistogram.get(timeRange) || 0) + 1
    );
    
    // 更新方法统计
    if (!this.metrics.methodStats.has(method)) {
      this.metrics.methodStats.set(method, {
        count: 0,
        errors: 0,
        avgTime: 0
      });
    }
    const methodStats = this.metrics.methodStats.get(method);
    methodStats.count++;
    if (isError) methodStats.errors++;
    methodStats.avgTime = 
      (methodStats.avgTime * (methodStats.count - 1) + responseTime) 
      / methodStats.count;
    
    // 更新最近一分钟请求
    this.metrics.lastMinuteRequests = [
      ...this.metrics.lastMinuteRequests.filter(req => now - req.time < 60000),
      { time: now, method, responseTime, isError }
    ];
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
          this.failureCounts[name]++;
        }
      }
    }, config.loadBalancing.healthCheck.interval);
  }

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
    const cacheKey = `tx:${signature}`;
    const cached = await this._getCachedData(cacheKey);
    if (cached) return cached;

    const result = await this.executeRequestWithRetry('getTransaction', signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed'
    });

    await this._setCacheData(cacheKey, result);
    return result;
  }

  async executeRequestWithRetry(method, ...args) {
    const provider = await this._getOptimalProvider();
    const { maxRetries, initialDelay, maxDelay } = provider.config.options.retry;
    
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), 15000);
        });
        const requestPromise = this.executeRequest(method, ...args);
        return await Promise.race([requestPromise, timeoutPromise]);
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries) break;
        
        if (!this._shouldRetry(error)) throw error;
        
        const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
        await new Promise(resolve => setTimeout(resolve, delay + Math.random() * 1000));
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

  async _checkCircuitBreaker() {
    if (!this.circuitBreaker.isOpen) {
      return true;
    }

    const now = Date.now();
    if (now - this.circuitBreaker.lastFailureTime > this.circuitBreaker.resetTimeout) {
      this.circuitBreaker.isOpen = false;
      this.circuitBreaker.failureCount = 0;
      return true;
    }
    return false;
  }

  _updateCircuitBreaker(error) {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();
    
    if (this.circuitBreaker.failureCount >= this.circuitBreaker.failureThreshold) {
      this.circuitBreaker.isOpen = true;
    }
  }

  getDetailedMetrics() {
    const now = Date.now();
    return {
      ...this.metrics,
      errorRate: this.metrics.errorCount / this.metrics.requestCount,
      requestsPerMinute: this.metrics.lastMinuteRequests.length,
      methodBreakdown: Object.fromEntries(this.metrics.methodStats),
      responseTimeDistribution: Object.fromEntries(this.metrics.responseTimeHistogram),
      cacheHitRate: this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses),
      uptime: process.uptime(),
      circuitBreakerStatus: {
        isOpen: this.circuitBreaker.isOpen,
        failureCount: this.circuitBreaker.failureCount,
        tripCount: this.metrics.circuitBreakerTrips
      }
    };
  }
}

module.exports = new RPCService(); 