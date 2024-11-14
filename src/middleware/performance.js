const logger = require('../utils/logger');

module.exports = function performanceMiddleware(req, res, next) {
    const start = process.hrtime();
    
    // 添加响应时间头
    res.on('finish', () => {
        const [seconds, nanoseconds] = process.hrtime(start);
        const duration = seconds * 1000 + nanoseconds / 1e6;
        
        // 记录慢请求
        if (duration > 1000) {
            logger.warn('Slow request detected', {
                method: req.method,
                url: req.url,
                duration: `${duration.toFixed(2)}ms`,
                query: req.query,
                body: req.body
            });
        }
        
        // 添加性能指标头
        res.setHeader('X-Response-Time', `${duration.toFixed(2)}ms`);
    });
    
    next();
}; 