const logger = require('../utils/logger');
const RPCService = require('./RPCService');
const WalletAnalysisService = require('./WalletAnalysisService');
const TokenService = require('./TokenService');

class RiskAnalysisService {
    constructor() {
        // 风险评分权重
        this.weights = {
            liquidity: 0.3,        // 流动性权重
            volatility: 0.2,       // 波动性权重
            concentration: 0.2,     // 持仓集中度权重
            smartMoneyConfidence: 0.3  // 智能钱包信心指数权重
        };

        // 风险阈值配置
        this.thresholds = {
            highRisk: 0.7,         // 高风险阈值
            mediumRisk: 0.4,       // 中等风险阈值
            lowLiquidity: 100000,  // 低流动性阈值（USD）
            highVolatility: 0.1,   // 高波动性阈值（24h）
            highConcentration: 0.1  // 高集中度阈值（单一地址持有比例）
        };

        // 缓存配置
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5分钟缓存
    }

    // 评估代币风险
    async evaluateTokenRisk(tokenAddress) {
        try {
            logger.info(`Starting token risk evaluation for ${tokenAddress}`);

            // 检查缓存
            const cached = this._getFromCache(`token:${tokenAddress}`);
            if (cached) return cached;

            // 获取代币信息
            const tokenInfo = await this._getTokenInfo(tokenAddress);
            if (!tokenInfo) {
                throw new Error('Token info not found');
            }

            // 计算各项风险指标
            const [
                liquidityScore,
                volatilityScore,
                concentrationScore,
                smartMoneyScore
            ] = await Promise.all([
                this._calculateLiquidityScore(tokenAddress),
                this._calculateVolatilityScore(tokenAddress),
                this._calculateConcentrationScore(tokenAddress),
                this._calculateSmartMoneyScore(tokenAddress)
            ]);

            // 计算综合风险评分
            const riskScore = this._calculateWeightedScore({
                liquidity: liquidityScore,
                volatility: volatilityScore,
                concentration: concentrationScore,
                smartMoneyConfidence: smartMoneyScore
            });

            // 生成风险报告
            const riskReport = {
                tokenAddress,
                tokenInfo,
                riskScore,
                riskLevel: this._getRiskLevel(riskScore),
                metrics: {
                    liquidityScore,
                    volatilityScore,
                    concentrationScore,
                    smartMoneyScore
                },
                timestamp: Date.now()
            };

            // 缓存结果
            this._setCache(`token:${tokenAddress}`, riskReport);

            logger.info(`Completed risk evaluation for ${tokenAddress}`, {
                riskScore,
                riskLevel: riskReport.riskLevel
            });

            return riskReport;
        } catch (error) {
            logger.error(`Error evaluating token risk for ${tokenAddress}:`, error);
            throw error;
        }
    }

    // 评估地址风险
    async evaluateAddressRisk(address) {
        try {
            logger.info(`Starting address risk evaluation for ${address}`);

            // 检查缓存
            const cached = this._getFromCache(`address:${address}`);
            if (cached) return cached;

            // 获取地址活动数据
            const [
                transactionHistory,
                holdingTokens,
                smartMoneyScore
            ] = await Promise.all([
                this._getTransactionHistory(address),
                this._getHoldingTokens(address),
                WalletAnalysisService._calculateWalletScore(address)
            ]);

            // 分析交易行为
            const behaviorScore = await this._analyzeTradingBehavior(transactionHistory);
            
            // 分析持仓风险
            const holdingsRisk = await this._analyzeHoldingsRisk(holdingTokens);

            // 生成风险报告
            const riskReport = {
                address,
                riskScore: this._calculateWeightedScore({
                    behavior: behaviorScore,
                    holdings: holdingsRisk,
                    smartMoney: smartMoneyScore
                }),
                metrics: {
                    behaviorScore,
                    holdingsRisk,
                    smartMoneyScore
                },
                details: {
                    transactionCount: transactionHistory.length,
                    uniqueTokens: holdingTokens.length,
                    riskTokens: holdingTokens.filter(t => t.riskLevel === 'HIGH').length
                },
                timestamp: Date.now()
            };

            // 缓存结果
            this._setCache(`address:${address}`, riskReport);

            return riskReport;
        } catch (error) {
            logger.error(`Error evaluating address risk for ${address}:`, error);
            throw error;
        }
    }

    // 计算流动性评分
    async _calculateLiquidityScore(tokenAddress) {
        try {
            const volume24h = await this._get24hVolume(tokenAddress);
            const liquidity = await this._getLiquidity(tokenAddress);
            
            // 根据流动性和交易量计算评分
            const score = Math.min(
                1,
                (volume24h / this.thresholds.lowLiquidity) * 0.5 +
                (liquidity / this.thresholds.lowLiquidity) * 0.5
            );

            return score;
        } catch (error) {
            logger.error('Error calculating liquidity score:', error);
            return 0;
        }
    }

    // 计算波动性评分
    async _calculateVolatilityScore(tokenAddress) {
        try {
            const priceHistory = await this._getPriceHistory(tokenAddress);
            const volatility = this._calculateVolatility(priceHistory);
            
            return Math.min(1, volatility / this.thresholds.highVolatility);
        } catch (error) {
            logger.error('Error calculating volatility score:', error);
            return 1; // 保守估计，返回最高风险
        }
    }

    // 计算持仓集中度评分
    async _calculateConcentrationScore(tokenAddress) {
        try {
            const holders = await this._getTokenHolders(tokenAddress);
            const concentration = this._calculateGiniCoefficient(holders);
            
            return Math.min(1, concentration / this.thresholds.highConcentration);
        } catch (error) {
            logger.error('Error calculating concentration score:', error);
            return 1;
        }
    }

    // 计算智能钱包信心指数
    async _calculateSmartMoneyScore(tokenAddress) {
        try {
            const smartWallets = await WalletAnalysisService.identifySmartWallets();
            const smartHoldings = await this._getSmartWalletHoldings(tokenAddress, smartWallets);
            
            return this._calculateConfidenceScore(smartHoldings);
        } catch (error) {
            logger.error('Error calculating smart money score:', error);
            return 0;
        }
    }

    // 辅助方法：计算加权评分
    _calculateWeightedScore(scores) {
        return Object.entries(scores).reduce((total, [key, value]) => {
            return total + (value * (this.weights[key] || 0));
        }, 0);
    }

    // 辅助方法：获取风险等级
    _getRiskLevel(score) {
        if (score >= this.thresholds.highRisk) return 'HIGH';
        if (score >= this.thresholds.mediumRisk) return 'MEDIUM';
        return 'LOW';
    }

    // 缓存方法
    _getFromCache(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        return null;
    }

    _setCache(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }
}

module.exports = new RiskAnalysisService(); 