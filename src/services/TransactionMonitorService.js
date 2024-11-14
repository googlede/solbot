const { Connection, PublicKey } = require('@solana/web3.js');
const logger = require('../utils/logger');
const RPCService = require('./RPCService');
const WalletAnalysisService = require('./WalletAnalysisService');
const axios = require('axios');
const NotificationService = require('./NotificationService');

class TransactionMonitorService {
    constructor() {
        // 配置参数
        this.config = {
            monitoringInterval: 1000,  // 监控间隔（毫秒）
            alertThresholds: {
                volume: 1000000,       // 交易量阈值（USD）
                priceImpact: 0.05,     // 价格影响阈值（5%）
                slippage: 0.02         // 滑点阈值（2%）
            },
            batchSize: 20,             // 批处理大小
            maxRetries: 3              // 最大重试次数
        };

        // 监控状态
        this.isMonitoring = false;
        this.monitoringStats = {
            startTime: null,
            processedBlocks: 0,
            processedTransactions: 0,
            detectedAnomalies: 0,
            lastProcessedSlot: null
        };

        // 缓存最近处理的交易
        this.recentTransactions = new Set();
    }

    // 启动监控
    async startMonitoring() {
        if (this.isMonitoring) {
            logger.warn('Transaction monitoring is already running');
            return;
        }

        this.isMonitoring = true;
        this.monitoringStats.startTime = Date.now();
        logger.info('Starting transaction monitoring');

        try {
            await this._monitorLoop();
        } catch (error) {
            logger.error('Error in monitoring loop:', error);
            this.isMonitoring = false;
        }
    }

    // 停止监控
    async stopMonitoring() {
        this.isMonitoring = false;
        logger.info('Stopping transaction monitoring', {
            stats: this.getMonitoringStats()
        });
    }

    // 监控循环
    async _monitorLoop() {
        while (this.isMonitoring) {
            try {
                // 获取最新区块
                const slot = await RPCService.executeRequest('getSlot');
                
                // 如果是新区块
                if (slot !== this.monitoringStats.lastProcessedSlot) {
                    await this._processNewBlock(slot);
                    this.monitoringStats.lastProcessedSlot = slot;
                }

                // 等待下一个间隔
                await new Promise(resolve => setTimeout(resolve, this.config.monitoringInterval));
            } catch (error) {
                logger.error('Error in monitoring loop:', error);
                await new Promise(resolve => setTimeout(resolve, 5000)); // 错误后等待
            }
        }
    }

    // 处理新区块
    async _processNewBlock(slot) {
        try {
            const block = await RPCService.executeRequest('getBlock', slot, {
                maxSupportedTransactionVersion: 0,
                commitment: 'confirmed'
            });

            if (!block || !block.transactions) {
                logger.warn('Empty block or no transactions', { slot });
                return;
            }

            logger.info(`Processing block ${slot} with ${block.transactions.length} transactions`);

            // 批量处理交易
            for (let i = 0; i < block.transactions.length; i += this.config.batchSize) {
                const batch = block.transactions.slice(i, i + this.config.batchSize);
                await this._processBatch(batch);
            }

            this.monitoringStats.processedBlocks++;
            this.monitoringStats.processedTransactions += block.transactions.length;

        } catch (error) {
            logger.error('Error processing block:', error);
            throw error;
        }
    }

