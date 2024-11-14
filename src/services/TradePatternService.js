const logger = require('../utils/logger');
const WalletAnalysisService = require('./WalletAnalysisService');
const TokenService = require('./TokenService');

class TradePatternService {
    constructor() {
        this.patterns = {
            SWING_TRADE: 'swing_trader',
            MOMENTUM: 'momentum_trader',
            SCALPER: 'scalper',
            POSITION: 'position_trader',
            DIP_BUYER: 'dip_buyer',
            ARBITRAGE: 'arbitrageur'
        };

        this.timeframes = {
            SCALP: 3600,        // 1小时内
            SHORT: 86400,       // 1天
            MEDIUM: 604800,     // 1周
            LONG: 2592000       // 1月
        };

        this.thresholds = {
            minTrades: 10,      // 最小交易次数
            profitThreshold: 0.02,  // 最小获利阈值
            dipThreshold: -0.05,    // 抄底阈值
            swingInterval: 12 * 3600 // 波段交易间隔
        };
    }

    // 分析交易模式
    async analyzeTradePattern(address) {
        try {
            logger.info('Starting trade pattern analysis', { address });

            // 获取历史交易
            const transactions = await WalletAnalysisService._getWalletTransactions(address);
            if (transactions.length < this.thresholds.minTrades) {
                return { type: 'insufficient_data', confidence: 0 };
            }

            // 分析各种模式
            const patterns = await Promise.all([
                this._analyzeSwingPattern(transactions),
                this._analyzeMomentumPattern(transactions),
                this._analyzeScalpingPattern(transactions),
                this._analyzePositionPattern(transactions),
                this._analyzeDipBuyingPattern(transactions),
                this._analyzeArbitragePattern(transactions)
            ]);

            // 找出最显著的模式
            const dominantPattern = this._findDominantPattern(patterns);

            // 分析持仓特征
            const holdingCharacteristics = await this._analyzeHoldingCharacteristics(address);

            // 综合分析结果
            const analysis = {
                primaryPattern: dominantPattern.type,
                confidence: dominantPattern.confidence,
                patterns: patterns.filter(p => p.confidence > 0.3),
                holdingCharacteristics,
                metrics: this._calculateTradeMetrics(transactions),
                timestamp: Date.now()
            };

            logger.info('Trade pattern analysis completed', { address, analysis });
            return analysis;
        } catch (error) {
            logger.error('Error analyzing trade pattern:', error);
            throw error;
        }
    }

    // 分析波段交易模式
    async _analyzeSwingPattern(transactions) {
        let swingCount = 0;
        let totalTrades = 0;

        for (let i = 1; i < transactions.length; i++) {
            const currentTx = transactions[i];
            const prevTx = transactions[i - 1];

            // 检查是否为方向改变的交易
            if (this._isDirectionChange(prevTx, currentTx)) {
                const timeDiff = currentTx.blockTime - prevTx.blockTime;
                if (timeDiff >= this.thresholds.swingInterval) {
                    swingCount++;
                }
            }
            totalTrades++;
        }

        const confidence = swingCount / (totalTrades / 2);
        return {
            type: this.patterns.SWING_TRADE,
            confidence: Math.min(confidence, 1),
            metrics: {
                swingCount,
                totalTrades,
                averageSwingDuration: totalTrades > 0 ? 
                    (transactions[transactions.length - 1].blockTime - transactions[0].blockTime) / swingCount : 0
            }
        };
    }

    // 分析动量交易模式
    async _analyzeMomentumPattern(transactions) {
        let momentumTrades = 0;
        let totalTrades = 0;

        for (const tx of transactions) {
            const priceChange = await this._getPriceChangeBeforeTrade(tx);
            if (Math.abs(priceChange) > 0.03) { // 3% 价格变动阈值
                const tradeDirection = this._getTradeDirection(tx);
                if ((priceChange > 0 && tradeDirection === 'buy') ||
                    (priceChange < 0 && tradeDirection === 'sell')) {
                    momentumTrades++;
                }
            }
            totalTrades++;
        }

        return {
            type: this.patterns.MOMENTUM,
            confidence: momentumTrades / totalTrades,
            metrics: {
                momentumTrades,
                totalTrades,
                successRate: await this._calculateSuccessRate(transactions)
            }
        };
    }

    // 分析短线交易模式
    async _analyzeScalpingPattern(transactions) {
        let scalpTrades = 0;
        let totalTrades = 0;
        let totalDuration = 0;

        for (let i = 1; i < transactions.length; i++) {
            const duration = transactions[i].blockTime - transactions[i-1].blockTime;
            if (duration <= this.timeframes.SCALP) {
                scalpTrades++;
                totalDuration += duration;
            }
            totalTrades++;
        }

        return {
            type: this.patterns.SCALPER,
            confidence: scalpTrades / totalTrades,
            metrics: {
                scalpTrades,
                totalTrades,
                averageDuration: scalpTrades > 0 ? totalDuration / scalpTrades : 0
            }
        };
    }

