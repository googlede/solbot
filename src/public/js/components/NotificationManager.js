class NotificationManager {
    constructor() {
        this.container = this._createContainer();
        this.notifications = new Map();
        this.config = {
            duration: 5000,
            maxNotifications: 3
        };
    }

    _createContainer() {
        const container = document.createElement('div');
        container.className = 'notification-container';
        document.body.appendChild(container);
        return container;
    }

    show(message, type = 'info') {
        const id = Date.now().toString();
        const notification = this._createNotification(id, message, type);
        
        this.notifications.set(id, notification);
        this.container.appendChild(notification);

        // 检查并移除过多的通知
        this._checkNotificationLimit();

        // 自动移除
        setTimeout(() => this.remove(id), this.config.duration);

        return id;
    }

    _createNotification(id, message, type) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type} animate-slide-in`;
        
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">${this._getIcon(type)}</span>
                <span class="notification-message">${message}</span>
                <button class="notification-close">&times;</button>
            </div>
            <div class="notification-progress"></div>
        `;

        // 添加关闭按钮事件
        notification.querySelector('.notification-close')
            .addEventListener('click', () => this.remove(id));

        // 添加进度条动画
        const progress = notification.querySelector('.notification-progress');
        progress.style.animation = `progress ${this.config.duration}ms linear`;

        return notification;
    }

    _getIcon(type) {
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };
        return icons[type] || icons.info;
    }

    remove(id) {
        const notification = this.notifications.get(id);
        if (!notification) return;

        notification.classList.add('animate-fade-out');
        setTimeout(() => {
            this.container.removeChild(notification);
            this.notifications.delete(id);
        }, 300);
    }

    _checkNotificationLimit() {
        if (this.notifications.size > this.config.maxNotifications) {
            const [firstId] = this.notifications.keys();
            this.remove(firstId);
        }
    }

    // 显示错误提示
    error(message) {
        return this.show(message, 'error');
    }

    // 显示成功提示
    success(message) {
        return this.show(message, 'success');
    }

    // 显示警告提示
    warning(message) {
        return this.show(message, 'warning');
    }

    // 显示信息提示
    info(message) {
        return this.show(message, 'info');
    }
} 