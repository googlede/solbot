// 加载环境变量配置
require('dotenv').config();

// 导入必要的依赖模块
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('express-compression');
const RPCService = require('./services/RPCService');
const logger = require('./utils/logger');
const apiRoutes = require('./routes/api');
const path = require('path');

// 创建 Express 应用实例
const app = express();
const port = process.env.PORT || 3002;

// 配置中间件
app.use(helmet({
    contentSecurityPolicy: false,  // 允许加载外部资源
    crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json());
app.use(compression());
app.use(logger.logRequest);
app.use(morgan('combined', { 
    stream: logger.stream,
    skip: (req) => req.url === '/api/health'
}));
app.use((req, res, next) => {
    // 禁用缓存
    res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.header('Expires', '-1');
    res.header('Pragma', 'no-cache');
    next();
});

// 静态文件服务
app.use('/static', express.static(path.join(__dirname, 'public/static')));
app.use(express.static(path.join(__dirname, 'public')));

// 注册 API 路由
app.use('/api', apiRoutes);

// 所有其他路由返回 index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

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