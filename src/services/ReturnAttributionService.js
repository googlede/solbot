const logger = require('../utils/logger');
const WalletAnalysisService = require('./WalletAnalysisService');
const TokenService = require('./TokenService');
const RPCService = require('./RPCService');

class ReturnAttributionService {
    constructor() {
        this.config = {
            // 收益分析配置
            attribution: {
                minSampleSize: 30,      // 最小样本数量
                confidenceLevel: 0.95,   // 置信水平
                lookbackPeriods: [       // 回溯周期（秒）
                    3600,      // 1小时
                    86400,     // 1天
                    604800,    // 1周
                    2592000    // 1月
                ]
            },
            // 风险调整参数
            riskAdjustment: {
                riskFreeRate: 0.02,     // 无风险利率（年化）
                marketBeta: 1.0,        // 市场贝塔系数
                volatilityWindow: 30     // 波动率计算窗口（天）
            }
        };
    }

    // 分析收益归因
    async analyzeReturns(address) {
        try {
            logger.info('Starting return attribution analysis', { address });

            // 获取交易历史
            const transactions = await WalletAnalysisService._getWalletTransactions(address);
            if (transactions.length < this.config.attribution.minSampleSize) {
                return { type: 'insufficient_data', confidence: 0 };
            }

            // 计算各个时间周期的收益
            const periodReturns = await this._calculatePeriodReturns(transactions);

            // 计算风险调整收益
            const riskAdjustedReturns = await this._calculateRiskAdjustedReturns(periodReturns);

            // 分解收益来源
            const returnComponents = await this._decomposeReturns(transactions);

            // 生成归因报告
            const report = {
                periodReturns,
                riskAdjustedReturns,
                returnComponents,
                metrics: await this._calculatePerformanceMetrics(transactions),
                timestamp: Date.now()
            };

            logger.info('Return attribution analysis completed', { address, report });
            return report;
        } catch (error) {
            logger.error('Error analyzing returns:', error);
            throw error;
        }
    }

    // 计算各期收益率
    async _calculatePeriodReturns(transactions) {
        const returns = {};
        
        for (const period of this.config.attribution.lookbackPeriods) {
            returns[period] = await this._calculateReturnForPeriod(transactions, period);
        }

        return returns;
    }

    // 计算特定期间收益率
    async _calculateReturnForPeriod(transactions, period) {
        const now = Date.now() / 1000;
        const periodStart = now - period;
        
        const periodTx = transactions.filter(tx => tx.blockTime >= periodStart);
        
        let totalValue = 0;
        let initialValue = 0;

        for (const tx of periodTx) {
            const value = await this._calculateTransactionValue(tx);
            totalValue += value;
            
            if (tx.blockTime === periodTx[0].blockTime) {
                initialValue = await this._getPortfolioValue(tx.blockTime);
            }
        }

        return {
            absoluteReturn: totalValue,
            percentageReturn: initialValue > 0 ? totalValue / initialValue - 1 : 0,
            transactions: periodTx.length
        };
    }

    // 计算风险调整收益
    async _calculateRiskAdjustedReturns(periodReturns) {
        const riskAdjusted = {};
        
        for (const [period, returns] of Object.entries(periodReturns)) {
            // 计算夏普比率
            const sharpeRatio = this._calculateSharpeRatio(returns.percentageReturn, period);
            
            // 计算索提诺比率
            const sortino = this._calculateSortinoRatio(returns.percentageReturn, period);
            
            // 计算信息比率
            const informationRatio = await this._calculateInformationRatio(returns.percentageReturn, period);
            
            riskAdjusted[period] = {
                sharpeRatio,
                sortino,
                informationRatio,
                riskAdjustedReturn: returns.percentageReturn * (1 - this._calculateRiskPenalty(sharpeRatio))
            };
        }

        return riskAdjusted;
    }

