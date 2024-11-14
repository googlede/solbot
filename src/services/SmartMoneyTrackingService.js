const logger = require('../utils/logger');
const WalletAnalysisService = require('./WalletAnalysisService');
const DatabaseService = require('./DatabaseService');
const TokenService = require('./TokenService');
const RPCService = require('./RPCService');
const TradePatternService = require('./TradePatternService');
const RiskAnalysisService = require('./RiskAnalysisService');
const BatchService = require('./BatchService');
const CacheService = require('./CacheService');

class SmartMoneyTrackingService {
    constructor() {
        this.config = {
            tracking: {
                minProfitMultiple: 2,     // 最小盈利倍数
                minTradeAmount: 10000,    // 最小交易金额(USD)
                timeWindows: [            // 分析时间窗口
                    24 * 3600,            // 1天
                    7 * 24 * 3600,        // 1周
                    30 * 24 * 3600        // 1月
                ],
                maxTrackingDepth: 5,      // 最大链式追踪深度
                minConfidence: 0.7        // 最小置信度
            },
            analysis: {
                minTransactions: 10,      // 最小交易数量
                profitThreshold: 0.3,     // 盈利阈值
                volumeWeight: 0.3,        // 交易量权重
                successRateWeight: 0.3,   // 成功率权重
                timeWeight: 0.4           // 时间权重
            }
        };

        // 缓存配置
        this.cacheConfig = {
            results: {
                ttl: 5 * 60, // 5分钟
                maxSize: 1000
            },
            analysis: {
                ttl: 30 * 60, // 30分钟
                maxSize: 500
            }
        };
    }

    // 通过代币追踪聪明钱
    async trackSmartMoneyByToken(tokenAddress, timeWindow) {
        try {
            logger.info(`Starting smart money tracking for token ${tokenAddress}`);

            // 获取代币基本信息
            const tokenInfo = await TokenService.getTokenInfo(tokenAddress);
            if (!tokenInfo) {
                throw new Error('Invalid token address');
            }

            // 获取历史交易
            const transactions = await this._getTokenTransactions(tokenAddress, timeWindow);
            logger.info(`Found ${transactions.length} transactions for analysis`);

            // 分析交易地址
            const addressAnalysis = await this._analyzeTradeAddresses(transactions);

            // 计算收益率
            const profitAnalysis = await this._calculateProfits(addressAnalysis);

            // 筛选高收益地址
            const highProfitAddresses = this._filterHighProfitAddresses(profitAnalysis);

            // 链式追踪分析
            const chainAnalysis = await this._performChainAnalysis(highProfitAddresses);

            // 验证聪明钱特征
            const smartMoneyAddresses = await this._validateSmartMoney(chainAnalysis);

            // 生成分析报告
            const report = this._generateTrackingReport(smartMoneyAddresses, tokenInfo);

            // 存储分析结果
            await this._storeAnalysisResults(report);

            return report;
        } catch (error) {
            logger.error('Error in smart money tracking:', error);
            throw error;
        }
    }

    // 批量分析代币
    async batchAnalyzeTokens(tokenAddresses, timeWindow) {
        try {
            logger.info(`Starting batch analysis for ${tokenAddresses.length} tokens`);

            // 创建批处理任务
            const tasks = tokenAddresses.map(address => ({
                type: 'token_analysis',
                data: {
                    address,
                    timeWindow
                }
            }));

            // 使用 BatchService 处理任��
            const batchResults = await BatchService.processBatch(tasks, {
                batchSize: 10,
                timeout: 60000,
                retries: 3
            });

            // 处理结果
            const results = {
                successful: batchResults.results.map(result => ({
                    token: result.token,
                    smartMoneyAddresses: result.smartMoneyAddresses,
                    timestamp: result.timestamp
                })),
                failed: batchResults.errors.map(error => ({
                    token: error.task.data.address,
                    error: error.error
                }))
            };

            // 缓存结果
            await this._cacheBatchResults(results);

            return results;
        } catch (error) {
            logger.error('Error in batch token analysis:', error);
            throw error;
        }
    }

    // 缓存批量分析结果
    async _cacheBatchResults(results) {
        const cacheKey = `batch_analysis_${Date.now()}`;
        await CacheService.set(cacheKey, results, this.cacheConfig.results.ttl);
        return cacheKey;
    }

    // 使用缓存获取代币交易历史
    async _getTokenTransactions(tokenAddress, timeWindow) {
        const cacheKey = `token_tx_${tokenAddress}_${timeWindow}`;
        
        try {
            // 尝试从缓存获取
            const cached = await CacheService.get(cacheKey);
            if (cached) {
                logger.info(`Cache hit for token transactions: ${tokenAddress}`);
                return cached;
            }

            // 从数据库获取
            const transactions = await DatabaseService.getTokenTransactionsByPeriod(
                tokenAddress,
                Date.now() / 1000 - timeWindow,
                Date.now() / 1000
            );

            // 缓存结果
            await CacheService.set(cacheKey, transactions, this.cacheConfig.results.ttl);

            logger.info(`Retrieved ${transactions.length} transactions for token ${tokenAddress}`);
            return transactions;
        } catch (error) {
            logger.error('Error getting token transactions:', error);
            throw error;
        }
    }

