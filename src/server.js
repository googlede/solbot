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

// 创建 Express 应用实例
const app = express();
const port = process.env.PORT || 3002;

// 配置中间件
app.use(helmet());  // 添加各种 HTTP 安全头
app.use(cors());    // 允许跨域请求
app.use(express.json());  // 解析 JSON 请求体
app.use(logger.logRequest);
app.use(morgan('combined', { 
  stream: logger.stream,
  skip: (req) => req.url === '/api/health' // 跳过健康检查的日志
}));

// 注册 API 路由
app.use('/api', apiRoutes);

// 全局错误处理中间件
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

// 启动服务器
app.listen(port, () => {
  logger.info(`Server running on port ${port}`);
});

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// 处理未捕获的 Promise 拒绝
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app;
EOL