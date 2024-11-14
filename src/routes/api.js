const express = require('express');
const router = express.Router();
const RPCService = require('../services/RPCService');
const TokenService = require('../services/TokenService');

router.get('/health', async (req, res) => {
  try {
    // 获取最新的区块高度作为健康检查
    const slot = await RPCService.executeRequest('getSlot');
    res.json({
      status: 'ok',
      slot,
      metrics: RPCService.getDetailedMetrics()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      metrics: RPCService.getDetailedMetrics()
    });
  }
});

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

// 在现有代码后添加错误处理中间件
router.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(500).json({
    status: 'error',
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

module.exports = router; 