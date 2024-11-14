const logger = require('../utils/logger');
const WalletAnalysisService = require('./WalletAnalysisService');
const RPCService = require('./RPCService');

class CounterpartyAnalysisService {
    constructor() {
        this.minInteractionCount = 3;  // 最小交互次数阈值
        this.analysisWindow = 30 * 24 * 60 * 60 * 1000; // 分析窗口（30天）
    }

    // 分析交易对手
    async analyzeCounterparties(address) {
        try {
            logger.info('Starting counterparty analysis', { address });

            // 获取历史交易
            const transactions = await WalletAnalysisService._getWalletTransactions(address);
            
            // 提取交易对手
            const counterparties = await this._extractCounterparties(transactions, address);
            
            // 分析交易对手关系
            const relationships = await this._analyzeRelationships(counterparties, address);
            
            // 计算影响力指标
            const influenceMetrics = await this._calculateInfluenceMetrics(address, relationships);

            const analysis = {
                relationships,
                influenceMetrics,
                summary: this._generateSummary(relationships, influenceMetrics)
            };

            logger.info('Counterparty analysis completed', { address, analysis });
            return analysis;
        } catch (error) {
            logger.error('Error analyzing counterparties:', error);
            throw error;
        }
    }

    // 提取交易对手
    async _extractCounterparties(transactions, address) {
        const counterparties = new Map();

        for (const tx of transactions) {
            const transfers = await WalletAnalysisService._extractTokenTransfers(tx);
            
            for (const transfer of transfers) {
                let counterparty;
                if (transfer.source === address) {
                    counterparty = transfer.destination;
                } else if (transfer.destination === address) {
                    counterparty = transfer.source;
                }

                if (counterparty) {
                    if (!counterparties.has(counterparty)) {
                        counterparties.set(counterparty, {
                            interactions: 0,
                            volume: 0,
                            firstInteraction: tx.blockTime,
                            lastInteraction: tx.blockTime,
                            transfers: []
                        });
                    }

                    const data = counterparties.get(counterparty);
                    data.interactions++;
                    data.volume += transfer.amount * await WalletAnalysisService._getTokenPrice(transfer.mint);
                    data.lastInteraction = tx.blockTime;
                    data.transfers.push({
                        time: tx.blockTime,
                        type: transfer.source === address ? 'out' : 'in',
                        token: transfer.mint,
                        amount: transfer.amount
                    });
                }
            }
        }

        return counterparties;
    }

    // 分析交易对手关系
    async _analyzeRelationships(counterparties, address) {
        const relationships = [];

        for (const [counterparty, data] of counterparties.entries()) {
            if (data.interactions >= this.minInteractionCount) {
                // 获取交易对手的智能钱包评分
                const score = await WalletAnalysisService._calculateWalletScore(counterparty);
                
                // 分析交易模式
                const pattern = this._analyzeInteractionPattern(data.transfers);
                
                // 计算关系强度
                const strength = this._calculateRelationshipStrength(data);

                relationships.push({
                    address: counterparty,
                    score,
                    interactions: data.interactions,
                    volume: data.volume,
                    pattern,
                    strength,
                    firstInteraction: data.firstInteraction,
                    lastInteraction: data.lastInteraction
                });
            }
        }

        return relationships.sort((a, b) => b.strength - a.strength);
    }

    // 分析交互模式
    _analyzeInteractionPattern(transfers) {
        const pattern = {
            inbound: 0,
            outbound: 0,
            avgSize: 0,
            timeDistribution: new Array(24).fill(0),
            tokenPreference: new Map()
        };

        transfers.forEach(transfer => {
            // 统计方向
            if (transfer.type === 'in') pattern.inbound++;
            else pattern.outbound++;

            // 统计时间分布
            const hour = new Date(transfer.time * 1000).getHours();
            pattern.timeDistribution[hour]++;

            // 统计代币偏好
            const count = pattern.tokenPreference.get(transfer.token) || 0;
            pattern.tokenPreference.set(transfer.token, count + 1);
        });

        // 计算平均交易规模
        pattern.avgSize = transfers.reduce((sum, t) => sum + t.amount, 0) / transfers.length;

        return pattern;
    }

    // 计算关系强度
    _calculateRelationshipStrength(data) {
        const recency = (Date.now() / 1000 - data.lastInteraction) / (30 * 24 * 60 * 60); // 归一化到30天
        const frequency = data.interactions / 30; // 平均每天交互次数
        const volumeScore = Math.min(data.volume / 1000000, 1); // 归一化交易量，上限100万

        return (
            0.4 * Math.exp(-recency) +  // 最近性权重
            0.3 * Math.min(frequency, 1) + // 频率权重
            0.3 * volumeScore  // 交易量权重
        );
    }

    // 计算影响力指标
    async _calculateInfluenceMetrics(address, relationships) {
        return {
            networkSize: relationships.length,
            avgCounterpartyScore: this._calculateAverageScore(relationships),
            volumeConcentration: this._calculateVolumeConcentration(relationships),
            marketImpact: await this._calculateMarketImpact(address),
            centralityScore: this._calculateCentralityScore(relationships)
        };
    }

    // 计算平均分数
    _calculateAverageScore(relationships) {
        if (relationships.length === 0) return 0;
        return relationships.reduce((sum, r) => sum + r.score, 0) / relationships.length;
    }

    // 计算交易量集中度
    _calculateVolumeConcentration(relationships) {
        const totalVolume = relationships.reduce((sum, r) => sum + r.volume, 0);
        if (totalVolume === 0) return 0;

        return relationships.reduce((sum, r) => {
            const share = r.volume / totalVolume;
            return sum + share * share;
        }, 0);
    }

    // 计算市场影响力
    async _calculateMarketImpact(address) {
        try {
            const transactions = await WalletAnalysisService._getWalletTransactions(address);
            let totalImpact = 0;
            let impactCount = 0;

            for (const tx of transactions) {
                const impact = await this._calculateTransactionImpact(tx);
                if (impact !== null) {
                    totalImpact += impact;
                    impactCount++;
                }
            }

            return impactCount > 0 ? totalImpact / impactCount : 0;
        } catch (error) {
            logger.error('Error calculating market impact:', error);
            return 0;
        }
    }

    // 计算单笔交易的市场影响
    async _calculateTransactionImpact(transaction) {
        try {
            const transfers = await WalletAnalysisService._extractTokenTransfers(transaction);
            if (transfers.length === 0) return null;

            let maxImpact = 0;
            for (const transfer of transfers) {
                const preBefore = await this._getPreTransactionPrice(transfer.mint, transaction.blockTime);
                const preAfter = await this._getPostTransactionPrice(transfer.mint, transaction.blockTime);
                
                if (preBefore && preAfter) {
                    const impact = Math.abs(preAfter - preBefore) / preBefore;
                    maxImpact = Math.max(maxImpact, impact);
                }
            }

            return maxImpact;
        } catch (error) {
            logger.error('Error calculating transaction impact:', error);
            return null;
        }
    }

    // 生成分析摘要
    _generateSummary(relationships, influenceMetrics) {
        return {
            totalCounterparties: relationships.length,
            highValueRelationships: relationships.filter(r => r.strength > 0.7).length,
            avgInteractionFrequency: relationships.reduce((sum, r) => sum + r.interactions, 0) / relationships.length,
            networkInfluence: this._calculateNetworkInfluence(influenceMetrics),
            riskLevel: this._assessRiskLevel(relationships, influenceMetrics)
        };
    }
}

module.exports = new CounterpartyAnalysisService(); 