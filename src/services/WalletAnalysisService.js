const { Connection, PublicKey } = require('@solana/web3.js');
const logger = require('../utils/logger');
const RPCService = require('./RPCService');
const axios = require('axios');

class WalletAnalysisService {
    constructor() {
        this.minTransactionAmount = 10000; // 最小交易金额（USD）
        this.minWalletBalance = 100000;    // 最小钱包余额（USD）
        this.profitThreshold = 0.2;        // 盈利阈值（20%）
        this.analysisWindow = 7 * 24 * 60 * 60 * 1000; // 分析窗口（7天）
    }

    // 识别智能钱包
    async identifySmartWallets() {
        try {
            logger.info('Starting smart wallet identification');
            
            // 1. 获取大额交易
            const largeTransactions = await this._getLargeTransactions();
            logger.info(`Found ${largeTransactions.length} large transactions`);

            // 2. 分析交易地址
            const walletScores = await this._analyzeWallets(largeTransactions);
            
            // 3. 筛选高分钱包
            const smartWallets = this._filterSmartWallets(walletScores);
            
            logger.info(`Identified ${smartWallets.length} smart wallets`);
            return smartWallets;
        } catch (error) {
            logger.error('Error in identifySmartWallets:', error);
            throw error;
        }
    }

    // 获取大额交易
    async _getLargeTransactions() {
        try {
            // 获取最新区块
            const slot = await RPCService.executeRequest('getSlot');
            const block = await RPCService.executeRequest('getBlock', slot);

            // 过滤大额交易
            const largeTransactions = block.transactions.filter(tx => {
                // 实现交易金额计算和过滤逻辑
                return this._calculateTransactionValue(tx) >= this.minTransactionAmount;
            });

            return largeTransactions;
        } catch (error) {
            logger.error('Error getting large transactions:', error);
            throw error;
        }
    }

    // 分析钱包行为
    async _analyzeWallets(transactions) {
        const walletScores = new Map();

        for (const tx of transactions) {
            const addresses = this._extractAddresses(tx);
            
            for (const address of addresses) {
                const score = await this._calculateWalletScore(address);
                walletScores.set(address, score);
            }
        }

        return walletScores;
    }

    // 计算钱包评分
    async _calculateWalletScore(address) {
        try {
            const metrics = {
                profitRate: await this._calculateProfitRate(address),
                successRate: await this._calculateSuccessRate(address),
                tradingVolume: await this._calculateTradingVolume(address),
                holdingValue: await this._calculateHoldingValue(address)
            };

            // 评分权重
            const weights = {
                profitRate: 0.4,
                successRate: 0.3,
                tradingVolume: 0.2,
                holdingValue: 0.1
            };

            // 计算综合评分
            return Object.entries(metrics).reduce((score, [key, value]) => {
                return score + value * weights[key];
            }, 0);
        } catch (error) {
            logger.error(`Error calculating wallet score for ${address}:`, error);
            return 0;
        }
    }

    // 计算收益率
    async _calculateProfitRate(address) {
        try {
            // 获取历史交易
            const transactions = await this._getWalletTransactions(address);
            
            // 计算买入和卖出
            let totalBought = 0;
            let totalSold = 0;
            
            for (const tx of transactions) {
                const transfers = await this._extractTokenTransfers(tx);
                for (const transfer of transfers) {
                    const price = await this._getTokenPrice(transfer.mint);
                    const value = transfer.amount * price;
                    
                    if (transfer.source === address) {
                        totalSold += value;
                    } else if (transfer.destination === address) {
                        totalBought += value;
                    }
                }
            }
            
            // 计算收益率
            if (totalBought === 0) return 0;
            return (totalSold - totalBought) / totalBought;
        } catch (error) {
            logger.error('Error calculating profit rate:', error);
            return 0;
        }
    }

