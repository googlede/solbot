const logger = require('../utils/logger');
const axios = require('axios');
const WalletAnalysisService = require('./WalletAnalysisService');
const MarketSentimentService = require('./MarketSentimentService');

class PriceImpactService {
    constructor() {
        this.impactThresholds = {
            negligible: 0.001,  // 0.1%
            low: 0.005,         // 0.5%
            medium: 0.02,       // 2%
            high: 0.05          // 5%
        };

        this.historicalImpacts = new Map(); // 存储历史影响数据
        this.predictionModels = new Map();  // 存储每个代币的预测模型
    }

    // 预测价格影响
    async predictPriceImpact(transaction) {
        try {
            logger.info('Starting price impact prediction');

            // 获取交易详情
            const transfers = await WalletAnalysisService._extractTokenTransfers(transaction);
            const predictions = [];

            for (const transfer of transfers) {
                // 获取市场数据
                const marketData = await this._getMarketData(transfer.mint);
                
                // 获取历史影响
                const historicalImpact = await this._getHistoricalImpact(transfer.mint);
                
                // 获取市场情绪
                const sentiment = await MarketSentimentService.getSentimentSummary();

                // 计算预测影响
                const prediction = await this._calculatePredictedImpact(
                    transfer,
                    marketData,
                    historicalImpact,
                    sentiment
                );

                predictions.push({
                    token: transfer.mint,
                    amount: transfer.amount,
                    predictedImpact: prediction.impact,
                    confidence: prediction.confidence,
                    factors: prediction.factors
                });
            }

            return {
                predictions,
                aggregateImpact: this._calculateAggregateImpact(predictions)
            };

        } catch (error) {
            logger.error('Error predicting price impact:', error);
            throw error;
        }
    }

    // 获取市场数据
    async _getMarketData(token) {
        try {
            const [orderbook, liquidity, volume] = await Promise.all([
                this._getOrderbook(token),
                this._getLiquidity(token),
                this._get24hVolume(token)
            ]);

            return {
                orderbook,
                liquidity,
                volume,
                marketDepth: this._calculateMarketDepth(orderbook)
            };
        } catch (error) {
            logger.error('Error getting market data:', error);
            throw error;
        }
    }

    // 获取历史影响数据
    async _getHistoricalImpact(token) {
        if (!this.historicalImpacts.has(token)) {
            const impacts = await this._fetchHistoricalImpacts(token);
            this.historicalImpacts.set(token, impacts);
        }
        return this.historicalImpacts.get(token);
    }

    // 计算预测影响
    async _calculatePredictedImpact(transfer, marketData, historicalImpact, sentiment) {
        // 基础影响计算
        const baseImpact = this._calculateBaseImpact(transfer.amount, marketData);
        
        // 市场情绪调整
        const sentimentAdjustment = this._calculateSentimentAdjustment(sentiment);
        
        // 历史模式调整
        const historicalAdjustment = this._calculateHistoricalAdjustment(historicalImpact);
        
        // 流动性调整
        const liquidityAdjustment = this._calculateLiquidityAdjustment(marketData.liquidity);

        // 综合计算
        const impact = baseImpact * (1 + sentimentAdjustment) * 
                      (1 + historicalAdjustment) * (1 + liquidityAdjustment);

        // 计算置信度
        const confidence = this._calculateConfidence(
            marketData,
            historicalImpact,
            sentiment
        );

        return {
            impact,
            confidence,
            factors: {
                baseImpact,
                sentimentAdjustment,
                historicalAdjustment,
                liquidityAdjustment
            }
        };
    }

    // 计算基础影响
    _calculateBaseImpact(amount, marketData) {
        const { orderbook, volume } = marketData;
        const relativeSize = amount / volume;
        
        // 使用订单簿深度计算价格影响
        let impact = 0;
        let remainingAmount = amount;
        
        for (const level of orderbook) {
            if (remainingAmount <= 0) break;
            
            const levelAmount = Math.min(remainingAmount, level.amount);
            impact += (levelAmount / amount) * level.price;
            remainingAmount -= levelAmount;
        }

        // 应用非线性调整
        return impact * Math.pow(1 + relativeSize, 1.5);
    }

    // 计算情绪调整
    _calculateSentimentAdjustment(sentiment) {
        // 市场情绪越乐观，价格影响越大
        return sentiment.current * 0.2;
    }

    // 计算历史调整
    _calculateHistoricalAdjustment(historicalImpact) {
        if (!historicalImpact.length) return 0;
        
        // 计算历史影响的加权平均
        const weights = historicalImpact.map((_, i) => 
            Math.exp(-i / historicalImpact.length)
        );
        
        const weightedSum = historicalImpact.reduce((sum, impact, i) => 
            sum + impact * weights[i], 0
        );
        
        return weightedSum / weights.reduce((a, b) => a + b);
    }

    // 计算流动性调整
    _calculateLiquidityAdjustment(liquidity) {
        // 流动性越低，价格影响越大
        return Math.exp(-liquidity / 1000000) - 1;
    }

    // 计算置信度
    _calculateConfidence(marketData, historicalImpact, sentiment) {
        const factors = {
            dataQuality: this._assessDataQuality(marketData),
            historicalReliability: this._assessHistoricalReliability(historicalImpact),
            marketConditions: this._assessMarketConditions(sentiment)
        };

        return Object.values(factors).reduce((a, b) => a + b) / Object.keys(factors).length;
    }

    // 评估数据质量
    _assessDataQuality(marketData) {
        const { orderbook, liquidity, volume } = marketData;
        
        // 检查数据完整性和质量
        const hasFullOrderbook = orderbook.length >= 10;
        const hasRecentVolume = volume > 0;
        const hasAdequateLiquidity = liquidity > 10000;

        return (hasFullOrderbook + hasRecentVolume + hasAdequateLiquidity) / 3;
    }

    // 评估历史可靠性
    _assessHistoricalReliability(historicalImpact) {
        if (!historicalImpact.length) return 0;

        // 计算历史数据的一致性
        const variance = this._calculateVariance(historicalImpact);
        return Math.exp(-variance);
    }

    // 评估市场条件
    _assessMarketConditions(sentiment) {
        // 市场情绪越极端，预测越不确定
        return 1 - Math.abs(sentiment.current);
    }

    // 计算聚合影响
    _calculateAggregateImpact(predictions) {
        // 加权平均各个预测的影响
        const totalConfidence = predictions.reduce((sum, p) => sum + p.confidence, 0);
        
        return predictions.reduce((sum, p) => 
            sum + (p.predictedImpact * p.confidence / totalConfidence), 0
        );
    }

    // 辅助方法：计算方差
    _calculateVariance(values) {
        const mean = values.reduce((a, b) => a + b) / values.length;
        return values.reduce((sum, value) => 
            sum + Math.pow(value - mean, 2), 0
        ) / values.length;
    }
}

module.exports = new PriceImpactService(); 