    // 使用缓存获取地址分析
    async _getAddressAnalysis(address) {
        const cacheKey = `addr_analysis_${address}`;
        
        try {
            // 尝试从缓存获取
            const cached = await CacheService.get(cacheKey);
            if (cached) {
                return cached;
            }

            // 执行分析
            const analysis = {
                score: await WalletAnalysisService._calculateWalletScore(address),
                pattern: await TradePatternService.analyzeTradePattern(address),
                riskMetrics: await RiskAnalysisService.evaluateAddressRisk(address)
            };

            // 缓存结果
            await CacheService.set(cacheKey, analysis, this.cacheConfig.analysis.ttl);

            return analysis;
        } catch (error) {
            logger.error('Error getting address analysis:', error);
            throw error;
        }
    }

    // 批量验证聪明钱
    async _batchValidateSmartMoney(addresses) {
        try {
            // 创建验证任务
            const tasks = addresses.map(addr => ({
                type: 'smart_money_validation',
                data: {
                    address: addr.address,
                    metrics: addr
                }
            }));

            // 使用 BatchService 处理验证
            const results = await BatchService.processBatch(tasks, {
                batchSize: 20,
                timeout: 30000,
                retries: 2
            });

            return results.results.filter(r => r.isValid);
        } catch (error) {
            logger.error('Error in batch smart money validation:', error);
            throw error;
        }
    }

    // 优化链���分析
    async _performChainAnalysis(addresses) {
        const chainResults = [];
        const visited = new Set();
        const promises = [];

        // 并行处理多个地址的链式分析
        for (const address of addresses) {
            if (!visited.has(address.address)) {
                promises.push(
                    this._analyzeAddressChain(
                        address.address,
                        this.config.tracking.maxTrackingDepth,
                        visited
                    ).then(chainAnalysis => {
                        if (chainAnalysis.score >= this.config.tracking.minConfidence) {
                            chainResults.push({
                                ...address,
                                chainAnalysis
                            });
                        }
                    })
                );
            }
        }

        await Promise.all(promises);
        return chainResults;
    }

    // 批量获取价格数据
    async _batchGetPrices(tokens) {
        const cacheKey = `batch_prices_${tokens.join('_')}`;
        
        try {
            // 尝试从缓存获取
            const cached = await CacheService.get(cacheKey);
            if (cached) {
                return cached;
            }

            // 批量获取价格
            const prices = await TokenService.getBatchPrices(tokens);
            
            // 缓存结果
            await CacheService.set(cacheKey, prices, 60); // 1分钟缓存

            return prices;
        } catch (error) {
            logger.error('Error getting batch prices:', error);
            throw error;
        }
    }

    // 优化收益计算
    async _calculateProfits(addressAnalysis) {
        // 获取所有需要的代币价格
        const tokens = new Set();
        for (const [_, data] of addressAnalysis) {
            data.positions.forEach((_, token) => tokens.add(token));
        }

        // 批量获取价格
        const prices = await this._batchGetPrices(Array.from(tokens));

        // 计算收益
        const profits = [];
        for (const [address, data] of addressAnalysis) {
            // 计算已实现收益
            const realizedPnL = Array.from(data.positions.values())
                .reduce((sum, pos) => sum + pos.realizedPnL, 0);

            // 计算未实现收益
            const unrealizedPnL = Array.from(data.positions.entries())
                .reduce((sum, [token, position]) => {
                    if (position.amount > 0) {
                        const currentPrice = prices[token] || 0;
                        return sum + (position.amount * currentPrice - position.costBasis);
                    }
                    return sum;
                }, 0);

            // 计算总投入
            const totalInvestment = data.buyVolume;

            // 计算收益倍数
            const profitMultiple = totalInvestment > 0 ? 
                (realizedPnL + unrealizedPnL) / totalInvestment : 0;

            if (profitMultiple >= this.config.tracking.minProfitMultiple) {
                profits.push({
                    address,
                    profitMultiple,
                    realizedPnL,
                    unrealizedPnL,
                    totalInvestment,
                    trades: data.trades.length,
                    volume: data.volume,
                    firstTrade: data.firstTrade,
                    lastTrade: data.lastTrade
                });
            }
        }

        return profits.sort((a, b) => b.profitMultiple - a.profitMultiple);
    }

