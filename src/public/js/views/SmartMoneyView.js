class SmartMoneyView {
    constructor() {
        this.container = document.getElementById('smartMoneyContainer');
        this.initializeView();
        this.loadInitialData();
    }

    initializeView() {
        this.container.innerHTML = `
            <div class="smart-money-dashboard">
                <!-- 搜索和过滤区 -->
                <div class="search-section">
                    <input type="text" id="tokenSearch" placeholder="输入代币地址..." />
                    <select id="timeFilter">
                        <option value="24h">24小时</option>
                        <option value="7d">7天</option>
                        <option value="30d">30天</option>
                    </select>
                    <button id="searchBtn" class="primary-btn">分析</button>
                </div>

                <!-- 数据概览区 -->
                <div class="overview-section">
                    <div class="metric-card">
                        <h3>智能钱包数量</h3>
                        <div id="walletCount" class="metric-value">-</div>
                    </div>
                    <div class="metric-card">
                        <h3>平均收益率</h3>
                        <div id="avgProfit" class="metric-value">-</div>
                    </div>
                    <div class="metric-card">
                        <h3>总交易量</h3>
                        <div id="totalVolume" class="metric-value">-</div>
                    </div>
                </div>

                <!-- 智能钱包列表 -->
                <div class="wallet-list-section">
                    <h2>智能钱包排行</h2>
                    <div id="walletList" class="wallet-list"></div>
                </div>

                <!-- 图表区域 -->
                <div class="charts-section">
                    <div class="chart-container">
                        <h3>收益分布</h3>
                        <canvas id="profitChart"></canvas>
                    </div>
                    <div class="chart-container">
                        <h3>交易活动</h3>
                        <canvas id="activityChart"></canvas>
                    </div>
                </div>
            </div>
        `;

        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('searchBtn').addEventListener('click', () => this.analyze());
        document.getElementById('tokenSearch').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.analyze();
        });
        document.getElementById('timeFilter').addEventListener('change', () => this.analyze());
    }

    async loadInitialData() {
        try {
            this.showLoading(true);
            const response = await fetch('/api/tokens/top100');
            if (!response.ok) {
                throw new Error('Failed to fetch top tokens');
            }
            const data = await response.json();
            
            this.updateTopTokens(data);
        } catch (error) {
            this.showError(error.message);
        } finally {
            this.showLoading(false);
        }
    }

    async analyze() {
        const tokenAddress = document.getElementById('tokenSearch').value;
        const timeWindow = document.getElementById('timeFilter').value;
        
        if (!tokenAddress) {
            this.showError('请输入代币地址');
            return;
        }

        try {
            this.showLoading(true);
            const data = await this.fetchAnalysis(tokenAddress, timeWindow);
            this.updateView(data);
        } catch (error) {
            this.showError(error.message);
        } finally {
            this.showLoading(false);
        }
    }

    async fetchAnalysis(tokenAddress, timeWindow) {
        const response = await fetch(`/api/track/smart-money/${tokenAddress}?timeWindow=${timeWindow}`);
        if (!response.ok) {
            throw new Error('分析请求失败');
        }
        return response.json();
    }

    updateView(data) {
        document.getElementById('walletCount').textContent = data.summary.totalAddresses;
        document.getElementById('avgProfit').textContent = 
            `${(data.summary.averageProfit * 100).toFixed(2)}%`;
        document.getElementById('totalVolume').textContent = 
            `$${this.formatNumber(data.summary.totalVolume)}`;

        this.updateWalletList(data.topPerformers);

        this.updateCharts(data);
    }

    updateWalletList(wallets) {
        const listContainer = document.getElementById('walletList');
        listContainer.innerHTML = wallets.map(wallet => `
            <div class="wallet-card">
                <div class="wallet-header">
                    <span class="wallet-address">${this.formatAddress(wallet.address)}</span>
                    <span class="wallet-score">Score: ${wallet.score.toFixed(2)}</span>
                </div>
                <div class="wallet-metrics">
                    <div class="metric">
                        <span class="label">收益倍数</span>
                        <span class="value">${wallet.profitMultiple.toFixed(2)}x</span>
                    </div>
                    <div class="metric">
                        <span class="label">交易量</span>
                        <span class="value">$${this.formatNumber(wallet.volume)}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    updateCharts(data) {
        this.updateProfitChart(data);
        
        this.updateActivityChart(data);
    }

    formatAddress(address) {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }

    formatNumber(number) {
        return new Intl.NumberFormat().format(Math.round(number));
    }

    showError(message) {
        const alert = document.createElement('div');
        alert.className = 'alert error';
        alert.textContent = message;
        this.container.prepend(alert);
        setTimeout(() => alert.remove(), 5000);
    }

    showLoading(show) {
        const loader = document.querySelector('.loader');
        if (show) {
            if (!loader) {
                const newLoader = document.createElement('div');
                newLoader.className = 'loader';
                this.container.prepend(newLoader);
            }
        } else {
            loader?.remove();
        }
    }

    updateProfitChart(data) {
        const ctx = document.getElementById('profitChart').getContext('2d');
        if (this.profitChart) {
            this.profitChart.destroy();
        }
        
        this.profitChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.topPerformers.map(w => this.formatAddress(w.address)),
                datasets: [{
                    label: '收益倍数',
                    data: data.topPerformers.map(w => w.profitMultiple),
                    backgroundColor: 'rgba(0, 153, 255, 0.5)',
                    borderColor: 'rgba(0, 153, 255, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                }
            }
        });
    }

    updateActivityChart(data) {
        const ctx = document.getElementById('activityChart').getContext('2d');
        if (this.activityChart) {
            this.activityChart.destroy();
        }

        const activities = this._processActivityData(data);
        
        this.activityChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: activities.labels,
                datasets: [{
                    label: '交易活动',
                    data: activities.values,
                    borderColor: 'rgba(0, 255, 136, 1)',
                    backgroundColor: 'rgba(0, 255, 136, 0.1)',
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                }
            }
        });
    }

    updateTopTokens(data) {
        const walletList = document.getElementById('walletList');
        if (!data || !data.tokens) return;

        walletList.innerHTML = data.tokens.slice(0, 10).map(token => `
            <div class="wallet-card">
                <div class="wallet-header">
                    <span class="wallet-address">${this.formatAddress(token.address)}</span>
                    <span class="wallet-score">Volume: $${this.formatNumber(token.volume24h)}</span>
                </div>
                <div class="wallet-metrics">
                    <div class="metric">
                        <span class="label">价格</span>
                        <span class="value">$${token.price.toFixed(6)}</span>
                    </div>
                    <div class="metric">
                        <span class="label">24h变化</span>
                        <span class="value ${token.priceChange24h >= 0 ? 'positive' : 'negative'}">
                            ${token.priceChange24h.toFixed(2)}%
                        </span>
                    </div>
                </div>
            </div>
        `).join('');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.smartMoneyView = new SmartMoneyView();
}); 