const logger = require('../utils/logger');
const axios = require('axios');
const WalletAnalysisService = require('./WalletAnalysisService');
const TokenService = require('./TokenService');

class MarketSentimentService {
    constructor() {
        this.sentimentWindow = 24 * 60 * 60 * 1000; // 24小时
        this.updateInterval = 5 * 60 * 1000;        // 5分钟更新一次
        this.sentimentScores = new Map();
        this.startSentimentTracking();
    }

    // 开始情绪追踪
    startSentimentTracking() {
        setInterval(async () => {
            try {
                await this.updateMarketSentiment();
            } catch (error) {
                logger.error('Error updating market sentiment:', error);
            }
        }, this.updateInterval);
    }

    // 更新市场情绪
    async updateMarketSentiment() {
        try {
            // 获取智能钱包活动
            const smartWallets = await WalletAnalysisService.identifySmartWallets();
            const recentActivity = await this._getRecentActivity(smartWallets);

            // 分析交易行为
            const tradingBehavior = this._analyzeTradingBehavior(recentActivity);
            
            // 分析持仓变化
            const holdingChanges = await this._analyzeHoldingChanges(smartWallets);
            
            // 计算市场情绪得分
            const sentimentScore = this._calculateSentimentScore(tradingBehavior, holdingChanges);
            
            // 更新情绪记录
            this.sentimentScores.set(Date.now(), sentimentScore);
            
            // 清理旧数据
            this._cleanupOldData();

            logger.info('Market sentiment updated', {
                score: sentimentScore,
                tradingBehavior,
                holdingChanges
            });

            return sentimentScore;
        } catch (error) {
            logger.error('Error in updateMarketSentiment:', error);
            throw error;
        }
    }

    // 获取最近活动
    async _getRecentActivity(smartWallets) {
        const activity = [];
        const now = Date.now();

        for (const wallet of smartWallets) {
            const transactions = await WalletAnalysisService._getWalletTransactions(wallet.address);
            const recentTx = transactions.filter(tx => 
                now - tx.blockTime * 1000 < this.sentimentWindow
            );
            activity.push(...recentTx.map(tx => ({
                ...tx,
                walletScore: wallet.score
            })));
        }

        return activity;
    }

    // 分析交易行为
    _analyzeTradingBehavior(activity) {
        const behavior = {
            buyVolume: 0,
            sellVolume: 0,
            uniqueBuyers: new Set(),
            uniqueSellers: new Set(),
            largeTransactions: 0,
            averageSize: 0
        };

        activity.forEach(tx => {
            const transfers = tx.transaction.message.instructions
                .filter(inst => WalletAnalysisService._isTokenTransfer(inst));
            
            transfers.forEach(transfer => {
                const value = transfer.amount * transfer.price;
                if (transfer.type === 'buy') {
                    behavior.buyVolume += value;
                    behavior.uniqueBuyers.add(transfer.destination);
                } else {
                    behavior.sellVolume += value;
                    behavior.uniqueSellers.add(transfer.source);
                }

                if (value > 100000) { // 大额交易阈值：10万美元
                    behavior.largeTransactions++;
                }
            });
        });

        behavior.averageSize = (behavior.buyVolume + behavior.sellVolume) / activity.length;
        return behavior;
    }

    // 分析持仓变化
    async _analyzeHoldingChanges(smartWallets) {
        const changes = {
            netPositionChange: 0,
            positionIncreases: 0,
            positionDecreases: 0,
            newPositions: 0,
            closedPositions: 0
        };

        for (const wallet of smartWallets) {
            const currentHoldings = await WalletAnalysisService._calculateHoldingValue(wallet.address);
            const previousHoldings = await this._getPreviousHoldings(wallet.address);
            
            const change = currentHoldings - previousHoldings;
            changes.netPositionChange += change;

            if (change > 0) {
                changes.positionIncreases++;
                if (previousHoldings === 0) changes.newPositions++;
            } else if (change < 0) {
                changes.positionDecreases++;
                if (currentHoldings === 0) changes.closedPositions++;
            }
        }

        return changes;
    }

    // 计算情绪得分
    _calculateSentimentScore(behavior, changes) {
        // 交易行为权重
        const tradeScore = (
            (behavior.buyVolume - behavior.sellVolume) / (behavior.buyVolume + behavior.sellVolume) * 0.4 +
            (behavior.uniqueBuyers.size - behavior.uniqueSellers.size) / 
            (behavior.uniqueBuyers.size + behavior.uniqueSellers.size) * 0.3 +
            (behavior.largeTransactions / behavior.averageSize) * 0.3
        );

        // 持仓变化权重
        const holdingScore = (
            (changes.positionIncreases - changes.positionDecreases) / 
            (changes.positionIncreases + changes.positionDecreases) * 0.4 +
            (changes.newPositions - changes.closedPositions) /
            (changes.newPositions + changes.closedPositions) * 0.3 +
            (changes.netPositionChange > 0 ? 1 : -1) * 0.3
        );

        // 综合得分 (-1 到 1)
        return (tradeScore * 0.6 + holdingScore * 0.4);
    }

    // 获取情绪趋势
    getSentimentTrend(duration = 24 * 60 * 60 * 1000) {
        const now = Date.now();
        const scores = Array.from(this.sentimentScores.entries())
            .filter(([timestamp]) => now - timestamp < duration)
            .sort(([a], [b]) => a - b);

        if (scores.length < 2) return 0;

        // 计算趋势斜率
        const xMean = scores.reduce((sum, [x]) => sum + x, 0) / scores.length;
        const yMean = scores.reduce((sum, [_, y]) => sum + y, 0) / scores.length;

        const slope = scores.reduce((sum, [x, y]) => {
            return sum + (x - xMean) * (y - yMean);
        }, 0) / scores.reduce((sum, [x]) => sum + Math.pow(x - xMean, 2), 0);

        return slope;
    }

    // 清理旧数据
    _cleanupOldData() {
        const cutoff = Date.now() - this.sentimentWindow;
        for (const [timestamp] of this.sentimentScores) {
            if (timestamp < cutoff) {
                this.sentimentScores.delete(timestamp);
            }
        }
    }

    // 获取市场情绪摘要
    async getSentimentSummary() {
        const currentSentiment = await this.updateMarketSentiment();
        const trend = this.getSentimentTrend();
        
        return {
            current: currentSentiment,
            trend,
            interpretation: this._interpretSentiment(currentSentiment, trend),
            timestamp: Date.now()
        };
    }

    // 解释市场情绪
    _interpretSentiment(sentiment, trend) {
        let interpretation = '';
        
        // 基于当前情绪
        if (sentiment > 0.5) {
            interpretation = '市场极度乐观';
        } else if (sentiment > 0.2) {
            interpretation = '市场偏向乐观';
        } else if (sentiment < -0.5) {
            interpretation = '市场极度悲观';
        } else if (sentiment < -0.2) {
            interpretation = '市场偏向悲观';
        } else {
            interpretation = '市场情绪中性';
        }

        // 基于趋势
        if (Math.abs(trend) > 0.1) {
            interpretation += trend > 0 ? '，且情绪持续改善' : '，且情绪持续恶化';
        }

        return interpretation;
    }
}

module.exports = new MarketSentimentService(); 