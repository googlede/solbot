const logger = require('../utils/logger');
const WalletAnalysisService = require('./WalletAnalysisService');
const MarketSentimentService = require('./MarketSentimentService');
const TokenService = require('./TokenService');
const NotificationService = require('./NotificationService');

class AnomalyDetectionService {
    constructor() {
        // 异常检测配置
        this.config = {
            // 价格异常阈值
            price: {
                volatility: 0.1,     // 10% 波动率阈值
                deviation: 2.5,      // 2.5 标准差
                timeWindow: 360000  // 1小时时间窗口
            },
            // 交易异常阈值
            volume: {
                spike: 5,            // 5倍于平均值
                drop: 0.2,          // 低于平均值的 20%
                window: 300000      // 5分钟窗口
            },
            // 钱包行为异常
            wallet: {
                suddenSell: 0.5,    // 突然抛售 50% 持仓
                largeAccumulation: 0.3,  // 快速积累 30% 供应量
                activeThreshold: 10  // 10 笔以上交易定义为活跃
            },
            // 更新间隔
            updateInterval: 60000    // 1分钟
        };

        // 存储历史数据
        this.priceHistory = new Map();
        this.volumeHistory = new Map();
        this.walletActivity = new Map();
        
        // 异常记录
        this.detectedAnomalies = new Map();
        
        // 启动监控
        this._startMonitoring();
    }

    // 启动异常监控
    async _startMonitoring() {
        setInterval(async () => {
            try {
                await this.detectAnomalies();
            } catch (error) {
                logger.error('Error in anomaly detection:', error);
            }
        }, this.config.updateInterval);
    }

    // 检测异常
    async detectAnomalies() {
        try {
            logger.info('Starting anomaly detection');

            // 获取市场数据
            const tokens = await TokenService.getTop100Tokens();
            const sentiment = await MarketSentimentService.getSentimentSummary();
            
            // 并行检测不同类型的异常
            const [
                priceAnomalies,
                volumeAnomalies,
                walletAnomalies
            ] = await Promise.all([
                this._detectPriceAnomalies(tokens),
                this._detectVolumeAnomalies(tokens),
                this._detectWalletAnomalies()
            ]);

            // 综合分析异常
            const anomalies = this._analyzeAnomalies({
                price: priceAnomalies,
                volume: volumeAnomalies,
                wallet: walletAnomalies,
                sentiment
            });

            // 更新异常记录
            this._updateAnomalyRecords(anomalies);

            // 发送警报
            await this._sendAlerts(anomalies);

            logger.info('Anomaly detection completed', {
                priceAnomalies: priceAnomalies.length,
                volumeAnomalies: volumeAnomalies.length,
                walletAnomalies: walletAnomalies.length
            });

            return anomalies;
        } catch (error) {
            logger.error('Error detecting anomalies:', error);
            throw error;
        }
    }

    // 检测价格异常
    async _detectPriceAnomalies(tokens) {
        const anomalies = [];
        
        for (const token of tokens) {
            try {
                // 获取价格历史
                const priceHistory = await this._getPriceHistory(token.address);
                this._updatePriceHistory(token.address, token.price);

                // 计算统计指标
                const stats = this._calculatePriceStats(priceHistory);
                
                // 检测异常
                if (this._isPriceAnomaly(token.price, stats)) {
                    anomalies.push({
                        type: 'PRICE',
                        token: token.address,
                        currentPrice: token.price,
                        stats,
                        severity: this._calculatePriceAnomalySeverity(token.price, stats),
                        timestamp: Date.now()
                    });
                }
            } catch (error) {
                logger.error(`Error detecting price anomaly for ${token.address}:`, error);
            }
        }

        return anomalies;
    }

    // 检测交易量异常
    async _detectVolumeAnomalies(tokens) {
        const anomalies = [];
        
        for (const token of tokens) {
            try {
                // 获取交易量历史
                const volumeHistory = await this._getVolumeHistory(token.address);
                this._updateVolumeHistory(token.address, token.volume24h);

                // 计算统计指标
                const stats = this._calculateVolumeStats(volumeHistory);
                
                // 检测异常
                if (this._isVolumeAnomaly(token.volume24h, stats)) {
                    anomalies.push({
                        type: 'VOLUME',
                        token: token.address,
                        currentVolume: token.volume24h,
                        stats,
                        severity: this._calculateVolumeAnomalySeverity(token.volume24h, stats),
                        timestamp: Date.now()
                    });
                }
            } catch (error) {
                logger.error(`Error detecting volume anomaly for ${token.address}:`, error);
            }
        }

        return anomalies;
    }

