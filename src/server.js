require('dotenv').config();

// 导入必要的依赖模块
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('express-compression');
const logger = require('./utils/logger');
const TokenService = require('./services/TokenService');
const path = require('path');

// 创建 Express 应用实例
const app = express();
const port = process.env.PORT || 3002;

// 基础中间件
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json());
app.use(compression());

// 日志中间件
app.use((req, res, next) => {
    logger.info('Request received:', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        timestamp: new Date().toISOString()
    });
    next();
});

// API 路由
app.get('/api/tokens/top', async (req, res) => {
    try {
        const { marketCap = '50k', limit = 200 } = req.query;
        logger.info('Fetching tokens with params:', { marketCap, limit });

        const tokens = await TokenService.getTopTokens(marketCap, parseInt(limit));
        
        if (!tokens || !tokens.tokens) {
            logger.error('Invalid token data received');
            return res.status(500).json({ 
                error: 'Invalid data format',
                message: 'Failed to fetch token data'
            });
        }

        res.json(tokens);
    } catch (error) {
        logger.error('Error fetching top tokens:', {
            error: error.message,
            stack: error.stack
        });
        
        // 返回用户友好的错误信息
        res.status(500).json({ 
            error: 'Failed to fetch token data',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// 健康检查端点
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

// 修改静态文件服务配置
app.use(express.static(path.join(__dirname, 'public'), {
    etag: false,  // 禁用 ETag
    maxAge: 0,    // 禁用客户端缓存
    lastModified: false  // 禁用 Last-Modified
}));

// 添加缓存控制中间件
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});

// 错误处理中间件
app.use((err, req, res, next) => {
    logger.error('Unhandled Error:', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method
    });
    
    res.status(500).json({ 
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// 启动服务器
app.listen(port, '0.0.0.0', () => {
    logger.info(`Server started at ${new Date().toISOString()}`);
    logger.info(`Server listening on port ${port}`);
    logger.info(`Environment: ${process.env.NODE_ENV}`);
});

module.exports = app;