    // 获取钱包历史交易
    async _getWalletTransactions(address) {
        try {
            const connection = RPCService.providers.primary.connection;
            const signatures = await connection.getSignaturesForAddress(
                new PublicKey(address),
                { limit: 1000 }
            );
            
            const transactions = await RPCService.batchRequest(
                'getTransaction',
                signatures.map(sig => sig.signature)
            );
            
            return transactions.results;
        } catch (error) {
            logger.error('Error getting wallet transactions:', error);
            return [];
        }
    }

    // 计算成功率
    async _calculateSuccessRate(address) {
        try {
            const transactions = await this._getWalletTransactions(address);
            if (transactions.length === 0) return 0;
            
            // 分析每笔交易的盈亏
            let successCount = 0;
            for (const tx of transactions) {
                const profit = await this._calculateTransactionProfit(tx, address);
                if (profit > 0) successCount++;
            }
            
            return successCount / transactions.length;
        } catch (error) {
            logger.error('Error calculating success rate:', error);
            return 0;
        }
    }

    // 计算单笔交易盈亏
    async _calculateTransactionProfit(tx, address) {
        try {
            const transfers = await this._extractTokenTransfers(tx);
            let profit = 0;
            
            for (const transfer of transfers) {
                const price = await this._getTokenPrice(transfer.mint);
                const value = transfer.amount * price;
                
                if (transfer.source === address) {
                    profit -= value;
                } else if (transfer.destination === address) {
                    profit += value;
                }
            }
            
            return profit;
        } catch (error) {
            logger.error('Error calculating transaction profit:', error);
            return 0;
        }
    }

    // 计算交易量
    async _calculateTradingVolume(address) {
        try {
            const transactions = await this._getWalletTransactions(address);
            let totalVolume = 0;
            
            for (const tx of transactions) {
                const transfers = await this._extractTokenTransfers(tx);
                for (const transfer of transfers) {
                    const price = await this._getTokenPrice(transfer.mint);
                    totalVolume += transfer.amount * price;
                }
            }
            
            return totalVolume;
        } catch (error) {
            logger.error('Error calculating trading volume:', error);
            return 0;
        }
    }

    // 计算持仓价值
    async _calculateHoldingValue(address) {
        try {
            const connection = RPCService.providers.primary.connection;
            const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
                new PublicKey(address),
                { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
            );
            
            let totalValue = 0;
            for (const account of tokenAccounts.value) {
                const {
                    mint,
                    tokenAmount: { amount, decimals }
                } = account.account.data.parsed.info;
                
                const price = await this._getTokenPrice(mint);
                const value = (amount / Math.pow(10, decimals)) * price;
                totalValue += value;
            }
            
            return totalValue;
        } catch (error) {
            logger.error('Error calculating holding value:', error);
            return 0;
        }
    }

    // 筛选智能钱包
    _filterSmartWallets(walletScores) {
        const threshold = 0.7; // 智能钱包评分阈值
        return Array.from(walletScores.entries())
            .filter(([_, score]) => score >= threshold)
            .map(([address, score]) => ({
                address,
                score,
                timestamp: Date.now()
            }));
    }

    // 计算交易金额
    async _calculateTransactionValue(tx) {
        try {
            // 获取交易中的代币转账信息
            const transfers = await this._extractTokenTransfers(tx);
            
            // 计算总价值
            let totalValue = 0;
            for (const transfer of transfers) {
                const tokenPrice = await this._getTokenPrice(transfer.mint);
                totalValue += transfer.amount * tokenPrice;
            }
            
            logger.info('Transaction value calculated:', {
                signature: tx.signature,
                value: totalValue,
                transferCount: transfers.length
            });
            
            return totalValue;
        } catch (error) {
            logger.error('Error calculating transaction value:', error);
            return 0;
        }
    }

    // 提取代币转账信息
    async _extractTokenTransfers(tx) {
        const transfers = [];
        
        // 解析交易指令
        for (const instruction of tx.transaction.message.instructions) {
            if (this._isTokenTransfer(instruction)) {
                const transfer = await this._parseTokenTransfer(instruction);
                if (transfer) {
                    transfers.push(transfer);
                }
            }
        }
        
        return transfers;
    }

