const logger = require('../utils/logger');
const axios = require('axios');

class NotificationService {
    constructor() {
        // 通知配置
        this.config = {
            // Discord Webhook 配置
            discord: {
                enabled: true,
                webhookUrl: process.env.DISCORD_WEBHOOK_URL,
                username: 'SolBot Alert',
                avatarUrl: 'https://example.com/bot-avatar.png'
            },
            // Telegram Bot 配置
            telegram: {
                enabled: true,
                botToken: process.env.TELEGRAM_BOT_TOKEN,
                chatId: process.env.TELEGRAM_CHAT_ID
            },
            // 邮件配置
            email: {
                enabled: false,
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT,
                secure: true,
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            }
        };

        // 通知级别
        this.levels = {
            INFO: 'info',
            WARNING: 'warning',
            ALERT: 'alert',
            CRITICAL: 'critical'
        };

        // 通知限流
        this.rateLimits = {
            [this.levels.INFO]: { count: 0, lastReset: Date.now(), max: 100 },
            [this.levels.WARNING]: { count: 0, lastReset: Date.now(), max: 50 },
            [this.levels.ALERT]: { count: 0, lastReset: Date.now(), max: 20 },
            [this.levels.CRITICAL]: { count: 0, lastReset: Date.now(), max: 10 }
        };
    }

    // 发送通知
    async sendNotification(message, level = 'info', options = {}) {
        try {
            if (!this._checkRateLimit(level)) {
                logger.warn('Notification rate limit exceeded', { level });
                return false;
            }

            const notificationData = this._formatNotification(message, level, options);
            
            const promises = [];
            if (this.config.discord.enabled) {
                promises.push(this._sendDiscordNotification(notificationData));
            }
            if (this.config.telegram.enabled) {
                promises.push(this._sendTelegramNotification(notificationData));
            }
            if (this.config.email.enabled) {
                promises.push(this._sendEmailNotification(notificationData));
            }

            const results = await Promise.allSettled(promises);
            const success = results.some(r => r.status === 'fulfilled');

            if (success) {
                logger.info('Notification sent successfully', { level, channels: results.length });
            } else {
                logger.error('All notification channels failed', { 
                    level,
                    errors: results.map(r => r.reason?.message)
                });
            }

            return success;
        } catch (error) {
            logger.error('Error sending notification:', error);
            return false;
        }
    }

    // 发送智能钱包警报
    async sendSmartWalletAlert(walletData) {
        const message = {
            title: '🚨 Smart Wallet Activity Detected',
            description: `A wallet with high activity score has been identified`,
            fields: [
                { name: 'Address', value: walletData.address },
                { name: 'Score', value: walletData.score.toFixed(2) },
                { name: 'Transaction Volume', value: `$${walletData.metrics.volume.toLocaleString()}` },
                { name: 'Success Rate', value: `${(walletData.metrics.successRate * 100).toFixed(1)}%` }
            ],
            timestamp: new Date().toISOString()
        };

        return this.sendNotification(message, this.levels.ALERT, {
            color: '#FF9900',
            footer: 'Smart Wallet Detection System'
        });
    }

    // 发送大额交易警报
    async sendLargeTransactionAlert(transactionData) {
        const message = {
            title: '💰 Large Transaction Detected',
            description: `A significant transaction has occurred`,
            fields: [
                { name: 'Amount', value: `$${transactionData.value.toLocaleString()}` },
                { name: 'Token', value: transactionData.token },
                { name: 'Transaction', value: transactionData.signature },
                { name: 'Block', value: transactionData.slot.toString() }
            ],
            timestamp: new Date().toISOString()
        };

        return this.sendNotification(message, this.levels.WARNING, {
            color: '#00FF00',
            footer: 'Transaction Monitoring System'
        });
    }

    // 发送风险警报
    async sendRiskAlert(riskData) {
        const message = {
            title: '⚠️ High Risk Activity Detected',
            description: `Risk assessment has identified potential concerns`,
            fields: [
                { name: 'Risk Level', value: riskData.level },
                { name: 'Risk Score', value: riskData.score.toFixed(2) },
                { name: 'Type', value: riskData.type },
                { name: 'Details', value: riskData.details }
            ],
            timestamp: new Date().toISOString()
        };

        return this.sendNotification(message, this.levels.CRITICAL, {
            color: '#FF0000',
            footer: 'Risk Analysis System'
        });
    }

    // 发送系统状态通知
    async sendSystemStatus(statusData) {
        const message = {
            title: '🔄 System Status Update',
            description: `Current system status and metrics`,
            fields: [
                { name: 'Uptime', value: `${(statusData.uptime / 3600).toFixed(1)} hours` },
                { name: 'Active Monitors', value: statusData.activeMonitors.toString() },
                { name: 'Processing Queue', value: statusData.queueSize.toString() },
                { name: 'Memory Usage', value: `${(statusData.memoryUsage * 100).toFixed(1)}%` }
            ],
            timestamp: new Date().toISOString()
        };

        return this.sendNotification(message, this.levels.INFO, {
            color: '#0099FF',
            footer: 'System Monitoring'
        });
    }

    // 私有方法：检查速率限制
    _checkRateLimit(level) {
        const now = Date.now();
        const limit = this.rateLimits[level];
        
        if (now - limit.lastReset > 3600000) { // 1小时重置
            limit.count = 0;
            limit.lastReset = now;
        }

        if (limit.count >= limit.max) {
            return false;
        }

        limit.count++;
        return true;
    }

    // 私有方法：格式化通知
    _formatNotification(message, level, options) {
        return {
            ...message,
            level,
            color: options.color || this._getLevelColor(level),
            footer: options.footer || 'SolBot Notification System',
            timestamp: message.timestamp || new Date().toISOString()
        };
    }

    // 私有方法：获取级别颜色
    _getLevelColor(level) {
        const colors = {
            info: '#0099FF',
            warning: '#FFB700',
            alert: '#FF9900',
            critical: '#FF0000'
        };
        return colors[level] || colors.info;
    }

    // 私有方法：发送 Discord 通知
    async _sendDiscordNotification(data) {
        try {
            const embed = {
                title: data.title,
                description: data.description,
                color: parseInt(data.color.replace('#', ''), 16),
                fields: data.fields,
                footer: { text: data.footer },
                timestamp: data.timestamp
            };

            await axios.post(this.config.discord.webhookUrl, {
                username: this.config.discord.username,
                avatar_url: this.config.discord.avatarUrl,
                embeds: [embed]
            });

            return true;
        } catch (error) {
            logger.error('Discord notification failed:', error);
            return false;
        }
    }

    // 私有方法：发送 Telegram 通知
    async _sendTelegramNotification(data) {
        try {
            const message = this._formatTelegramMessage(data);
            const url = `https://api.telegram.org/bot${this.config.telegram.botToken}/sendMessage`;
            
            await axios.post(url, {
                chat_id: this.config.telegram.chatId,
                text: message,
                parse_mode: 'HTML'
            });

            return true;
        } catch (error) {
            logger.error('Telegram notification failed:', error);
            return false;
        }
    }

    // 私有方法：格式化 Telegram 消息
    _formatTelegramMessage(data) {
        let message = `<b>${data.title}</b>\n\n`;
        message += `${data.description}\n\n`;
        
        for (const field of data.fields) {
            message += `<b>${field.name}:</b> ${field.value}\n`;
        }
        
        message += `\n<i>${data.footer}</i>`;
        return message;
    }
}

module.exports = new NotificationService(); 