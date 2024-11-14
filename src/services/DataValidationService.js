const logger = require('../utils/logger');
const { isValidPublicKey } = require('@solana/web3.js');

class DataValidationService {
    // 验证钱包地址
    validateWalletData(data) {
        if (!isValidPublicKey(data.address)) {
            throw new Error('Invalid wallet address');
        }
        
        if (typeof data.score !== 'number' || data.score < 0 || data.score > 1) {
            throw new Error('Invalid score value');
        }

        // 验证其他字段...
    }

    // 验证交易数据
    validateTransactionData(data) {
        // 实现验证逻辑
    }

    // 验证持仓数据
    validateHoldingData(data) {
        // 实现验证逻辑
    }

    // 清洗数据
    cleanData(data, type) {
        switch (type) {
            case 'wallet':
                return this._cleanWalletData(data);
            case 'transaction':
                return this._cleanTransactionData(data);
            case 'holding':
                return this._cleanHoldingData(data);
            default:
                throw new Error(`Unknown data type: ${type}`);
        }
    }

    // 清洗钱包数据
    _cleanWalletData(data) {
        return {
            ...data,
            address: data.address.trim(),
            score: parseFloat(data.score),
            metrics: this._sanitizeJson(data.metrics),
            tradingStyle: Array.isArray(data.tradingStyle) ? 
                data.tradingStyle.filter(Boolean) : [],
            tags: Array.isArray(data.tags) ? 
                data.tags.filter(Boolean) : []
        };
    }

    // 清洗交易数据
    _cleanTransactionData(data) {
        // 实现清洗逻辑
    }

    // 清洗持仓数据
    _cleanHoldingData(data) {
        // 实现清洗逻辑
    }

    // 清理 JSON 数据
    _sanitizeJson(data) {
        try {
            return typeof data === 'string' ? 
                JSON.parse(data) : data;
        } catch (error) {
            logger.error('Error sanitizing JSON:', error);
            return {};
        }
    }
}

module.exports = new DataValidationService(); 