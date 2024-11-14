const { Pool } = require('pg');
const logger = require('../utils/logger');

class DatabaseService {
    constructor() {
        // 数据库连接池配置
        this.pool = new Pool({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            max: 20,                 // 最大连接数
            idleTimeoutMillis: 30000 // 连接超时时间
        });

        // 数据清理配置
        this.config = {
            cleanupInterval: 24 * 60 * 60 * 1000,  // 清理间隔（24小时）
            maxStorageAge: 30 * 24 * 60 * 60 * 1000,  // 数据保存期限（30天）
            batchSize: 1000  // 批处理大小
        };

        // 初始化数据库
        this._initializeDatabase();
        // 启动定时清理
        this._startCleanupTask();
    }

    // 初始化数据库表
    async _initializeDatabase() {
        try {
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS smart_wallets (
                    address VARCHAR(44) PRIMARY KEY,
                    score DECIMAL,
                    metrics JSONB,
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS transactions (
                    signature VARCHAR(88) PRIMARY KEY,
                    block_slot BIGINT,
                    timestamp TIMESTAMP,
                    data JSONB,
                    analyzed BOOLEAN DEFAULT FALSE
                );

                CREATE TABLE IF NOT EXISTS token_risks (
                    address VARCHAR(44) PRIMARY KEY,
                    risk_score DECIMAL,
                    metrics JSONB,
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS analysis_results (
                    id SERIAL PRIMARY KEY,
                    type VARCHAR(50),
                    target_address VARCHAR(44),
                    result JSONB,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX IF NOT EXISTS idx_transactions_timestamp 
                ON transactions(timestamp);
                
                CREATE INDEX IF NOT EXISTS idx_analysis_results_type_timestamp 
                ON analysis_results(type, timestamp);
            `);

            logger.info('Database initialized successfully');
        } catch (error) {
            logger.error('Error initializing database:', error);
            throw error;
        }
    }

    // 存储智能钱包数据
    async storeSmartWallet(walletData) {
        try {
            const { address, score, metrics } = walletData;
            await this.pool.query(
                `INSERT INTO smart_wallets (address, score, metrics, last_updated)
                 VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                 ON CONFLICT (address) 
                 DO UPDATE SET score = $2, metrics = $3, last_updated = CURRENT_TIMESTAMP`,
                [address, score, metrics]
            );
            logger.info(`Stored smart wallet data for ${address}`);
        } catch (error) {
            logger.error('Error storing smart wallet:', error);
            throw error;
        }
    }

    // 存储交易数据
    async storeTransaction(transactionData) {
        try {
            const { signature, blockSlot, timestamp, data } = transactionData;
            await this.pool.query(
                `INSERT INTO transactions (signature, block_slot, timestamp, data)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (signature) DO NOTHING`,
                [signature, blockSlot, timestamp, data]
            );
            logger.info(`Stored transaction ${signature}`);
        } catch (error) {
            logger.error('Error storing transaction:', error);
            throw error;
        }
    }

    // 存储代币风险数据
    async storeTokenRisk(riskData) {
        try {
            const { address, riskScore, metrics } = riskData;
            await this.pool.query(
                `INSERT INTO token_risks (address, risk_score, metrics, last_updated)
                 VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                 ON CONFLICT (address) 
                 DO UPDATE SET risk_score = $2, metrics = $3, last_updated = CURRENT_TIMESTAMP`,
                [address, riskScore, metrics]
            );
            logger.info(`Stored token risk data for ${address}`);
        } catch (error) {
            logger.error('Error storing token risk:', error);
            throw error;
        }
    }

    // 存储分析结果
    async storeAnalysisResult(analysisData) {
        try {
            const { type, targetAddress, result } = analysisData;
            await this.pool.query(
                `INSERT INTO analysis_results (type, target_address, result)
                 VALUES ($1, $2, $3)`,
                [type, targetAddress, result]
            );
            logger.info(`Stored analysis result for ${targetAddress}`);
        } catch (error) {
            logger.error('Error storing analysis result:', error);
            throw error;
        }
    }

    // 查询智能钱包
    async getSmartWallets(options = {}) {
        try {
            const { minScore = 0, limit = 100, offset = 0 } = options;
            const result = await this.pool.query(
                `SELECT * FROM smart_wallets 
                 WHERE score >= $1 
                 ORDER BY score DESC 
                 LIMIT $2 OFFSET $3`,
                [minScore, limit, offset]
            );
            return result.rows;
        } catch (error) {
            logger.error('Error querying smart wallets:', error);
            throw error;
        }
    }

    // 查询交易历史
    async getTransactionHistory(address, options = {}) {
        try {
            const { limit = 100, offset = 0 } = options;
            const result = await this.pool.query(
                `SELECT * FROM transactions 
                 WHERE data->>'from' = $1 OR data->>'to' = $1 
                 ORDER BY timestamp DESC 
                 LIMIT $2 OFFSET $3`,
                [address, limit, offset]
            );
            return result.rows;
        } catch (error) {
            logger.error('Error querying transaction history:', error);
            throw error;
        }
    }

    // 查询代币风险
    async getTokenRisk(address) {
        try {
            const result = await this.pool.query(
                'SELECT * FROM token_risks WHERE address = $1',
                [address]
            );
            return result.rows[0];
        } catch (error) {
            logger.error('Error querying token risk:', error);
            throw error;
        }
    }

    // 查询分析结果
    async getAnalysisResults(type, targetAddress) {
        try {
            const result = await this.pool.query(
                `SELECT * FROM analysis_results 
                 WHERE type = $1 AND target_address = $2 
                 ORDER BY timestamp DESC`,
                [type, targetAddress]
            );
            return result.rows;
        } catch (error) {
            logger.error('Error querying analysis results:', error);
            throw error;
        }
    }

    // 数据清理任务
    async _startCleanupTask() {
        setInterval(async () => {
            try {
                await this._cleanupOldData();
            } catch (error) {
                logger.error('Error in cleanup task:', error);
            }
        }, this.config.cleanupInterval);
    }

    // 清理旧数据
    async _cleanupOldData() {
        const cutoffDate = new Date(Date.now() - this.config.maxStorageAge);
        
        try {
            // 清理旧交易数据
            const { rowCount: deletedTransactions } = await this.pool.query(
                'DELETE FROM transactions WHERE timestamp < $1',
                [cutoffDate]
            );

            // 清理旧分析结果
            const { rowCount: deletedResults } = await this.pool.query(
                'DELETE FROM analysis_results WHERE timestamp < $1',
                [cutoffDate]
            );

            logger.info('Cleanup completed', {
                deletedTransactions,
                deletedResults,
                cutoffDate
            });
        } catch (error) {
            logger.error('Error cleaning up old data:', error);
            throw error;
        }
    }

    // 关闭数据库连接
    async close() {
        await this.pool.end();
    }
}

module.exports = new DatabaseService(); 