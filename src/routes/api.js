const express = require('express');
const router = express.Router();
const RPCService = require('../services/RPCService');
const TokenService = require('../services/TokenService');

// 健康检查接口
// 用于监控服务状态和性能指标
router.get('/health', async (req, res) => {
  try {
    // 获取最新的区块高度作为健康检查
    const slot = await RPCService.executeRequest('getSlot');
    res.json({
      status: 'ok',
      slot,
      metrics: RPCService.getDetailedMetrics()  // 返回详细的性能指标
    });
  } catch (error) {
    res.status(500).json({
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
    res.json({
      status: 'success',
      data: tokens
    });
  } catch (error) {
    console.error('Error in /tokens/top100:', error);
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