    // 判断是否为代币转账指令
    _isTokenTransfer(instruction) {
        // Token Program ID
        const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
        return instruction.programId.toString() === TOKEN_PROGRAM_ID;
    }

    // 解析代币转账数据
    async _parseTokenTransfer(instruction) {
        try {
            // 解析转账数据
            const data = instruction.data;
            const source = instruction.accounts[0];
            const destination = instruction.accounts[1];
            const mint = instruction.accounts[2];
            
            // 获取代币信息
            const tokenInfo = await this._getTokenInfo(mint);
            if (!tokenInfo) return null;
            
            // 计算实际转账金额
            const amount = data.readBigUInt64LE(1) / Math.pow(10, tokenInfo.decimals);
            
            return {
                mint: mint.toString(),
                source: source.toString(),
                destination: destination.toString(),
                amount,
                decimals: tokenInfo.decimals
            };
        } catch (error) {
            logger.error('Error parsing token transfer:', error);
            return null;
        }
    }

    // 获代币价格
    async _getTokenPrice(mint) {
        try {
            // 使用 Jupiter API 获取价格
            const response = await axios.get(`${this.JUPITER_API_URL}/price`, {
                params: { ids: mint }
            });
            
            return response.data?.data?.[mint]?.price || 0;
        } catch (error) {
            logger.error('Error getting token price:', error);
            return 0;
        }
    }

    // 获取代币信息
    async _getTokenInfo(mint) {
        try {
            const connection = RPCService.providers.primary.connection;
            const info = await connection.getParsedAccountInfo(new PublicKey(mint));
            
            if (!info.value) return null;
            
            return {
                mint: mint.toString(),
                decimals: info.value.data.parsed.info.decimals,
                supply: info.value.data.parsed.info.supply
            };
        } catch (error) {
            logger.error('Error getting token info:', error);
            return null;
        }
    }

    // 分析交易模式
    async analyzeTradePattern(address) {
        try {
            const transactions = await this._getWalletTransactions(address);
            const patterns = {
                buyDips: 0,          // 抄底行为
                takeProfits: 0,      // 获利了结
                swingTrades: 0,      // 波段交易
                holdTime: [],        // 持仓时间
                preferredTokens: new Map(), // 偏好代币
                tradeSize: []        // 交易规模
            };

            // 分析每笔交易
            for (let i = 0; i < transactions.length; i++) {
                const tx = transactions[i];
                const transfers = await this._extractTokenTransfers(tx);
                
                for (const transfer of transfers) {
                    // 记录代币偏好
                    if (!patterns.preferredTokens.has(transfer.mint)) {
                        patterns.preferredTokens.set(transfer.mint, 0);
                    }
                    patterns.preferredTokens.set(
                        transfer.mint,
                        patterns.preferredTokens.get(transfer.mint) + 1
                    );

                    // 记录交易规模
                    const value = transfer.amount * (await this._getTokenPrice(transfer.mint));
                    patterns.tradeSize.push(value);

                    // 分析交易行为
                    if (i > 0) {
                        const prevTx = transactions[i - 1];
                        const timeDiff = tx.blockTime - prevTx.blockTime;
                        patterns.holdTime.push(timeDiff);

                        // 判断交易类型
                        const priceChange = await this._getPriceChange(transfer.mint, prevTx.blockTime, tx.blockTime);
                        if (transfer.source === address) { // 卖出
                            if (priceChange > 0.05) { // 5% 以上涨幅获利了结
                                patterns.takeProfits++;
                            }
                        } else if (transfer.destination === address) { // 买入
                            if (priceChange < -0.05) { // 5% 以上跌幅抄底
                                patterns.buyDips++;
                            }
                        }

                        // 识别波段交易
                        if (i > 1) {
                            const prevAction = this._getTransferDirection(transactions[i-1], address);
                            const currentAction = this._getTransferDirection(tx, address);
                            if (prevAction !== currentAction) {
                                patterns.swingTrades++;
                            }
                        }
                    }
                }
            }

            // 计算统计指标
            const analysis = {
                tradingStyle: this._determineTradingStyle(patterns),
                avgHoldTime: patterns.holdTime.length > 0 ? 
                    patterns.holdTime.reduce((a, b) => a + b, 0) / patterns.holdTime.length : 0,
                preferredTokens: Array.from(patterns.preferredTokens.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5),
                avgTradeSize: patterns.tradeSize.length > 0 ?
                    patterns.tradeSize.reduce((a, b) => a + b, 0) / patterns.tradeSize.length : 0,
                patternMetrics: {
                    buyDips: patterns.buyDips,
                    takeProfits: patterns.takeProfits,
                    swingTrades: patterns.swingTrades
                }
            };

            logger.info('Trade pattern analysis completed', { address, analysis });
            return analysis;
        } catch (error) {
            logger.error('Error analyzing trade pattern:', error);
            throw error;
        }
    }

