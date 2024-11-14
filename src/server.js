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

// 配置中间件
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json());
app.use(compression());

// 配置日志
const logFormat = ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"';
app.use(morgan(logFormat, { 
    stream: logger.stream,
    skip: (req) => req.url === '/api/health'
}));

// 请求日志中间件
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
app.get('/api/activity/stream', async (req, res) => {
    try {
        logger.info('Activity stream requested', {
            ip: req.ip,
            timestamp: new Date().toISOString()
        });

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
        }

        data = await ActivityService.getActivityData();
        
        try {
            if (data) {
                await redis.set(cacheKey, JSON.stringify(data), 'EX', 300);
            }
        } catch (cacheError) {
            logger.error('Cache set error:', cacheError);
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

// 错误处理中间件
app.use((err, req, res, next) => {
    logger.error('Unhandled Error:', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        timestamp: new Date().toISOString()
    });
    
    res.status(500).json({ 
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 启动服务器
app.listen(port, '0.0.0.0', () => {
    logger.info(`Server started at ${new Date().toISOString()}`);
    logger.info(`Server listening on port ${port}`);
    logger.info(`Environment: ${process.env.NODE_ENV}`);
});

module.exports = app;