    // 检测钱包异常
    async _detectWalletAnomalies() {
        try {
            // 获取智能钱包
            const smartWallets = await WalletAnalysisService.identifySmartWallets();
            const anomalies = [];

            for (const wallet of smartWallets) {
                // 获取最近活动
                const recentActivity = await this._getRecentWalletActivity(wallet.address);
                this._updateWalletActivity(wallet.address, recentActivity);

                // 分析行为模式
                const pattern = this._analyzeWalletPattern(recentActivity);
                
                // 检测异常
                if (this._isWalletBehaviorAnomaly(pattern)) {
                    anomalies.push({
                        type: 'WALLET',
                        wallet: wallet.address,
                        pattern,
                        severity: this._calculateWalletAnomalySeverity(pattern),
                        timestamp: Date.now()
                    });
                }
            }

            return anomalies;
        } catch (error) {
            logger.error('Error detecting wallet anomalies:', error);
            return [];
        }
    }

    // 分析异常
    _analyzeAnomalies({ price, volume, wallet, sentiment }) {
        const allAnomalies = [...price, ...volume, ...wallet];
        
        // 按严重程度排序
        allAnomalies.sort((a, b) => b.severity - a.severity);

        // 考虑市场情绪
        const sentimentAdjustedAnomalies = allAnomalies.map(anomaly => ({
            ...anomaly,
            adjustedSeverity: this._adjustSeverityBySentiment(
                anomaly.severity,
                sentiment.current
            )
        }));

        // 识别相关异常
        return this._groupRelatedAnomalies(sentimentAdjustedAnomalies);
    }

    // 更新异常记录
    _updateAnomalyRecords(anomalies) {
        const now = Date.now();
        
        // 清理旧记录
        for (const [key, record] of this.detectedAnomalies.entries()) {
            if (now - record.timestamp > 24 * 60 * 60 * 1000) { // 24小时后过期
                this.detectedAnomalies.delete(key);
            }
        }

        // 添加新记录
        for (const anomaly of anomalies) {
            const key = this._getAnomalyKey(anomaly);
            this.detectedAnomalies.set(key, {
                ...anomaly,
                detectedAt: now
            });
        }
    }

    // 发送警报
    async _sendAlerts(anomalies) {
        for (const anomaly of anomalies) {
            if (anomaly.adjustedSeverity >= 0.7) { // 高严重度阈值
                await NotificationService.sendRiskAlert({
                    type: 'MARKET_ANOMALY',
                    level: 'CRITICAL',
                    details: anomaly
                });
            }
        }
    }

    // 辅助方法：计算价格统计指标
    _calculatePriceStats(history) {
        const prices = Array.from(history.values());
        return {
            mean: this._calculateMean(prices),
            stdDev: this._calculateStdDev(prices),
            volatility: this._calculateVolatility(prices)
        };
    }

    // 辅助方法：判断价格异常
    _isPriceAnomaly(price, stats) {
        const zScore = Math.abs((price - stats.mean) / stats.stdDev);
        return zScore > this.config.price.deviation || 
               stats.volatility > this.config.price.volatility;
    }

    // 辅助方法：计算均值
    _calculateMean(values) {
        return values.reduce((sum, val) => sum + val, 0) / values.length;
    }

    // 辅助方法：计算标准差
    _calculateStdDev(values) {
        const mean = this._calculateMean(values);
        const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
        return Math.sqrt(this._calculateMean(squaredDiffs));
    }

    // 辅助方法：计算波动率
    _calculateVolatility(values) {
        if (values.length < 2) return 0;
        const returns = [];
        for (let i = 1; i < values.length; i++) {
            returns.push((values[i] - values[i-1]) / values[i-1]);
        }
        return this._calculateStdDev(returns);
    }

    // 获取异常记录
    getAnomalyHistory(options = {}) {
        const { type, minSeverity = 0, limit = 100 } = options;
        
        let anomalies = Array.from(this.detectedAnomalies.values());
        
        if (type) {
            anomalies = anomalies.filter(a => a.type === type);
        }
        
        return anomalies
            .filter(a => a.adjustedSeverity >= minSeverity)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }

    // 检测市场操纵行为
    async _detectMarketManipulation(token) {
        try {
            // 获取最近交易
            const recentTrades = await this._getRecentTrades(token);
            
            // 检测洗盘行为
            const washTradingScore = this._detectWashTrading(recentTrades);
            
            // 检测价格操纵
            const priceManipulationScore = await this._detectPriceManipulation(token, recentTrades);
            
            // 检测大户操纵
            const whaleManipulationScore = await this._detectWhaleManipulation(token);

            return {
                washTradingScore,
                priceManipulationScore,
                whaleManipulationScore,
                isManipulated: (washTradingScore + priceManipulationScore + whaleManipulationScore) / 3 > 0.7
            };
        } catch (error) {
            logger.error('Error detecting market manipulation:', error);
            return null;
        }
    }