    // 分解收益来源
    async _decomposeReturns(transactions) {
        const components = {
            marketTiming: 0,    // 市场择时贡献
            tokenSelection: 0,   // 代币选择贡献
            tradingSkill: 0,    // 交易技巧贡献
            tokenReturns: new Map()  // 各代币贡献
        };

        for (const tx of transactions) {
            const transfers = await WalletAnalysisService._extractTokenTransfers(tx);
            
            for (const transfer of transfers) {
                // 计算市场择时贡献
                const marketTiming = await this._calculateMarketTimingContribution(transfer, tx.blockTime);
                components.marketTiming += marketTiming;

                // 计算代币选择贡献
                const tokenSelection = await this._calculateTokenSelectionContribution(transfer);
                components.tokenSelection += tokenSelection;

                // 更新代币贡献
                const tokenReturn = await this._calculateTokenReturn(transfer);
                const currentReturn = components.tokenReturns.get(transfer.mint) || 0;
                components.tokenReturns.set(transfer.mint, currentReturn + tokenReturn);
            }

            // 计算交易技巧贡献
            const tradingSkill = await this._calculateTradingSkillContribution(tx);
            components.tradingSkill += tradingSkill;
        }

        // 转换为百分比
        const total = components.marketTiming + components.tokenSelection + components.tradingSkill;
        return {
            marketTiming: components.marketTiming / total,
            tokenSelection: components.tokenSelection / total,
            tradingSkill: components.tradingSkill / total,
            tokenContributions: Array.from(components.tokenReturns.entries())
                .map(([token, return_]) => ({
                    token,
                    contribution: return_ / total
                }))
                .sort((a, b) => b.contribution - a.contribution)
        };
    }

    // 计算市场择时贡献
    async _calculateMarketTimingContribution(transfer, timestamp) {
        try {
            // 获取市场趋势
            const marketTrend = await this._getMarketTrend(timestamp);
            
            // 获取交易方向
            const direction = transfer.type === 'in' ? 1 : -1;
            
            // 计算择时得分
            return direction * marketTrend;
        } catch (error) {
            logger.error('Error calculating market timing contribution:', error);
            return 0;
        }
    }

    // 计算代币选择贡献
    async _calculateTokenSelectionContribution(transfer) {
        try {
            // 获取代币相对市场表现
            const tokenPerformance = await this._getTokenPerformance(transfer.mint);
            
            // 获取持仓权重
            const weight = await this._getPositionWeight(transfer);
            
            return tokenPerformance * weight;
        } catch (error) {
            logger.error('Error calculating token selection contribution:', error);
            return 0;
        }
    }

    // 计算交易技巧贡献
    async _calculateTradingSkillContribution(transaction) {
        try {
            // 计算交易效率
            const efficiency = await this._calculateTradeEfficiency(transaction);
            
            // 计算时机选择
            const timing = await this._calculateTimingScore(transaction);
            
            // 计算执行质量
            const execution = await this._calculateExecutionQuality(transaction);
            
            return (efficiency + timing + execution) / 3;
        } catch (error) {
            logger.error('Error calculating trading skill contribution:', error);
            return 0;
        }
    }

    // 计算性能指标
    async _calculatePerformanceMetrics(transactions) {
        return {
            totalReturn: await this._calculateTotalReturn(transactions),
            annualizedReturn: await this._calculateAnnualizedReturn(transactions),
            volatility: await this._calculateVolatility(transactions),
            maxDrawdown: await this._calculateMaxDrawdown(transactions),
            winRate: await this._calculateWinRate(transactions),
            profitFactor: await this._calculateProfitFactor(transactions),
            recoveryFactor: await this._calculateRecoveryFactor(transactions)
        };
    }

    // 计算夏普比率
    _calculateSharpeRatio(return_, period) {
        const riskFreeRate = this.config.riskAdjustment.riskFreeRate * (period / 31536000); // 转换为对应期间
        const excessReturn = return_ - riskFreeRate;
        const volatility = this._calculateVolatilityForPeriod(period);
        
        return volatility > 0 ? excessReturn / volatility : 0;
    }

    // 计算索提诺比率
    _calculateSortinoRatio(return_, period) {
        const riskFreeRate = this.config.riskAdjustment.riskFreeRate * (period / 31536000);
        const excessReturn = return_ - riskFreeRate;
        const downside = this._calculateDownsideDeviation(period);
        
        return downside > 0 ? excessReturn / downside : 0;
    }

    // 计算信息比率
    async _calculateInformationRatio(return_, period) {
        const benchmark = await this._getBenchmarkReturn(period);
        const trackingError = await this._calculateTrackingError(return_, benchmark, period);
        
        return trackingError > 0 ? (return_ - benchmark) / trackingError : 0;
    }

    // 计算风险惩罚
    _calculateRiskPenalty(sharpeRatio) {
        // 基于夏普比率的非线性风险惩罚
        return Math.max(0, Math.min(1, Math.exp(-sharpeRatio)));
    }
}

module.exports = new ReturnAttributionService(); 