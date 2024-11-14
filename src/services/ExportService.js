const ExcelJS = require('exceljs');
const logger = require('../utils/logger');
const WalletAnalysisService = require('./WalletAnalysisService');

class ExportService {
    constructor() {
        this.workbook = new ExcelJS.Workbook();
    }

    async exportSmartWallets() {
        try {
            logger.info('Starting smart wallets export');
            const smartWallets = await WalletAnalysisService.identifySmartWallets();
            
            // 创建工作表
            const worksheet = this.workbook.addWorksheet('Smart Wallets');
            
            // 设置表头
            worksheet.columns = [
                { header: 'Address', key: 'address', width: 45 },
                { header: 'Score', key: 'score', width: 10 },
                { header: 'Volume (24h)', key: 'volume', width: 15 },
                { header: 'Success Rate', key: 'successRate', width: 15 },
                { header: 'Profit Rate', key: 'profitRate', width: 15 },
                { header: 'Holdings Value', key: 'holdingsValue', width: 15 },
                { header: 'Last Active', key: 'lastActive', width: 20 }
            ];

            // 添加数据
            for (const wallet of smartWallets) {
                worksheet.addRow({
                    address: wallet.address,
                    score: wallet.score.toFixed(2),
                    volume: wallet.metrics.volume.toLocaleString(),
                    successRate: `${(wallet.metrics.successRate * 100).toFixed(1)}%`,
                    profitRate: `${(wallet.metrics.profitRate * 100).toFixed(1)}%`,
                    holdingsValue: wallet.metrics.holdingValue.toLocaleString(),
                    lastActive: new Date(wallet.lastActive).toLocaleString()
                });
            }

            // 设置样式
            worksheet.getRow(1).font = { bold: true };
            worksheet.getRow(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF333333' }
            };
            worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' } };

            // 生成文件
            const buffer = await this.workbook.xlsx.writeBuffer();
            logger.info(`Successfully exported ${smartWallets.length} smart wallets`);
            
            return buffer;
        } catch (error) {
            logger.error('Error exporting smart wallets:', error);
            throw error;
        }
    }
}

module.exports = new ExportService(); 