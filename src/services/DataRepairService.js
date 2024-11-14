const logger = require('../utils/logger');
const DatabaseService = require('./DatabaseService');
const WalletAnalysisService = require('./WalletAnalysisService');
const RPCService = require('./RPCService');

class DataRepairService {
    constructor() {
        this.repairQueue = [];
        this.isRepairing = false;
        this.repairStats = {
            totalRepaired: 0,
            failedRepairs: 0,
            lastRepairTime: null
        };
    }

    // 检查并修复数据一致性
    async repairDataConsistency() {
        try {
            logger.info('Starting data consistency repair');
            this.isRepairing = true;

            // 检查各种数据问题
            const issues = await this._checkDataIssues();
            
            // 对发现的问题进行修复
            for (const issue of issues) {
                await this._repairIssue(issue);
            }

            // 更新修复统计
            this.repairStats.lastRepairTime = new Date();
            logger.info('Data repair completed', this.repairStats);

            return {
                success: true,
                repairedCount: issues.length,
                stats: this.repairStats
            };
        } catch (error) {
            logger.error('Error in data repair:', error);
            throw error;
        } finally {
            this.isRepairing = false;
        }
    }

    // 检查数据问题
    async _checkDataIssues() {
        const issues = [];

        // 检查钱包数据完整性
        const walletIssues = await this._checkWalletData();
        issues.push(...walletIssues);

        // 检查交易数据完整性
        const transactionIssues = await this._checkTransactionData();
        issues.push(...transactionIssues);

        // 检查持仓数据完整性
        const holdingIssues = await this._checkHoldingData();
        issues.push(...holdingIssues);

        return issues;
    }

    // 检查钱包数据
    async _checkWalletData() {
        const issues = [];
        const { rows } = await DatabaseService.pool.query(`
            SELECT address, score, metrics, last_active
            FROM smart_wallets
            WHERE score IS NULL 
               OR metrics IS NULL 
               OR last_active IS NULL
               OR metrics = '{}'::jsonb
        `);

        for (const row of rows) {
            issues.push({
                type: 'wallet_data',
                address: row.address,
                issues: this._identifyWalletIssues(row)
            });
        }

        return issues;
    }

    // 检查交易数据
    async _checkTransactionData() {
        const issues = [];
        const { rows } = await DatabaseService.pool.query(`
            SELECT signature, block_slot, wallet_address, token_mint, amount
            FROM transactions
            WHERE amount IS NULL 
               OR block_slot IS NULL
               OR NOT EXISTS (
                   SELECT 1 
                   FROM smart_wallets 
                   WHERE address = wallet_address
               )
        `);

        for (const row of rows) {
            issues.push({
                type: 'transaction_data',
                signature: row.signature,
                issues: this._identifyTransactionIssues(row)
            });
        }

        return issues;
    }

    // 检查持仓数据
    async _checkHoldingData() {
        const issues = [];
        const { rows } = await DatabaseService.pool.query(`
            SELECT id, wallet_address, token_mint, amount, value_usd
            FROM holdings
            WHERE amount <= 0 
               OR value_usd < 0
               OR last_updated < NOW() - INTERVAL '24 hours'
        `);

        for (const row of rows) {
            issues.push({
                type: 'holding_data',
                id: row.id,
                issues: this._identifyHoldingIssues(row)
            });
        }

        return issues;
    }

    // 修复单个问题
    async _repairIssue(issue) {
        try {
            switch (issue.type) {
                case 'wallet_data':
                    await this._repairWalletData(issue);
                    break;
                case 'transaction_data':
                    await this._repairTransactionData(issue);
                    break;
                case 'holding_data':
                    await this._repairHoldingData(issue);
                    break;
                default:
                    logger.warn('Unknown issue type:', issue.type);
            }

            this.repairStats.totalRepaired++;
        } catch (error) {
            logger.error('Error repairing issue:', error);
            this.repairStats.failedRepairs++;
            throw error;
        }
    }

    // 修复钱包数据
    async _repairWalletData(issue) {
        const client = await DatabaseService.pool.connect();
        try {
            await client.query('BEGIN');

            // 重新计算钱包评分
            const score = await WalletAnalysisService._calculateWalletScore(issue.address);
            
            // 更新钱包数据
            await client.query(`
                UPDATE smart_wallets
                SET score = $1,
                    metrics = $2,
                    last_active = NOW()
                WHERE address = $3
            `, [score.score, JSON.stringify(score.metrics), issue.address]);

            await client.query('COMMIT');
            logger.info('Wallet data repaired:', issue.address);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // 修复交易数据
    async _repairTransactionData(issue) {
        const client = await DatabaseService.pool.connect();
        try {
            await client.query('BEGIN');

            // 从链上重新获取交易数据
            const tx = await RPCService.getTransaction(issue.signature);
            if (!tx) {
                throw new Error('Transaction not found on chain');
            }

            // 更新交易数据
            await client.query(`
                UPDATE transactions
                SET block_slot = $1,
                    block_time = to_timestamp($2),
                    amount = $3,
                    status = $4
                WHERE signature = $5
            `, [tx.slot, tx.blockTime, tx.meta.postBalances[0], 'confirmed', issue.signature]);

            await client.query('COMMIT');
            logger.info('Transaction data repaired:', issue.signature);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // 修复持仓数据
    async _repairHoldingData(issue) {
        const client = await DatabaseService.pool.connect();
        try {
            await client.query('BEGIN');

            // 重新计算持仓价值
            const holdings = await WalletAnalysisService._calculateHoldingValue(issue.wallet_address);
            
            // 更新持仓数据
            await client.query(`
                UPDATE holdings
                SET amount = $1,
                    value_usd = $2,
                    last_updated = NOW()
                WHERE id = $3
            `, [holdings.amount, holdings.value, issue.id]);

            await client.query('COMMIT');
            logger.info('Holding data repaired:', issue.id);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // 获取修复状态
    getRepairStatus() {
        return {
            isRepairing: this.isRepairing,
            stats: this.repairStats,
            queueLength: this.repairQueue.length
        };
    }
}

module.exports = new DataRepairService(); 