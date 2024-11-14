const express = require('express');
const router = express.Router();
const RPCService = require('../services/RPCService');
const TokenService = require('../services/TokenService');
const logger = require('../utils/logger');

// 健康检查接口
// 用于监控服务状态和性能指标
router.get('/health', async (req, res) => {
  try {
    const startTime = Date.now();
    const slot = await RPCService.executeRequest('getSlot');
    const responseTime = Date.now() - startTime;

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      slot,
      responseTime,
      metrics: RPCService.getDetailedMetrics(),
      system: {
        memory: process.memoryUsage(),
        uptime: process.uptime()
      }
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'error',
      message: error.message,
      metrics: RPCService.getDetailedMetrics()
    });
  }
});

// Top 100 代币列表接口
// 返回市值排名前 100 的代币信息
router.get('/tokens/top100', async (req, res) => {
  try {
    const tokens = await TokenService.getTop100Tokens();
    if (!tokens || tokens.length === 0) {
      logger.warn('No tokens returned from TokenService');
      return res.status(404).json({
        status: 'error',
        message: 'No tokens available'
      });
    }
    
    res.json({
      status: 'success',
      data: tokens
    });
  } catch (error) {
    logger.error('Error in /tokens/top100:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// 全局错误处理中间件
// 统一处理所有未捕获的错误
router.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(500).json({
    status: 'error',
    message: err.message,
    // 只在开发环境返回错误堆栈
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

module.exports = router; 