class SmartWalletAnalytics {
    constructor() {
        this.container = document.getElementById('smartWalletContainer');
        this.walletList = document.getElementById('smartWalletList');
        this.metrics = document.getElementById('metricsContainer');
        this.refreshInterval = 60000; // 1分钟刷新一次
    }

    // 初始化
    async init() {
        try {
            await this.loadData();
            this.startAutoRefresh();
            this.setupEventListeners();
        } catch (error) {
            console.error('Failed to initialize SmartWalletAnalytics:', error);
            this.showError(error.message);
        }
    }

    // 加载数据
    async loadData() {
        try {
            const [wallets, metrics] = await Promise.all([
                this.fetchSmartWallets(),
                this.fetchMetrics()
            ]);
            
            this.renderWallets(wallets);
            this.renderMetrics(metrics);
        } catch (error) {
            console.error('Error loading data:', error);
            throw error;
        }
    }

    // 获取智能钱包列表
    async fetchSmartWallets() {
        const response = await fetch('/api/smart-wallets');
        if (!response.ok) {
            throw new Error('Failed to fetch smart wallets');
        }
        return response.json();
    }

    // 获取性能指标
    async fetchMetrics() {
        const response = await fetch('/api/metrics');
        if (!response.ok) {
            throw new Error('Failed to fetch metrics');
        }
        return response.json();
    }

    // 渲染钱包列表
    renderWallets(wallets) {
        if (!this.walletList) return;

        this.walletList.innerHTML = wallets.map(wallet => `
            <div class="wallet-card" data-address="${wallet.address}">
                <div class="wallet-header">
                    <h3>${this.formatAddress(wallet.address)}</h3>
                    <span class="score ${this.getScoreClass(wallet.score)}">
                        Score: ${wallet.score.toFixed(2)}
                    </span>
                </div>
                <div class="wallet-metrics">
                    <div class="metric">
                        <span class="label">Volume:</span>
                        <span class="value">$${this.formatNumber(wallet.metrics.volume)}</span>
                    </div>
                    <div class="metric">
                        <span class="label">Success Rate:</span>
                        <span class="value">${(wallet.metrics.successRate * 100).toFixed(1)}%</span>
                    </div>
                    <div class="metric">
                        <span class="label">Profit Rate:</span>
                        <span class="value ${this.getProfitClass(wallet.metrics.profitRate)}">
                            ${(wallet.metrics.profitRate * 100).toFixed(1)}%
                        </span>
                    </div>
                </div>
                <div class="wallet-actions">
                    <button onclick="smartWallet.showDetails('${wallet.address}')">
                        View Details
                    </button>
                    <button onclick="smartWallet.trackWallet('${wallet.address}')">
                        Track
                    </button>
                </div>
            </div>
        `).join('');
    }

    // 渲染性能指标
    renderMetrics(metrics) {
        if (!this.metrics) return;

        this.metrics.innerHTML = `
            <div class="metrics-grid">
                <div class="metric-card">
                    <h4>Processing</h4>
                    <div class="metric-value">${metrics.processedTransactions}</div>
                    <div class="metric-label">Transactions Analyzed</div>
                </div>
                <div class="metric-card">
                    <h4>Detection</h4>
                    <div class="metric-value">${metrics.smartWallets}</div>
                    <div class="metric-label">Smart Wallets Found</div>
                </div>
                <div class="metric-card">
                    <h4>Success Rate</h4>
                    <div class="metric-value">${(metrics.successRate * 100).toFixed(1)}%</div>
                    <div class="metric-label">Prediction Accuracy</div>
                </div>
                <div class="metric-card">
                    <h4>Performance</h4>
                    <div class="metric-value">${metrics.avgResponseTime.toFixed(0)}ms</div>
                    <div class="metric-label">Average Response Time</div>
                </div>
            </div>
        `;
    }

    // 显示钱包详情
    async showDetails(address) {
        try {
            const response = await fetch(`/api/wallet/${address}/details`);
            const details = await response.json();
            
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <span class="close">&times;</span>
                    <h2>Wallet Details</h2>
                    <div class="details-container">
                        ${this.renderWalletDetails(details)}
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            modal.querySelector('.close').onclick = () => modal.remove();
        } catch (error) {
            console.error('Error showing wallet details:', error);
            this.showError('Failed to load wallet details');
        }
    }

    // 跟踪钱包
    async trackWallet(address) {
        try {
            const response = await fetch('/api/wallet/track', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ address })
            });
            
            if (response.ok) {
                this.showSuccess(`Now tracking wallet ${this.formatAddress(address)}`);
            } else {
                throw new Error('Failed to track wallet');
            }
        } catch (error) {
            console.error('Error tracking wallet:', error);
            this.showError('Failed to track wallet');
        }
    }

    // 辅助方法
    formatAddress(address) {
        return `${address.slice(0, 4)}...${address.slice(-4)}`;
    }

    formatNumber(number) {
        return new Intl.NumberFormat().format(number);
    }

    getScoreClass(score) {
        if (score >= 0.8) return 'high';
        if (score >= 0.5) return 'medium';
        return 'low';
    }

    getProfitClass(rate) {
        if (rate > 0) return 'positive';
        if (rate < 0) return 'negative';
        return '';
    }

    showError(message) {
        const alert = document.createElement('div');
        alert.className = 'alert error';
        alert.textContent = message;
        this.container.prepend(alert);
        setTimeout(() => alert.remove(), 5000);
    }

    showSuccess(message) {
        const alert = document.createElement('div');
        alert.className = 'alert success';
        alert.textContent = message;
        this.container.prepend(alert);
        setTimeout(() => alert.remove(), 3000);
    }

    // 自动刷新
    startAutoRefresh() {
        setInterval(() => this.loadData(), this.refreshInterval);
    }

    // 设置事件监听器
    setupEventListeners() {
        document.getElementById('refreshButton')?.addEventListener('click', () => this.loadData());
        document.getElementById('filterSelect')?.addEventListener('change', (e) => this.filterWallets(e.target.value));
        document.getElementById('searchInput')?.addEventListener('input', (e) => this.searchWallets(e.target.value));
    }
}

// 初始化
const smartWallet = new SmartWalletAnalytics();
document.addEventListener('DOMContentLoaded', () => smartWallet.init()); 