    // 获取价格变化
    async _getPriceChange(mint, startTime, endTime) {
        try {
            const response = await axios.get(`${this.JUPITER_API_URL}/price/history`, {
                params: {
                    id: mint,
                    from: startTime,
                    to: endTime
                }
            });
            
            if (!response.data?.data?.length) return 0;
            
            const prices = response.data.data;
            return (prices[prices.length - 1].price - prices[0].price) / prices[0].price;
        } catch (error) {
            logger.error('Error getting price change:', error);
            return 0;
        }
    }

    // 判断交易方向
    _getTransferDirection(tx, address) {
        const transfers = tx.transaction.message.instructions
            .filter(inst => this._isTokenTransfer(inst));
        
        for (const transfer of transfers) {
            if (transfer.accounts[0].toString() === address) return 'sell';
            if (transfer.accounts[1].toString() === address) return 'buy';
        }
        return null;
    }

    // 确定交易风格
    _determineTradingStyle(patterns) {
        const styles = [];
        
        // 判断是否为抄底型
        if (patterns.buyDips > patterns.takeProfits * 1.5) {
            styles.push('dip_buyer');
        }
        
        // 判断是否为波段交易
        if (patterns.swingTrades > patterns.buyDips && patterns.swingTrades > patterns.takeProfits) {
            styles.push('swing_trader');
        }
        
        // 判断是否为趋势跟随
        if (patterns.takeProfits > patterns.buyDips * 1.5) {
            styles.push('trend_follower');
        }
        
        // 判断持仓时间
        const avgHoldTime = patterns.holdTime.reduce((a, b) => a + b, 0) / patterns.holdTime.length;
        if (avgHoldTime < 3600) { // 1小时内
            styles.push('scalper');
        } else if (avgHoldTime > 86400 * 7) { // 7天以上
            styles.push('long_term_holder');
        }
        
        return styles.length > 0 ? styles : ['mixed'];
    }

    // 分析持仓情况
    async analyzeHoldings(address) {
        try {
            logger.info('Starting holdings analysis', { address });
            
            const holdings = await this._getTokenHoldings(address);
            const historicalHoldings = await this._getHistoricalHoldings(address);
            
            const analysis = {
                currentHoldings: this._analyzeCurrentHoldings(holdings),
                holdingPatterns: this._analyzeHoldingPatterns(historicalHoldings),
                riskMetrics: await this._calculateHoldingRisk(holdings),
                performanceMetrics: this._calculateHoldingPerformance(holdings, historicalHoldings)
            };

            logger.info('Holdings analysis completed', { address, analysis });
            return analysis;
        } catch (error) {
            logger.error('Error analyzing holdings:', error);
            throw error;
        }
    }

    // 分析当前持仓
    _analyzeCurrentHoldings(holdings) {
        const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);
        
