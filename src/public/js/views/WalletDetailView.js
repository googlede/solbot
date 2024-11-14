class WalletDetailView {
    constructor() {
        this.modal = null;
        this.initializeModal();
    }

    initializeModal() {
        const modalHtml = `
            <div class="modal" id="walletDetailModal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>钱包详情</h2>
                        <span class="close">&times;</span>
                    </div>
                    <div class="modal-body">
                        <div class="detail-section">
                            <h3>基本信息</h3>
                            <div id="basicInfo"></div>
                        </div>
                        <div class="detail-section">
                            <h3>交易历史</h3>
                            <div id="transactionHistory"></div>
                        </div>
                        <div class="detail-section">
                            <h3>持仓分析</h3>
                            <div id="holdingAnalysis"></div>
                        </div>
                        <div class="detail-section">
                            <h3>收益分析</h3>
                            <canvas id="profitAnalysisChart"></canvas>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.bindEvents();
    }

    async showDetails(address) {
        try {
            const data = await this.fetchWalletDetails(address);
            this.updateModalContent(data);
            this.show();
        } catch (error) {
            console.error('Error loading wallet details:', error);
        }
    }
} 