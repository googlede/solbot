const logger = require('../utils/logger');
const NotificationService = require('./NotificationService');
const MarketSentimentService = require('./MarketSentimentService');
const PriceImpactService = require('./PriceImpactService');
const WalletAnalysisService = require('./WalletAnalysisService');

class AlertService {
    constructor() {
        // 风险阈值配置
        this.thresholds = {
            // 价格影响阈值
            priceImpact: {
                warning: 0.02,    // 2%
                critical: 0.05    // 5%
            },
            // 市场情绪阈值
            sentiment: {
                warning: -0.3,    // 较为悲观
                critical: -0.5    // 极度悲观
            },
            // 交易规模阈值（USD）
            transactionSize: {
                warning: 1000000,  // 100万
                critical: 5000000  // 500万
            },
            // 持仓集中度阈值
            concentration: {
                warning: 0.3,     // 30%
                critical: 0.5     // 50%
            }
        };

        // 警报状态追踪
        this.activeAlerts = new Map();
        this.alertHistory = [];
        
        // 启动监控
        this._startMonitoring();
    }

    // 启动监控
    async _startMonitoring() {
        // 每分钟检查一次
        setInterval(async () => {
            try {
                await this._checkMarketRisks();
                await this._checkSmartWalletActivities();
                await this._checkPriceImpacts();
                this._cleanupOldAlerts();
            } catch (error) {
                logger.error('Error in alert monitoring:', error);
            }
        }, 60000);
    }

    // 检查市场风险
    async _checkMarketRisks() {
        try {
            const sentiment = await MarketSentimentService.getSentimentSummary();
            
            if (sentiment.current <= this.thresholds.sentiment.critical) {
                await this._createAlert('MARKET_RISK', {
                    level: 'CRITICAL',
                    type: 'EXTREME_NEGATIVE_SENTIMENT',
                    details: {
                        sentiment: sentiment.current,
                        interpretation: sentiment.interpretation
                    }
                });
            } else if (sentiment.current <= this.thresholds.sentiment.warning) {
                await this._createAlert('MARKET_RISK', {
                    level: 'WARNING',
                    type: 'NEGATIVE_SENTIMENT',
                    details: {
                        sentiment: sentiment.current,
                        interpretation: sentiment.interpretation
                    }
                });
            }
        } catch (error) {
            logger.error('Error checking market risks:', error);
        }
    }

    // 检查智能钱包活动
    async _checkSmartWalletActivities() {
        try {
            const smartWallets = await WalletAnalysisService.identifySmartWallets();
            
            for (const wallet of smartWallets) {
                const analysis = await WalletAnalysisService.analyzeHoldings(wallet.address);
                
                // 检查持仓集中度
                if (analysis.riskMetrics.concentrationRisk >= this.thresholds.concentration.critical) {
                    await this._createAlert('WALLET_RISK', {
                        level: 'CRITICAL',
                        type: 'HIGH_CONCENTRATION',
                        details: {
                            wallet: wallet.address,
                            concentration: analysis.riskMetrics.concentrationRisk,
                            holdings: analysis.currentHoldings.topHoldings
                        }
                    });
                }
                
                // 检查大额交易
                const recentTransactions = await WalletAnalysisService._getWalletTransactions(wallet.address);
                for (const tx of recentTransactions) {
                    const value = await WalletAnalysisService._calculateTransactionValue(tx);
                    if (value >= this.thresholds.transactionSize.critical) {
                        await this._createAlert('TRANSACTION_RISK', {
                            level: 'CRITICAL',
                            type: 'LARGE_TRANSACTION',
                            details: {
                                wallet: wallet.address,
                                transaction: tx.signature,
                                value
                            }
                        });
                    }
                }
            }
        } catch (error) {
            logger.error('Error checking smart wallet activities:', error);
        }
    }

    // 检查价格影响
    async _checkPriceImpacts() {
        try {
            const transactions = await this._getRecentTransactions();
            
            for (const tx of transactions) {
                const impact = await PriceImpactService.predictPriceImpact(tx);
                
                if (impact.aggregateImpact >= this.thresholds.priceImpact.critical) {
                    await this._createAlert('PRICE_IMPACT', {
                        level: 'CRITICAL',
                        type: 'SIGNIFICANT_PRICE_IMPACT',
                        details: {
                            transaction: tx.signature,
                            impact: impact.aggregateImpact,
                            predictions: impact.predictions
                        }
                    });
                }
            }
        } catch (error) {
            logger.error('Error checking price impacts:', error);
        }
    }

