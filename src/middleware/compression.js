const compression = require('compression');
const logger = require('../utils/logger');

// 自定义压缩配置
module.exports = compression({
    // 只压缩超过 1KB 的响应
    threshold: 1024,
    
    // 根据请求头判断是否需要压缩
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    },
    
    // 压缩级别 (0-9)
    level: 6,
    
    // 记录压缩效果
    onComplete: (stats) => {
        logger.info('Response compressed', {
            originalSize: stats.originalSize,
            compressedSize: stats.compressedSize,
            ratio: ((1 - stats.compressedSize / stats.originalSize) * 100).toFixed(2) + '%'
        });
    }
}); 