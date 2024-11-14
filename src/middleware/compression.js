const compression = require('express-compression');
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
    level: 6
}); 