    // 分析交易地址
    async _analyzeTradeAddresses(transactions) {
        try {
            const addressMap = new Map();

            for (const tx of transactions) {
                const transfers = await WalletAnalysisService._extractTokenTransfers(tx);
                
                for (const transfer of transfers) {
                    if (transfer.amount * transfer.price >= this.config.tracking.minTradeAmount) {
                        await this._updateAddressAnalysis(addressMap, transfer, tx);
                    }
                }
            }

            return addressMap;
        } catch (error) {
            logger.error('Error analyzing trade addresses:', error);
            throw error;
        }
    }

    // 更新地址分析数据
    async _updateAddressAnalysis(addressMap, transfer, transaction) {
        const address = transfer.source;
        if (!addressMap.has(address)) {
            addressMap.set(address, {
                address,
                trades: [],
                volume: 0,
                buyVolume: 0,
                sellVolume: 0,
                firstTrade: transaction.blockTime,
                lastTrade: transaction.blockTime,
                profits: [],
                positions: new Map()
            });
        }

        const data = addressMap.get(address);
        data.trades.push({
            transaction: transaction.signature,
            type: transfer.type,
            amount: transfer.amount,
            price: transfer.price,
            timestamp: transaction.blockTime
        });

        // 更新交易量统计
        const tradeVolume = transfer.amount * transfer.price;
        data.volume += tradeVolume;
        if (transfer.type === 'buy') {
            data.buyVolume += tradeVolume;
        } else {
            data.sellVolume += tradeVolume;
        }

        // 更新持仓信息
        await this._updatePositionTracking(data, transfer);

        // 更新最后交易时间
        data.lastTrade = Math.max(data.lastTrade, transaction.blockTime);
    }

    // 更新持仓追踪
    async _updatePositionTracking(data, transfer) {
        const { token } = transfer;
        if (!data.positions.has(token)) {
            data.positions.set(token, {
                amount: 0,
                costBasis: 0,
                realizedPnL: 0
            });
        }

        const position = data.positions.get(token);
        if (transfer.type === 'buy') {
            // 更新持仓成本
            const newAmount = position.amount + transfer.amount;
            const newCost = position.costBasis + (transfer.amount * transfer.price);
            position.amount = newAmount;
            position.costBasis = newCost;
        } else {
            // 计算卖出收益
            const saleProceeds = transfer.amount * transfer.price;
            const costBasis = (transfer.amount / position.amount) * position.costBasis;
            const profit = saleProceeds - costBasis;
            
            position.amount -= transfer.amount;
            position.costBasis -= costBasis;
            position.realizedPnL += profit;
            
            data.profits.push({
                token,
                profit,
                timestamp: transfer.timestamp
            });
        }
    }

    // 验证聪明钱特征
    async _validateSmartMoney(addresses) {
        const validatedAddresses = [];

        for (const addr of addresses) {
            // 计算智能钱包评分
            const score = await WalletAnalysisService._calculateWalletScore(addr.address);
            
            // 分析交易模式
            const pattern = await TradePatternService.analyzeTradePattern(addr.address);
            
            // 分析风险指标
            const riskMetrics = await RiskAnalysisService.evaluateAddressRisk(addr.address);

            if (score >= this.config.tracking.minConfidence) {
                validatedAddresses.push({
                    ...addr,
                    score,
                    pattern,
                    riskMetrics,
                    confidence: this._calculateConfidenceScore(score, pattern, riskMetrics)
                });
            }
        }

        return validatedAddresses;
    }

    // 计算置信度评分
    _calculateConfidenceScore(score, pattern, riskMetrics) {
        const weights = {
            walletScore: 0.4,
            patternConsistency: 0.3,
            riskProfile: 0.3
        };

        const patternScore = this._evaluatePatternConsistency(pattern);
        const riskScore = this._evaluateRiskProfile(riskMetrics);

        return (
            score * weights.walletScore +
            patternScore * weights.patternConsistency +
            riskScore * weights.riskProfile
        );
    }

    // 评估交易模式一致性
    _evaluatePatternConsistency(pattern) {
        const consistencyFactors = {
            tradingStyleConsistency: pattern.tradingStyle.length === 1 ? 1 : 0.7,
            timeConsistency: this._calculateTimeConsistency(pattern.holdingTime),
            sizeConsistency: this._calculateSizeConsistency(pattern.tradeSize)
        };

        return Object.values(consistencyFactors).reduce((a, b) => a + b) / 3;
    }

    // 评估风险状况
    _evaluateRiskProfile(riskMetrics) {
        return 1 - (
            riskMetrics.volatilityRisk * 0.4 +
            riskMetrics.concentrationRisk * 0.3 +
            riskMetrics.liquidityRisk * 0.3
        );
    }

