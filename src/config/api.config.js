require('dotenv').config();

module.exports = {
  // Chainstack 主要供应商配置
  primary: {
    name: 'chainstack',
    rpcEndpoint: 'https://api.mainnet-beta.solana.com',
    wsEndpoint: process.env.CHAINSTACK_WS_URL,
    apiKey: process.env.CHAINSTACK_API_KEY,
    options: {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
      encoding: 'jsonParsed',
      // 请求限制配置
      rateLimit: {
        maxRequests: 100,
        interval: 10000
      },
      // 重试配置
      retry: {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 5000
      }
    }
  },
  // Helius 备用供应商配置
  fallback: {
    name: 'helius',
    rpcEndpoint: 'https://solana-api.projectserum.com',
    apiKey: process.env.HELIUS_API_KEY,
    options: {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
      encoding: 'jsonParsed',
      // 请求限制配置
      rateLimit: {
        maxRequests: 80,
        interval: 10000
      },
      retry: {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 5000
      }
    }
  },
  // 负载均衡配置
  loadBalancing: {
    strategy: 'round-robin',    // 轮询策略
    healthCheck: {
      interval: 30000,          // 健康检查间隔（毫秒）
      timeout: 5000            // 健康检查超时
    },
    failover: {
      enabled: true,
      threshold: 3             // 连续失败次数触发故障转移
    }
  },
  cache: {
    enabled: true,
    timeout: 60000,  // 1分钟
    maxSize: 1000    // 最大缓存条目数
  },
  batch: {
    enabled: true,
    maxSize: 10,     // 每批次最大请求数
    interval: 1000   // 批次间隔
  },
  metrics: {
    enabled: true,
    logInterval: 300000  // 5分钟记录一次指标
  }
}; 