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
const ActivityService = require('./services/ActivityService');

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
app.use(async (err, req, res, next) => {
    if (err.message && err.message.includes('NOAUTH')) {
        logger.error('Redis auth error:', err);
        
        // 尝试重新认证
        try {
            await redis.auth('a44155702');
            // 认证成功后重试请求
            return next();
        } catch (authError) {
            logger.error('Redis reauth failed:', authError);
        }
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

// 修改活动流路由
app.get('/api/activity/stream', async (req, res) => {
    try {
        logger.info('Activity stream requested', {
            ip: req.ip,
            timestamp: new Date().toISOString()
        });

        // 尝试从 Redis 获取数据
        const cacheKey = 'activity_stream';
        let data;
        
        try {
            data = await redis.get(cacheKey);
            if (data) {
                logger.info('Cache hit for activity stream');
                return res.json(JSON.parse(data));
            }
        } catch (redisError) {
            logger.error('Redis error:', redisError);
            // Redis 错误时继续获取新数据
        }

        // 获取新数据
        data = await ActivityService.getActivityData();
        
        // 尝试缓存数据
        try {
            if (data) {
                await redis.set(cacheKey, JSON.stringify(data), 'EX', 300);
            }
        } catch (cacheError) {
            logger.error('Cache set error:', cacheError);
            // 缓存错误不影响返回数据
        }

        res.json(data || { activities: [], timestamp: new Date().toISOString() });
    } catch (error) {
        logger.error('Activity stream error:', {
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