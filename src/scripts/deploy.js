const { exec } = require('child_process');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

async function deploy() {
    try {
        // 检查是否是首次部署
        const configPath = path.join(process.cwd(), 'ecosystem.config.js');
        if (!fs.existsSync(configPath)) {
            // 创建默认配置
            const defaultConfig = `
module.exports = {
  apps: [{
    name: 'solbot',
    script: 'src/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 3002
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3002
    },
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    log_file: 'logs/combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    log_type: 'json'
  }]
};`;
            fs.writeFileSync(configPath, defaultConfig);
            logger.info('Created default ecosystem.config.js');
        }

        // 1. 停止当前运行的服务
        logger.info('Stopping current service...');
        await executeCommand('pm2 stop solbot');

        // 2. 拉取最新代码
        logger.info('Pulling latest code...');
        await executeCommand('git pull origin main');

        // 3. 安装依赖
        logger.info('Installing dependencies...');
        await executeCommand('npm install');

        // 4. 运行数据库迁移
        logger.info('Running database migrations...');
        await executeCommand('node src/scripts/migrate.js');

        // 5. 重启服务
        logger.info('Starting service...');
        await executeCommand('pm2 start ecosystem.config.js');

        logger.info('Deployment completed successfully');
    } catch (error) {
        logger.error('Deployment failed:', error);
        // 尝试回滚
        await rollback();
        throw error;
    }
}

async function executeCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                logger.error(`Command execution failed: ${command}`, {
                    error: error.message,
                    stderr
                });
                reject(error);
                return;
            }
            logger.info(`Command executed: ${command}`, { stdout });
            resolve(stdout);
        });
    });
}

async function rollback() {
    try {
        logger.info('Starting rollback...');
        // 回滚到上一个版本
        await executeCommand('git reset --hard HEAD~1');
        // 重启服务
        await executeCommand('pm2 restart solbot');
        logger.info('Rollback completed');
    } catch (error) {
        logger.error('Rollback failed:', error);
    }
}

// 执行部署
if (require.main === module) {
    deploy().catch(error => {
        logger.error('Deploy script failed:', error);
        process.exit(1);
    });
}

module.exports = deploy; 