        return {
            totalValue,
            tokenCount: holdings.length,
            topHoldings: holdings
                .sort((a, b) => b.value - a.value)
                .slice(0, 5)
                .map(h => ({
                    token: h.token,
                    value: h.value,
                    percentage: (h.value / totalValue * 100).toFixed(2) + '%'
                })),
            diversificationScore: this._calculateDiversificationScore(holdings, totalValue)
        };
    }

    // 分析持仓模式
    _analyzeHoldingPatterns(historicalHoldings) {
        const patterns = {
            averageHoldingTime: 0,
            tokenTurnover: 0,
            preferredTokenTypes: new Map(),
            seasonality: {
                daily: new Array(24).fill(0),
                weekly: new Array(7).fill(0)
            }
        };

        // 计算平均持仓时间
        let totalHoldingTime = 0;
        let holdingCount = 0;

        historicalHoldings.forEach(holding => {
            if (holding.exitTime) {
                totalHoldingTime += holding.exitTime - holding.entryTime;
                holdingCount++;
            }

            // 记录代币类型偏好
            const tokenType = this._getTokenType(holding.token);
            patterns.preferredTokenTypes.set(
                tokenType,
                (patterns.preferredTokenTypes.get(tokenType) || 0) + 1
            );

            // 记录交易时间模式
            const entryDate = new Date(holding.entryTime);
            patterns.seasonality.daily[entryDate.getHours()]++;
            patterns.seasonality.weekly[entryDate.getDay()]++;
        });

        patterns.averageHoldingTime = totalHoldingTime / holdingCount;
        patterns.tokenTurnover = historicalHoldings.length / holdingCount;

        return patterns;
    }

    // 计算持仓风险
    async _calculateHoldingRisk(holdings) {
        const riskMetrics = {
            concentrationRisk: 0,
            volatilityRisk: 0,
            liquidityRisk: 0,
            correlationRisk: 0
        };

        // 计算集中度风险
        const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);
        const squaredWeights = holdings.reduce((sum, h) => {
            const weight = h.value / totalValue;
            return sum + weight * weight;
        }, 0);
        riskMetrics.concentrationRisk = Math.sqrt(squaredWeights);

        // 计算波动性风险
        const volatilities = await Promise.all(
            holdings.map(h => this._getTokenVolatility(h.token))
        );
        riskMetrics.volatilityRisk = holdings.reduce((sum, h, i) => {
            const weight = h.value / totalValue;
            return sum + weight * volatilities[i];
        }, 0);

        // 计算流动性风险
        const liquidityScores = await Promise.all(
            holdings.map(h => this._getTokenLiquidity(h.token))
        );
        riskMetrics.liquidityRisk = holdings.reduce((sum, h, i) => {
            const weight = h.value / totalValue;
            return sum + weight * (1 - liquidityScores[i]);
        }, 0);

        // 计算相关性风险
        const correlationMatrix = await this._getCorrelationMatrix(
            holdings.map(h => h.token)
        );
        riskMetrics.correlationRisk = this._calculatePortfolioCorrelation(
            correlationMatrix,
            holdings.map(h => h.value / totalValue)
        );

        return riskMetrics;
    }

    // 计算持仓表现
    _calculateHoldingPerformance(currentHoldings, historicalHoldings) {
        return {
            totalReturn: this._calculateTotalReturn(currentHoldings, historicalHoldings),
            winRate: this._calculateWinRate(historicalHoldings),
            bestTrade: this._findBestTrade(historicalHoldings),
            worstTrade: this._findWorstTrade(historicalHoldings),
            averageReturn: this._calculateAverageReturn(historicalHoldings),
            sharpeRatio: this._calculateSharpeRatio(historicalHoldings)
        };
    }

    // 获取代币波动性
    async _getTokenVolatility(token) {
        try {
            const prices = await this._getHistoricalPrices(token);
            return this._calculateVolatility(prices);
        } catch (error) {
            logger.error('Error getting token volatility:', error);
            return 1; // 返回最高风险值
        }
    }

    // 获取代币流动性
    async _getTokenLiquidity(token) {
        try {
            const response = await axios.get(`${this.JUPITER_API_URL}/market-depth`, {
                params: { id: token }
            });
            return this._calculateLiquidityScore(response.data);
        } catch (error) {
            logger.error('Error getting token liquidity:', error);
            return 0; // 返回最低流动性值
        }
    }

    // 计算投资组合相关性
    _calculatePortfolioCorrelation(correlationMatrix, weights) {
        let portfolioCorrelation = 0;
        for (let i = 0; i < weights.length; i++) {
            for (let j = 0; j < weights.length; j++) {
                if (i !== j) {
                    portfolioCorrelation += weights[i] * weights[j] * correlationMatrix[i][j];
                }
            }
        }
        return portfolioCorrelation;
    }

    // 计算夏普比率
    _calculateSharpeRatio(historicalHoldings) {
        const returns = historicalHoldings
            .filter(h => h.exitTime)
            .map(h => (h.exitValue - h.entryValue) / h.entryValue);
        
        const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const riskFreeRate = 0.02; // 假设无风险利率为 2%
        
        const variance = returns.reduce((sum, r) => {
            const diff = r - avgReturn;
            return sum + diff * diff;
        }, 0) / returns.length;
        
        const stdDev = Math.sqrt(variance);
        return (avgReturn - riskFreeRate) / stdDev;
    }

    // 分析持仓周期详情
    async analyzeHoldingPeriods(address) {
        try {
            const holdings = await this._getTokenHoldings(address);
            const transactions = await this._getWalletTransactions(address);
            
            const holdingPeriods = {
                shortTerm: 0,  // < 24h
                mediumTerm: 0, // 1-7 days
                longTerm: 0,   // > 7 days
                averageHoldTime: 0,
                tokenSpecificPeriods: new Map()
            };

            // 分析每个代币的持仓周期
            for (const holding of holdings) {
                const tokenTransactions = transactions.filter(tx => {
                    const transfers = this._extractTokenTransfers(tx);
                    return transfers.some(t => t.mint === holding.token);
                });

                // 计算持仓时间
                const periods = this._calculateHoldingPeriods(tokenTransactions);
                holdingPeriods.tokenSpecificPeriods.set(holding.token, periods);

                // 更新统计
                if (periods.averageHoldTime < 24 * 3600) {
                    holdingPeriods.shortTerm++;
                } else if (periods.averageHoldTime < 7 * 24 * 3600) {
                    holdingPeriods.mediumTerm++;
                } else {
                    holdingPeriods.longTerm++;
                }
            }

            // 计算总体平均持仓时间
            holdingPeriods.averageHoldTime = Array.from(holdingPeriods.tokenSpecificPeriods.values())
                .reduce((sum, p) => sum + p.averageHoldTime, 0) / holdings.length;

            return holdingPeriods;
        } catch (error) {
            logger.error('Error analyzing holding periods:', error);
            throw error;
        }
    }

    // 计算具体持仓周期
    _calculateHoldingPeriods(transactions) {
        const periods = {
            averageHoldTime: 0,
            longestHold: 0,
            shortestHold: Infinity,
            totalHolds: 0,
            distribution: {
                lessThan24h: 0,
                lessThan7d: 0,
                moreThan7d: 0
            }
        };

        let lastBuyTime = null;
        for (const tx of transactions) {
            const action = this._getTransferDirection(tx);
            if (action === 'buy') {
                lastBuyTime = tx.blockTime;
            } else if (action === 'sell' && lastBuyTime) {
                const holdTime = tx.blockTime - lastBuyTime;
                periods.totalHolds++;
                periods.longestHold = Math.max(periods.longestHold, holdTime);
                periods.shortestHold = Math.min(periods.shortestHold, holdTime);

                // 更新分布统计
                if (holdTime < 24 * 3600) {
                    periods.distribution.lessThan24h++;
                } else if (holdTime < 7 * 24 * 3600) {
                    periods.distribution.lessThan7d++;
                } else {
                    periods.distribution.moreThan7d++;
                }

                lastBuyTime = null;
            }
        }

        periods.averageHoldTime = periods.totalHolds > 0 ? 
            periods.totalHolds / transactions.length : 0;

        return periods;
    }
}

module.exports = new WalletAnalysisService(); 