require('dotenv').config();

// 导入必要的依赖模块
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('express-compression');
const logger = require('./utils/logger');
const redis = require('./config/redis');
const ActivityService = require('./services/ActivityService');
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
app.use(morgan('combined', { 
    stream: logger.stream,
    skip: (req) => req.url === '/api/health'
}));

// 健康检查路由
app.get('/api/health', async (req, res) => {
    try {
        const status = {
            service: 'ok',
            timestamp: new Date().toISOString()
        };

        // 检查 Redis 连接
        try {
            const ping = await redis.client.ping();
            status.redis = ping === 'PONG' ? 'ok' : 'error';
        } catch (redisError) {
            logger.error('Redis health check failed:', redisError);
            status.redis = 'error';
        }

        res.json(status);
    } catch (error) {
        logger.error('Health check failed:', error);
        res.status(500).json({ 
            error: 'Health check failed',
            timestamp: new Date().toISOString()
        });
    }
});

// 活动流路由
app.get('/api/activity/stream', async (req, res) => {
    try {
        logger.info('Activity stream requested', {
            ip: req.ip,
            timestamp: new Date().toISOString()
        });

        const data = await ActivityService.getActivityData();
        res.json(data || { activities: [], timestamp: new Date().toISOString() });
    } catch (error) {
        logger.error('Activity stream error:', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 所有其他路由返回 index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
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