    // 批量处理交易
    async _processBatch(transactions) {
        const promises = transactions.map(tx => this._analyzeTransaction(tx));
        const results = await Promise.allSettled(promises);

        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                logger.error('Error analyzing transaction:', {
                    error: result.reason,
                    txIndex: index
                });
            }
        });
    }

    // 分析单笔交易
    async _analyzeTransaction(transaction) {
        try {
            // 检查是否已处理
            const signature = transaction.transaction.signatures[0];
            if (this.recentTransactions.has(signature)) {
                return;
            }

            // 添加到已处理集合
            this.recentTransactions.add(signature);
            if (this.recentTransactions.size > 10000) {
                this.recentTransactions.clear(); // 防止内存泄漏
            }

            // 计算交易价值
            const value = await this._calculateTransactionValue(transaction);
            
            // 检查是否超过阈值
            if (value >= this.config.alertThresholds.volume) {
                await this._handleLargeTransaction(transaction, value);
            }

            // 分析价格影响
            const priceImpact = await this._analyzePriceImpact(transaction);
            if (priceImpact >= this.config.alertThresholds.priceImpact) {
                await this._handleSignificantPriceImpact(transaction, priceImpact);
            }

            // 分析交易模式
            await this._analyzeTradePattern(transaction);

        } catch (error) {
            logger.error('Error analyzing transaction:', error);
            throw error;
        }
    }

    // 计算交易价值
    async _calculateTransactionValue(transaction) {
        // 使用 WalletAnalysisService 的方法
        return WalletAnalysisService._calculateTransactionValue(transaction);
    }

    // 分析价格影响
    async _analyzePriceImpact(transaction) {
        // TODO: 实现价格影响分析
        return 0;
    }

    // 分析交易模式
    async _analyzeTradePattern(transaction) {
        // TODO: 实现交易模式分析
        return null;
    }

    // 处理大额交易
    async _handleLargeTransaction(transaction, value) {
        logger.info('Large transaction detected', {
            signature: transaction.transaction.signatures[0],
            value,
            timestamp: new Date().toISOString()
        });

        // TODO: 实现通知机制
    }

    // 处理显著价格影响
    async _handleSignificantPriceImpact(transaction, impact) {
        logger.info('Significant price impact detected', {
            signature: transaction.transaction.signatures[0],
            impact,
            timestamp: new Date().toISOString()
        });

        // TODO: 实现通知机制
    }

    // 获取监控统计信息
    getMonitoringStats() {
        const now = Date.now();
        const runningTime = now - this.monitoringStats.startTime;

        return {
            ...this.monitoringStats,
            isRunning: this.isMonitoring,
            runningTime,
            transactionsPerSecond: 
                this.monitoringStats.processedTransactions / (runningTime / 1000),
            blocksPerSecond: 
                this.monitoringStats.processedBlocks / (runningTime / 1000)
        };
    }

    // 滑点监控
    async monitorSlippage(transaction) {
        try {
            const transfers = await WalletAnalysisService._extractTokenTransfers(transaction);
            const slippageMetrics = {
                averageSlippage: 0,
                maxSlippage: 0,
                transfers: []
            };

            for (const transfer of transfers) {
                // 获取预期价格
                const expectedPrice = await this._getExpectedPrice(transfer.mint);
                
                // 计算实际价格
                const actualPrice = await this._calculateActualPrice(transfer);
                
                // 计算滑点
                const slippage = Math.abs(actualPrice - expectedPrice) / expectedPrice;
                
                slippageMetrics.transfers.push({
                    token: transfer.mint,
                    expectedPrice,
                    actualPrice,
                    slippage,
                    amount: transfer.amount,
                    timestamp: transaction.blockTime
                });

                // 更新统计
                slippageMetrics.maxSlippage = Math.max(slippageMetrics.maxSlippage, slippage);
            }

            // 计算平均滑点
            slippageMetrics.averageSlippage = slippageMetrics.transfers.reduce(
                (sum, t) => sum + t.slippage, 0
            ) / slippageMetrics.transfers.length;

            // 检查是否需要报警
            if (slippageMetrics.maxSlippage > this.config.alertThresholds.slippage) {
                await this._handleHighSlippage(transaction, slippageMetrics);
            }

            return slippageMetrics;
        } catch (error) {
            logger.error('Error monitoring slippage:', error);
            throw error;
        }
    }

    // 获取预期价格
    async _getExpectedPrice(token) {
        try {
            const response = await axios.get(`${this.JUPITER_API_URL}/price`, {
                params: { ids: token }
            });
            return response.data?.data?.[token]?.price || 0;
        } catch (error) {
            logger.error('Error getting expected price:', error);
            return 0;
        }
    }

    // 计算实际价格
    async _calculateActualPrice(transfer) {
        try {
            // 使用 DEX 数据计算实际成交价格
            const poolData = await this._getPoolData(transfer.mint);
            return this._calculatePriceFromPool(transfer, poolData);
        } catch (error) {
            logger.error('Error calculating actual price:', error);
            return 0;
        }
    }

    // 处理高滑点情况
    async _handleHighSlippage(transaction, metrics) {
        await NotificationService.sendRiskAlert({
            type: 'HIGH_SLIPPAGE',
            level: 'WARNING',
            details: {
                transaction: transaction.signature,
                maxSlippage: metrics.maxSlippage,
                averageSlippage: metrics.averageSlippage,
                transfers: metrics.transfers
            }
        });
    }
}

module.exports = new TransactionMonitorService(); 