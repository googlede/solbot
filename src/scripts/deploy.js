const { exec } = require('child_process');
const logger = require('../utils/logger');

async function deploy() {
    try {
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
        await executeCommand('pm2 start solbot');

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