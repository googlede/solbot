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
const redis = require('./config/redis');

// 创建 Express 应用实例
const app = express();
const port = process.env.PORT || 3002;

// 添加调试日志中间件
app.use((req, res, next) => {
    logger.info('Request received:', {
        method: req.method,
        url: req.url,
        timestamp: new Date().toISOString()
    });
    next();
});

// 配置中间件
app.use(helmet({
    contentSecurityPolicy: false,
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

// 静态文件服务
app.use('/static', express.static(path.join(__dirname, 'public/static')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use(express.static(path.join(__dirname, 'public')));

// 注册 API 路由
app.use('/api', apiRoutes);

// 添加 Redis 健康检查
app.get('/api/health/redis', async (req, res) => {
    try {
        const pingResult = await redis.ping();
        if (pingResult === 'PONG') {
            res.json({ status: 'ok', redis: 'connected' });
        } else {
            res.status(500).json({ status: 'error', message: 'Redis not responding correctly' });
        }
    } catch (error) {
        logger.error('Redis health check failed:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Redis connection failed',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Redis 错误处理中间件
app.use((err, req, res, next) => {
    if (err.name === 'RedisError') {
        logger.error('Redis Error:', {
            error: err.message,
            stack: err.stack,
            timestamp: new Date().toISOString()
        });
        
        // 尝试重连 Redis
        redis.disconnect();
        redis.connect().catch(error => {
            logger.error('Redis reconnection failed:', error);
        });
        
        // 使用备用存储或返回错误响应
        return res.status(503).json({
            error: 'Service temporarily unavailable',
            message: 'Redis connection error'
        });
    }
    next(err);
});

// 添加请求日志中间件
app.use((req, res, next) => {
    logger.info('Incoming request:', {
        path: req.path,
        method: req.method,
        query: req.query,
        timestamp: new Date().toISOString()
    });
    next();
});

// 修改数据路由
app.get('/api/activity/stream', async (req, res) => {
    try {
        const cacheKey = 'wallet_activity_stream';
        
        // 尝试从 Redis 获取缓存
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
            logger.info('Returning cached data');
            return res.json(JSON.parse(cachedData));
        }

        // 如果没有缓存，从数据库获取
        const data = await WalletService.getActivityStream();
        
        // 记录数据状态
        logger.info('Activity stream data:', {
            hasData: !!data,
            dataLength: data ? data.length : 0,
            timestamp: new Date().toISOString()
        });

        // 缓存数据
        await redis.set(cacheKey, JSON.stringify(data), 'EX', 300); // 5分钟过期
        
        res.json(data);
    } catch (error) {
        logger.error('Error fetching activity stream:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// 所有其他路由返回 index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// 全局错误处理中间件
app.use((err, req, res, next) => {
    if (err.code === 'ECONNREFUSED' && err.message.includes('Redis')) {
        logger.warn('Redis connection failed, falling back to memory cache');
        // 使用内存缓存作为后备方案
        return next();
    }
    next(err);
});

// 在 app.listen 之前添加
app.use((err, req, res, next) => {
    logger.error('Server Error:', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        timestamp: new Date().toISOString()
    });
    
    // 添加详细的错误响应
    res.status(500).json({ 
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Server Error',
        timestamp: new Date().toISOString()
    });
});

// 修改启动监听
app.listen(port, '0.0.0.0', () => {
    logger.info(`Server started at ${new Date().toISOString()}`);
    logger.info(`Server listening on port ${port}`);
    logger.info(`Environment: ${process.env.NODE_ENV}`);
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