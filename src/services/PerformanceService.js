const logger = require('../utils/logger');
const os = require('os');
const v8 = require('v8');

class PerformanceService {
    constructor() {
        this.metrics = {
            cpu: new Map(),         // CPU 使用率历史
            memory: new Map(),      // 内存使用历史
            eventLoop: new Map(),   // 事件循环延迟历史
            gc: new Map(),          // GC 统计
            requests: new Map()     // 请求性能统计
        };

        this.config = {
            sampleInterval: 5000,   // 采样间隔：5秒
            historyLength: 720,     // 保存历史长度：1小时
            alertThresholds: {
                cpu: 80,            // CPU 使用率警告阈值
                memory: 85,         // 内存使用率警告阈值
                eventLoop: 1000,    // 事件循环延迟警告阈值（ms）
                requestTime: 5000   // 请求处理时间警告阈值（ms）
            }
        };

        // 启动性能监控
        this._startMonitoring();
    }

    // 启动监控
    _startMonitoring() {
        // CPU 和内存监控
        setInterval(() => {
            this._sampleSystemMetrics();
        }, this.config.sampleInterval);

        // 事件循环监控
        this._monitorEventLoop();

        // GC 监控
        this._monitorGC();
    }

    // 采样系统指标
    _sampleSystemMetrics() {
        const now = Date.now();

        // CPU 使用率
        const cpuUsage = this._getCPUUsage();
        this.metrics.cpu.set(now, cpuUsage);

        // 内存使用率
        const memoryUsage = this._getMemoryUsage();
        this.metrics.memory.set(now, memoryUsage);

        // 清理旧数据
        this._cleanupOldMetrics();

        // 检查是否需要报警
        this._checkAlerts(cpuUsage, memoryUsage);
    }

    // 获取 CPU 使用率
    _getCPUUsage() {
        const cpus = os.cpus();
        const totalCPU = cpus.reduce((acc, cpu) => {
            for (let type in cpu.times) {
                acc[type] = (acc[type] || 0) + cpu.times[type];
            }
            return acc;
        }, {});

        const total = Object.values(totalCPU).reduce((a, b) => a + b);
        const idle = totalCPU.idle;
        return ((total - idle) / total) * 100;
    }

    // 获取内存使用率
    _getMemoryUsage() {
        const used = process.memoryUsage();
        const total = os.totalmem();
        return {
            heapUsed: used.heapUsed,
            heapTotal: used.heapTotal,
            rss: used.rss,
            external: used.external,
            arrayBuffers: used.arrayBuffers,
            percentage: (used.rss / total) * 100
        };
    }

    // 监控事件循环延迟
    _monitorEventLoop() {
        let lastCheck = Date.now();
        setInterval(() => {
            const now = Date.now();
            const delay = now - lastCheck - 1;
            this.metrics.eventLoop.set(now, delay);
            lastCheck = now;

            if (delay > this.config.alertThresholds.eventLoop) {
                logger.warn('High event loop latency detected', { delay });
            }
        }, 1);
    }

    // 监控垃圾回收
    _monitorGC() {
        let gcStats = {
            totalTime: 0,
            count: 0
        };

        const gc = v8.getHeapStatistics();
        this.metrics.gc.set(Date.now(), {
            ...gcStats,
            heapSize: gc.total_heap_size,
            heapSizeLimit: gc.heap_size_limit,
            totalAvailable: gc.total_available_size
        });
    }

    // 记录请求性能
    recordRequestMetrics(req, res, duration) {
        const path = req.path;
        if (!this.metrics.requests.has(path)) {
            this.metrics.requests.set(path, {
                count: 0,
                totalTime: 0,
                min: Infinity,
                max: 0,
                statusCodes: new Map()
            });
        }

        const metrics = this.metrics.requests.get(path);
        metrics.count++;
        metrics.totalTime += duration;
        metrics.min = Math.min(metrics.min, duration);
        metrics.max = Math.max(metrics.max, duration);

        const statusCode = res.statusCode;
        metrics.statusCodes.set(
            statusCode,
            (metrics.statusCodes.get(statusCode) || 0) + 1
        );

        // 检查是否需要报警
        if (duration > this.config.alertThresholds.requestTime) {
            logger.warn('Slow request detected', {
                path,
                duration,
                statusCode
            });
        }
    }

    // 清理旧指标数据
    _cleanupOldMetrics() {
        const cutoff = Date.now() - (this.config.sampleInterval * this.config.historyLength);
        
        for (const [timestamp] of this.metrics.cpu) {
            if (timestamp < cutoff) {
                this.metrics.cpu.delete(timestamp);
            }
        }

        for (const [timestamp] of this.metrics.memory) {
            if (timestamp < cutoff) {
                this.metrics.memory.delete(timestamp);
            }
        }

        for (const [timestamp] of this.metrics.eventLoop) {
            if (timestamp < cutoff) {
                this.metrics.eventLoop.delete(timestamp);
            }
        }
    }

    // 检查警报
    _checkAlerts(cpuUsage, memoryUsage) {
        if (cpuUsage > this.config.alertThresholds.cpu) {
            logger.warn('High CPU usage detected', { cpuUsage });
        }

        if (memoryUsage.percentage > this.config.alertThresholds.memory) {
            logger.warn('High memory usage detected', { memoryUsage });
        }
    }

    // 获取性能报告
    getPerformanceReport() {
        const now = Date.now();
        return {
            timestamp: now,
            system: {
                cpu: {
                    current: this._getCPUUsage(),
                    history: Array.from(this.metrics.cpu.entries())
                        .filter(([time]) => now - time < 3600000)
                },
                memory: {
                    current: this._getMemoryUsage(),
                    history: Array.from(this.metrics.memory.entries())
                        .filter(([time]) => now - time < 3600000)
                },
                eventLoop: {
                    current: this.metrics.eventLoop.get(
                        Math.max(...this.metrics.eventLoop.keys())
                    ),
                    history: Array.from(this.metrics.eventLoop.entries())
                        .filter(([time]) => now - time < 3600000)
                }
            },
            gc: Array.from(this.metrics.gc.entries())
                .filter(([time]) => now - time < 3600000),
            requests: Array.from(this.metrics.requests.entries())
                .map(([path, metrics]) => ({
                    path,
                    metrics: {
                        count: metrics.count,
                        avgTime: metrics.totalTime / metrics.count,
                        min: metrics.min,
                        max: metrics.max,
                        statusCodes: Object.fromEntries(metrics.statusCodes)
                    }
                }))
        };
    }

    // 获取健康状态
    getHealthStatus() {
        const cpuUsage = this._getCPUUsage();
        const memoryUsage = this._getMemoryUsage();
        const eventLoopDelay = this.metrics.eventLoop.get(
            Math.max(...this.metrics.eventLoop.keys())
        );

        return {
            healthy: cpuUsage < this.config.alertThresholds.cpu &&
                    memoryUsage.percentage < this.config.alertThresholds.memory &&
                    eventLoopDelay < this.config.alertThresholds.eventLoop,
            metrics: {
                cpu: cpuUsage,
                memory: memoryUsage,
                eventLoop: eventLoopDelay
            }
        };
    }
}

module.exports = new PerformanceService(); 