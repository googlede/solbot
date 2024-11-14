require('dotenv').config();

// 导入必要的依赖模块
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('express-compression');
const logger = require('./utils/logger');
const redis = require('./config/redis');
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
app.get('/api/tokens/trending', async (req, res) => {
    try {
        // 尝试从缓存获取数据
        const cached = await redis.get('trending_tokens');
        if (cached) {
            return res.json(JSON.parse(cached));
        }

        // 模拟数据 - 后续替换为真实数据
        const mockData = {
            tokens: [
                {
                    symbol: 'PNUT2.0',
                    age: '1d',
                    liquidity: '45.1K',
                    holders: '2.1K',
                    txs1h: '16,923',
                    volume: '$14.4K',
                    price: '$0.0001',
                    change1h: '+1.5%',
                    change5m: '+3.3%',
                    change1d: '-17.1%'
                },
                // ... 添加更多模拟数据
            ],
            timestamp: new Date().toISOString()
        };

        // 缓存数据
        await redis.set('trending_tokens', JSON.stringify(mockData), 'EX', 60);
        res.json(mockData);
    } catch (error) {
        logger.error('Error fetching trending tokens:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 错误处理
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
});

module.exports = app;