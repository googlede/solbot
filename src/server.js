cat > src/server.js << 'EOL'
// 加载环境变量配置，确保所有环境变量都可用
require('dotenv').config();

// 导入必要的依赖模块
const express = require('express');        // Web 应用框架
const cors = require('cors');             // 跨域资源共享中间件
const helmet = require('helmet');         // 安全中间件
const morgan = require('morgan');         // HTTP 请求日志中间件
const RPCService = require('./services/RPCService');  // RPC 服务
const logger = require('./utils/logger');  // 日志工具
const apiRoutes = require('./routes/api'); // API 路由模块

// 输出环境变量中的端口配置，用于调试
console.log('Environment PORT:', process.env.PORT);

// 创建 Express 应用实例
const app = express();
// 设置服务器端口，优先使用环境变量中的端口，默认为 3002
const port = process.env.PORT || 3002;

// 输出启动信息
console.log('Starting server with port:', port);

// 配置中间件
app.use(helmet());  // 添加各种 HTTP 安全头
app.use(cors());    // 允许跨域请求
app.use(express.json());  // 解析 JSON 请求体
app.use(logger.logRequest);
app.use(morgan('combined', { 
  stream: logger.stream,
  skip: (req) => req.url === '/api/health' // 跳过健康检查的日志
}));

// 注册 API 路由，所有 /api 开头的请求都会由 apiRoutes 处理
app.use('/api', apiRoutes);

// 区块查询接口 - 根据区块高度获取区块信息
app.get('/api/block/:slot', async (req, res) => {
    try {
        const block = await RPCService.getBlock(parseInt(req.params.slot));
        res.json(block);
    } catch (error) {
        logger.error('Failed to get block:', error);
        res.status(500).json({ error: error.message });
    }
});

// 交易查询接口 - 根据交易签名获取交易详情
app.get('/api/transaction/:signature', async (req, res) => {
    try {
        const tx = await RPCService.getTransaction(req.params.signature);
        res.json(tx);
    } catch (error) {
        logger.error('Failed to get transaction:', error);
        res.status(500).json({ error: error.message });
    }
});

// 批量交易处理接口 - 批量获取多个交易的详情
app.post('/api/batch/transactions', async (req, res) => {
    try {
        const { signatures } = req.body;
        if (!Array.isArray(signatures)) {
            return res.status(400).json({ error: 'Signatures must be an array' });
        }
        
        const transactions = await RPCService.batchRequest('getTransaction', signatures);
        res.json(transactions);
    } catch (error) {
        logger.error('Failed to process batch request:', error);
        res.status(500).json({ error: error.message });
    }
});

// 全局错误处理中间件 - 捕获所有未处理的错误
app.use((err, req, res, next) => {
  logger.error('Unhandled Error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    query: req.query,
    params: req.params
  });
  
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 启动服务器并监听指定端口
app.listen(port, () => {
    logger.info(`Server running on port ${port}`);
    logger.info('RPC Service initialized with providers:', {
        primary: RPCService.providers.primary.config.name,
        fallback: RPCService.providers.fallback.config.name
    });
});

// 处理未捕获的 Promise 拒绝
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// 处理未捕获的异常 - 记录错误并退出进程
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);  // 发生未捕获的异常时退出进程
});

// 导出 app 实例供测试使用
module.exports = app;
EOL