    // 分析持仓交易模式
    async _analyzePositionPattern(transactions) {
        let longPositions = 0;
        let totalPositions = 0;
        let currentPosition = null;

        for (const tx of transactions) {
            const direction = this._getTradeDirection(tx);
            
            if (direction === 'buy' && !currentPosition) {
                currentPosition = {
                    entryTime: tx.blockTime,
                    entryPrice: await this._getTradePrice(tx)
                };
            } else if (direction === 'sell' && currentPosition) {
                const duration = tx.blockTime - currentPosition.entryTime;
                if (duration >= this.timeframes.MEDIUM) {
                    longPositions++;
                }
                totalPositions++;
                currentPosition = null;
            }
        }

        return {
            type: this.patterns.POSITION,
            confidence: totalPositions > 0 ? longPositions / totalPositions : 0,
            metrics: {
                longPositions,
                totalPositions,
                averageHoldingTime: this._calculateAverageHoldingTime(transactions)
            }
        };
    }

    // 分析抄底模式
    async _analyzeDipBuyingPattern(transactions) {
        let dipBuys = 0;
        let totalBuys = 0;

        for (const tx of transactions) {
            const direction = this._getTradeDirection(tx);
            if (direction === 'buy') {
                const priceChange = await this._getPriceChangeBeforeTrade(tx, 24 * 3600); // 24小时价格变化
                if (priceChange <= this.thresholds.dipThreshold) {
                    dipBuys++;
                }
                totalBuys++;
            }
        }

        return {
            type: this.patterns.DIP_BUYER,
            confidence: totalBuys > 0 ? dipBuys / totalBuys : 0,
            metrics: {
                dipBuys,
                totalBuys,
                successRate: await this._calculateDipBuySuccessRate(transactions)
            }
        };
    }

    // 分析套利模式
    async _analyzeArbitragePattern(transactions) {
        let arbitrageTrades = 0;
        let totalTrades = 0;

        for (let i = 1; i < transactions.length; i++) {
            const tx = transactions[i];
            const prevTx = transactions[i-1];
            
            if (this._isArbitragePair(prevTx, tx)) {
                arbitrageTrades++;
            }
            totalTrades++;
        }

        return {
            type: this.patterns.ARBITRAGE,
            confidence: arbitrageTrades / (totalTrades / 2),
            metrics: {
                arbitrageTrades,
                totalTrades,
                profitRate: await this._calculateArbitrageProfitRate(transactions)
            }
        };
    }

    // 分析持仓特征
    async _analyzeHoldingCharacteristics(address) {
        const holdings = await WalletAnalysisService._getTokenHoldings(address);
        const historicalHoldings = await this._getHistoricalHoldings(address);

        return {
            averageHoldingTime: this._calculateAverageHoldingTime(historicalHoldings),
            holdingDistribution: this._calculateHoldingDistribution(holdings),
            tokenPreferences: await this._analyzeTokenPreferences(historicalHoldings),
            riskProfile: await this._calculateRiskProfile(holdings)
        };
    }

    // 查找主导模式
    _findDominantPattern(patterns) {
        return patterns.reduce((dominant, current) => {
            return current.confidence > dominant.confidence ? current : dominant;
        });
    }

    // 计算交易指标
    _calculateTradeMetrics(transactions) {
        return {
            totalTrades: transactions.length,
            averageSize: this._calculateAverageTradeSize(transactions),
            winRate: this._calculateWinRate(transactions),
            profitFactor: this._calculateProfitFactor(transactions),
            sharpeRatio: this._calculateSharpeRatio(transactions)
        };
    }

    // 辅助方法：计算平均持仓时间
    _calculateAverageHoldingTime(holdings) {
        if (holdings.length === 0) return 0;
        
        const holdingTimes = holdings.map(h => 
            h.exitTime ? h.exitTime - h.entryTime : Date.now() - h.entryTime
        );
        
        return holdingTimes.reduce((a, b) => a + b, 0) / holdingTimes.length;
    }

    // 辅助方法：计算持仓分布
    _calculateHoldingDistribution(holdings) {
        const total = holdings.reduce((sum, h) => sum + h.value, 0);
        return holdings.map(h => ({
            token: h.token,
            percentage: (h.value / total * 100).toFixed(2)
        }));
    }

    // 辅助方法：分析代币偏好
    async _analyzeTokenPreferences(holdings) {
        const tokenCounts = new Map();
        const tokenVolumes = new Map();

        for (const holding of holdings) {
            tokenCounts.set(holding.token, (tokenCounts.get(holding.token) || 0) + 1);
            tokenVolumes.set(holding.token, (tokenVolumes.get(holding.token) || 0) + holding.value);
        }

        return {
            byFrequency: Array.from(tokenCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5),
            byVolume: Array.from(tokenVolumes.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
        };
    }

    // 辅助方法：计算风险概况
    async _calculateRiskProfile(holdings) {
        const riskScores = await Promise.all(
            holdings.map(async h => {
                const volatility = await this._getTokenVolatility(h.token);
                const liquidity = await this._getTokenLiquidity(h.token);
                return {
                    token: h.token,
                    riskScore: this._calculateTokenRiskScore(volatility, liquidity)
                };
            })
        );

        return {
            averageRisk: riskScores.reduce((sum, s) => sum + s.riskScore, 0) / riskScores.length,
            riskDistribution: riskScores
        };
    }
}

module.exports = new TradePatternService(); 