    // 检测闪崩风险
    async _detectFlashCrashRisk(token) {
        try {
            // 获取订单簿深度
            const orderBookDepth = await this._getOrderBookDepth(token);
            
            // 分析买卖压力
            const pressureAnalysis = this._analyzeBuySellPressure(orderBookDepth);
            
            // 检查流动性状况
            const liquidityStatus = await this._checkLiquidityStatus(token);

            return {
                orderBookImbalance: pressureAnalysis.imbalance,
                liquidityRisk: liquidityStatus.risk,
                flashCrashProbability: this._calculateFlashCrashProbability(
                    pressureAnalysis,
                    liquidityStatus
                )
            };
        } catch (error) {
            logger.error('Error detecting flash crash risk:', error);
            return null;
        }
    }

    // 检测异常交易模式
    async _detectAbnormalTradingPatterns(token) {
        try {
            const patterns = {
                volumeSpikes: await this._detectVolumeSpikes(token),
                priceManipulation: await this._detectPriceManipulation(token),
                coordinatedTrading: await this._detectCoordinatedTrading(token),
                frontRunning: await this._detectFrontRunning(token)
            };

            return {
                ...patterns,
                riskLevel: this._calculatePatternRiskLevel(patterns)
            };
        } catch (error) {
            logger.error('Error detecting abnormal trading patterns:', error);
            return null;
        }
    }

    // 检测洗盘行为
    _detectWashTrading(trades) {
        let washTradingScore = 0;
        const addressFrequency = new Map();
        
        // 分析交易地址频率
        trades.forEach(trade => {
            addressFrequency.set(trade.buyer, (addressFrequency.get(trade.buyer) || 0) + 1);
            addressFrequency.set(trade.seller, (addressFrequency.get(trade.seller) || 0) + 1);
        });

        // 检测循环交易
        const cyclicTrades = this._detectCyclicTrades(trades);
        
        // 检测自交易
        const selfTrades = trades.filter(t => t.buyer === t.seller).length;

        // 计算综合评分
        washTradingScore = (cyclicTrades * 0.6 + (selfTrades / trades.length) * 0.4);
        
        return Math.min(washTradingScore, 1);
    }

    // 检测价格操纵
    async _detectPriceManipulation(token, trades) {
        // 获取历史价格数据
        const priceHistory = await this._getPriceHistory(token);
        
        // 计算价格波动
        const volatility = this._calculateVolatility(priceHistory);
        
        // 检测突然的价格变动
        const suddenMoves = this._detectSuddenPriceMoves(priceHistory);
        
        // 检测价格趋势操纵
        const trendManipulation = this._detectTrendManipulation(priceHistory);

        return {
            volatility,
            suddenMoves,
            trendManipulation,
            manipulationScore: (volatility + suddenMoves + trendManipulation) / 3
        };
    }

    // 检测大户操纵
    async _detectWhaleManipulation(token) {
        // 获取大户持仓数据
        const whaleHoldings = await this._getWhaleHoldings(token);
        
        // 分析持仓集中度
        const concentration = this._calculateHoldingConcentration(whaleHoldings);
        
        // 分析大户交易行为
        const whaleTrades = await this._analyzeWhaleTrades(token);

        return {
            concentration,
            tradingPattern: whaleTrades.pattern,
            manipulationRisk: this._calculateWhaleManipulationRisk(concentration, whaleTrades)
        };
    }

    // 计算闪崩概率
    _calculateFlashCrashProbability(pressureAnalysis, liquidityStatus) {
        const weights = {
            orderBookImbalance: 0.4,
            liquidityRisk: 0.3,
            marketDepth: 0.3
        };

        return (
            pressureAnalysis.imbalance * weights.orderBookImbalance +
            liquidityStatus.risk * weights.liquidityRisk +
            (1 - liquidityStatus.depth) * weights.marketDepth
        );
    }

    // 分析买卖压力
    _analyzeBuySellPressure(orderBook) {
        const buyPressure = this._calculateBuyPressure(orderBook.bids);
        const sellPressure = this._calculateSellPressure(orderBook.asks);
        
        return {
            buyPressure,
            sellPressure,
            imbalance: Math.abs(buyPressure - sellPressure) / (buyPressure + sellPressure)
        };
    }

    // 检测前后交易
    async _detectFrontRunning(token) {
        const mempool = await this._getRecentMempool();
        const pendingTxs = mempool.filter(tx => tx.token === token);
        
        let frontRunningScore = 0;
        for (const tx of pendingTxs) {
            // 检查是否有相关的高gas交易紧随其后
            const relatedTxs = this._findRelatedTransactions(tx, mempool);
            if (relatedTxs.length > 0) {
                frontRunningScore += this._calculateFrontRunningProbability(tx, relatedTxs);
            }
        }

        return {
            score: frontRunningScore / pendingTxs.length,
            suspiciousTransactions: this._identifySuspiciousFrontRunning(pendingTxs)
        };
    }
}

module.exports = new AnomalyDetectionService(); 