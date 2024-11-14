const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class BackupService {
    constructor() {
        this.backupDir = path.join(__dirname, '../../backups');
        this.config = {
            interval: 24 * 60 * 60 * 1000, // 每天备份
            retention: 7, // 保留7天
            compression: true
        };

        // 创建备份目录
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }

        // 启动定时备份
        this._startBackupSchedule();
    }

    // 启动备份计划
    _startBackupSchedule() {
        setInterval(() => {
            this.createBackup()
                .then(() => this.cleanOldBackups())
                .catch(error => logger.error('Backup failed:', error));
        }, this.config.interval);
    }

    // 创建备份
    async createBackup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `backup-${timestamp}.sql`;
        const filepath = path.join(this.backupDir, filename);

        const command = `PGPASSWORD=${process.env.DB_PASSWORD} pg_dump -h ${process.env.DB_HOST} -U ${process.env.DB_USER} -d ${process.env.DB_NAME} -F c -f ${filepath}`;

        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    logger.error('Backup error:', error);
                    reject(error);
                    return;
                }
                logger.info(`Backup created: ${filename}`);
                resolve(filepath);
            });
        });
    }

    // 清理旧备份
    async cleanOldBackups() {
        const files = fs.readdirSync(this.backupDir);
        const now = Date.now();

        files.forEach(file => {
            const filepath = path.join(this.backupDir, file);
            const stat = fs.statSync(filepath);

            if (now - stat.mtime.getTime() > this.config.retention * 24 * 60 * 60 * 1000) {
                fs.unlinkSync(filepath);
                logger.info(`Deleted old backup: ${file}`);
            }
        });
    }

    // 恢复备份
    async restoreBackup(filepath) {
        const command = `PGPASSWORD=${process.env.DB_PASSWORD} pg_restore -h ${process.env.DB_HOST} -U ${process.env.DB_USER} -d ${process.env.DB_NAME} -c ${filepath}`;

        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    logger.error('Restore error:', error);
                    reject(error);
                    return;
                }
                logger.info(`Backup restored from: ${filepath}`);
                resolve();
            });
        });
    }
}

module.exports = new BackupService(); 