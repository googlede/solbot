require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const RPCService = require('./services/RPCService');
const logger = require('./utils/logger');

const app = express();
const port = process.env.PORT || 3002;

console.log('Starting server with port:', process.env.PORT);

// 中间件
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined', { stream: logger.stream }));

// 健康检查路由
app.get('/health', (req, res) => {
    const metrics = RPCService.getMetrics();
    res.json({
        status: 'ok',
        timestamp: new Date(),
        providers: {
            primary: RPCService.providers.primary.isHealthy,
            fallback: RPCService.providers.fallback.isHealthy
        },
        metrics
    });
});

// API 路由
app.get('/api/block/:slot', async (req, res) => {
    try {
        const block = await RPCService.getBlock(parseInt(req.params.slot));
        res.json(block);
    } catch (error) {
        logger.error('Failed to get block:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/transaction/:signature', async (req, res) => {
    try {
        const tx = await RPCService.getTransaction(req.params.signature);
        res.json(tx);
    } catch (error) {
        logger.error('Failed to get transaction:', error);
        res.status(500).json({ error: error.message });
    }
});

// 批量处理路由
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

// 错误处理中间件
app.use((err, req, res, next) => {
    logger.error(err.stack);
    res.status(500).json({ 
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 启动服务器
app.listen(port, () => {
    logger.info(`Server running on port ${port}`);
    logger.info('RPC Service initialized with providers:', {
        primary: RPCService.providers.primary.config.name,
        fallback: RPCService.providers.fallback.config.name
    });
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

module.exports = app; 