    // 创建警报
    async _createAlert(category, data) {
        const alert = {
            id: `${category}-${Date.now()}`,
            timestamp: new Date().toISOString(),
            category,
            ...data
        };

        // 检查是否已有相似警报
        const existingAlert = this.activeAlerts.get(this._getAlertKey(alert));
        if (existingAlert && !this._shouldUpdateAlert(existingAlert, alert)) {
            return;
        }

        // 更新活跃警报
        this.activeAlerts.set(this._getAlertKey(alert), alert);
        this.alertHistory.push(alert);

        // 发送通知
        await this._sendAlertNotification(alert);

        logger.info('Alert created:', alert);
    }

    // 获取警报键值
    _getAlertKey(alert) {
        return `${alert.category}-${alert.type}-${alert.details?.wallet || alert.details?.transaction || 'market'}`;
    }

    // 判断是否需要更新警报
    _shouldUpdateAlert(existing, newAlert) {
        // 如果新警报级别更高，或者最后更新时间超过1小时，则更新
        return newAlert.level === 'CRITICAL' || 
               Date.now() - new Date(existing.timestamp).getTime() > 3600000;
    }

    // 发送警报通知
    async _sendAlertNotification(alert) {
        try {
            switch (alert.level) {
                case 'CRITICAL':
                    await NotificationService.sendRiskAlert({
                        level: alert.level,
                        type: alert.type,
                        details: alert.details
                    });
                    break;
                case 'WARNING':
                    await NotificationService.sendSystemStatus({
                        type: 'RISK_WARNING',
                        details: alert.details
                    });
                    break;
            }
        } catch (error) {
            logger.error('Error sending alert notification:', error);
        }
    }

    // 清理旧警报
    _cleanupOldAlerts() {
        const now = Date.now();
        
        // 清理超过24小时的活跃警报
        for (const [key, alert] of this.activeAlerts.entries()) {
            if (now - new Date(alert.timestamp).getTime() > 24 * 60 * 60 * 1000) {
                this.activeAlerts.delete(key);
            }
        }
        
        // 保留最近7天的历史记录
        this.alertHistory = this.alertHistory.filter(alert => 
            now - new Date(alert.timestamp).getTime() <= 7 * 24 * 60 * 60 * 1000
        );
    }

    // 获取活跃警报
    getActiveAlerts() {
        return Array.from(this.activeAlerts.values());
    }

    // 获取警报历史
    getAlertHistory(options = {}) {
        const { category, level, limit = 100, offset = 0 } = options;
        
        let filtered = this.alertHistory;
        
        if (category) {
            filtered = filtered.filter(alert => alert.category === category);
        }
        if (level) {
            filtered = filtered.filter(alert => alert.level === level);
        }
        
        return filtered
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(offset, offset + limit);
    }

    // 添加新的预警规则
    async _addAlertRules() {
        this.alertRules = {
            // 价格异常规则
            priceRules: [
                {
                    id: 'PRICE_DUMP',
                    condition: (data) => data.priceChange < -0.2,
                    level: 'CRITICAL',
                    message: 'Significant price dump detected'
                },
                {
                    id: 'PRICE_PUMP',
                    condition: (data) => data.priceChange > 0.3,
                    level: 'WARNING',
                    message: 'Unusual price pump detected'
                }
            ],
            
            // 交易量异常规则
            volumeRules: [
                {
                    id: 'VOLUME_SPIKE',
                    condition: (data) => data.volumeChange > 5,
                    level: 'WARNING',
                    message: 'Abnormal volume increase detected'
                }
            ],
            
            // 智能钱包行为规则
            smartWalletRules: [
                {
                    id: 'SMART_WALLET_DUMP',
                    condition: (data) => data.selloff > 0.5,
                    level: 'CRITICAL',
                    message: 'Smart money selling detected'
                }
            ],
            
            // 市场操纵规则
            manipulationRules: [
                {
                    id: 'WASH_TRADING',
                    condition: (data) => data.washTradingScore > 0.7,
                    level: 'CRITICAL',
                    message: 'Wash trading activity detected'
                }
            ]
        };
    }

    // 评估预警规则
    async _evaluateAlertRules(data) {
        const triggeredRules = [];
        
        for (const category in this.alertRules) {
            for (const rule of this.alertRules[category]) {
                if (rule.condition(data)) {
                    triggeredRules.push({
                        id: rule.id,
                        level: rule.level,
                        message: rule.message,
                        data: data
                    });
                }
            }
        }
        
        return triggeredRules;
    }
}

module.exports = new AlertService(); 