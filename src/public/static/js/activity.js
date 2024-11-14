class ActivityMonitor {
    constructor() {
        this.feed = document.getElementById('activityFeed');
        this.lastUpdate = Date.now();
        this.initializeEventSource();
    }

    initializeEventSource() {
        const eventSource = new EventSource('/api/activity/stream');
        
        eventSource.onmessage = (event) => {
            const activity = JSON.parse(event.data);
            this.addActivity(activity);
        };

        eventSource.onerror = (error) => {
            console.error('Activity stream error:', error);
            setTimeout(() => this.initializeEventSource(), 5000);
        };
    }

    addActivity(activity) {
        const element = this.createActivityElement(activity);
        this.feed.insertBefore(element, this.feed.firstChild);
        
        // 限制显示的活动数量
        if (this.feed.children.length > 50) {
            this.feed.removeChild(this.feed.lastChild);
        }
    }

    createActivityElement(activity) {
        const element = document.createElement('div');
        element.className = `activity-item ${activity.type}`;
        
        element.innerHTML = `
            <div class="activity-icon">${this.getActivityIcon(activity.type)}</div>
            <div class="activity-content">
                <div class="activity-header">
                    <span class="activity-type">${activity.type}</span>
                    <span class="activity-time">${this.formatTime(activity.timestamp)}</span>
                </div>
                <div class="activity-details">
                    ${this.formatActivityDetails(activity)}
                </div>
            </div>
        `;
        
        return element;
    }

    getActivityIcon(type) {
        const icons = {
            'large-transaction': '💰',
            'smart-wallet': '🧠',
            'price-impact': '📊',
            'risk-alert': '⚠️'
        };
        return icons[type] || '📝';
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return date.toLocaleDateString();
    }

    formatActivityDetails(activity) {
        switch (activity.type) {
            case 'large-transaction':
                return `
                    <div class="detail-row">
                        <span class="label">Amount:</span>
                        <span class="value">$${this.formatNumber(activity.amount)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Token:</span>
                        <span class="value">${activity.token}</span>
                    </div>
                `;
            case 'smart-wallet':
                return `
                    <div class="detail-row">
                        <span class="label">Address:</span>
                        <span class="value">${this.formatAddress(activity.address)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Score:</span>
                        <span class="value">${activity.score.toFixed(2)}</span>
                    </div>
                `;
            default:
                return `<div class="detail-text">${activity.details}</div>`;
        }
    }

    formatNumber(number) {
        return new Intl.NumberFormat().format(number);
    }

    formatAddress(address) {
        return `${address.slice(0, 4)}...${address.slice(-4)}`;
    }
}

// 初始化活动监控
const activityMonitor = new ActivityMonitor(); 