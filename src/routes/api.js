const express = require('express');
const router = express.Router();
const RPCService = require('../services/RPCService');
const TokenService = require('../services/TokenService');
const logger = require('../utils/logger');
const ExportService = require('../services/ExportService');

// 健康检查接口
// 用于监控服务状态和性能指标
router.get('/health', async (req, res) => {
  try {
    logger.info('Health check started');
    const startTime = Date.now();
    
    // 基本系统检查
    const systemInfo = {
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };

    // RPC 连接检查
    let slot;
    try {
      slot = await RPCService.executeRequest('getSlot');
      logger.info('RPC check successful', { slot });
    } catch (error) {
      logger.error('RPC check failed:', error);
      return res.status(503).json({
        status: 'error',
        message: 'RPC service unavailable',
        error: error.message,
        systemInfo
      });
    }

    const responseTime = Date.now() - startTime;
    
    // 获取详细指标
    const metrics = RPCService.getDetailedMetrics();
    
    logger.info('Health check completed successfully', {
      responseTime,
      slot,
      metrics: {
        requestCount: metrics.requestCount,
        errorCount: metrics.errorCount,
        uptime: metrics.uptime
      }
    });

    // 返回完整的健康检查信息
    return res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      responseTime,
      slot,
      metrics,
      systemInfo
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    return res.status(503).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
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

// 导出智能钱包数据
router.get('/export/smart-wallets', async (req, res) => {
    try {
        const buffer = await ExportService.exportSmartWallets();
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=smart-wallets.xlsx');
        res.send(buffer);
    } catch (error) {
        logger.error('Error in export endpoint:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
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