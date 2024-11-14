class RealtimeService {
    constructor() {
        this.eventSource = null;
        this.callbacks = new Map();
    }

    connect() {
        this.eventSource = new EventSource('/api/events');
        this.eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this._handleUpdate(data);
        };
    }

    subscribe(type, callback) {
        if (!this.callbacks.has(type)) {
            this.callbacks.set(type, new Set());
        }
        this.callbacks.get(type).add(callback);
    }

    _handleUpdate(data) {
        const callbacks = this.callbacks.get(data.type);
        if (callbacks) {
            callbacks.forEach(callback => callback(data));
        }
    }
} 