    // 生成追踪报告
    _generateTrackingReport(smartMoneyAddresses, tokenInfo) {
        const topPerformers = smartMoneyAddresses
            .sort((a, b) => b.profitMultiple - a.profitMultiple)
            .slice(0, 10);

        return {
            token: {
                address: tokenInfo.address,
                symbol: tokenInfo.symbol,
                name: tokenInfo.name
            },
            summary: {
                totalAddresses: smartMoneyAddresses.length,
                averageProfit: this._calculateAverageProfit(smartMoneyAddresses),
                totalVolume: this._calculateTotalVolume(smartMoneyAddresses),
                timeRange: this._getTimeRange(smartMoneyAddresses)
            },
            topPerformers: topPerformers.map(addr => ({
                address: addr.address,
                profitMultiple: addr.profitMultiple,
                volume: addr.volume,
                transactions: addr.transactions,
                score: addr.score,
                chainAnalysis: addr.chainAnalysis
            })),
            timestamp: Date.now()
        };
    }

    // 存储分析结果
    async _storeAnalysisResults(report) {
        await DatabaseService.storeAnalysisResult({
            type: 'SMART_MONEY_TRACKING',
            targetAddress: report.token.address,
            result: report
        });
    }

    // 添加错误重试机制
    async _retryOperation(operation, maxRetries = 3, delay = 1000) {
        let lastError;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
        } catch (error) {
                lastError = error;
                if (attempt === maxRetries) break;
                
                logger.warn(`Retry attempt ${attempt + 1} for operation`, { error: error.message });
                await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt)));
            }
        }
        
        throw lastError;
    }

    // 内存优化：批量处理大数据集
    async _processBatchedData(items, batchSize = 100, processor) {
        const results = [];
        
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, Math.min(i + batchSize, items.length));
            const batchResults = await processor(batch);
            results.push(...batchResults);
            
            // 强制垃圾回收
            if (global.gc) {
                global.gc();
            }
        }
        
        return results;
    }

    // 数据压缩
    _compressData(data) {
        try {
            const serializedData = JSON.stringify(data);
            return require('zlib').gzipSync(serializedData);
        } catch (error) {
            logger.error('Error compressing data:', error);
            return data;
        }
    }

    // 数据解压
    _decompressData(compressedData) {
        try {
            const decompressed = require('zlib').gunzipSync(compressedData);
            return JSON.parse(decompressed.toString());
        } catch (error) {
            logger.error('Error decompressing data:', error);
            return compressedData;
        }
    }

    // 优化内存使用的缓存存储
    async _setCacheWithCompression(key, data, ttl) {
        const compressedData = this._compressData(data);
        await CacheService.set(key, compressedData, ttl);
    }

    // 优化内存使用的缓存获取
    async _getCacheWithDecompression(key) {
        const compressedData = await CacheService.get(key);
        if (!compressedData) return null;
        return this._decompressData(compressedData);
    }

    // 内存使用监控
    _monitorMemoryUsage() {
        const used = process.memoryUsage();
        logger.info('Memory usage:', {
            rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
            heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
            external: `${Math.round(used.external / 1024 / 1024)}MB`
        });
    }

    // 使用优化后的方法重写部分功能
    async _getTokenTransactions(tokenAddress, timeWindow) {
        return this._retryOperation(async () => {
            const cacheKey = `token_tx_${tokenAddress}_${timeWindow}`;
            
            // 尝试获取压缩的缓存数据
            const cached = await this._getCacheWithDecompression(cacheKey);
            if (cached) {
                logger.info(`Cache hit for token transactions: ${tokenAddress}`);
                return cached;
            }

            const transactions = await DatabaseService.getTokenTransactionsByPeriod(
                tokenAddress,
                Date.now() / 1000 - timeWindow,
                Date.now() / 1000
            );

            // 存储压缩的缓存数据
            await this._setCacheWithCompression(
                cacheKey,
                transactions,
                this.cacheConfig.results.ttl
            );

            this._monitorMemoryUsage();
            return transactions;
        });
    }

    // 优化批量分析
    async batchAnalyzeTokens(tokenAddresses, timeWindow) {
        return this._retryOperation(async () => {
            logger.info(`Starting batch analysis for ${tokenAddresses.length} tokens`);

            // 使用批处理优化
            const results = await this._processBatchedData(
                tokenAddresses,
                10, // 批次大小
                async (batch) => {
                    const batchResults = await Promise.all(
                        batch.map(address => this.trackSmartMoneyByToken(address, timeWindow))
                    );
                    return batchResults;
                }
            );

            // 压缩并缓存结果
            const compressedResults = this._compressData(results);
            await this._setCacheWithCompression(
                `batch_analysis_${Date.now()}`,
                compressedResults,
                this.cacheConfig.results.ttl
            );

            this._monitorMemoryUsage();
            return results;
        });
        }
}

module.exports = new SmartMoneyTrackingService(); 