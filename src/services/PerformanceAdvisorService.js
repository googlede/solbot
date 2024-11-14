const logger = require('../utils/logger');
const DatabaseService = require('./DatabaseService');
const PerformanceService = require('./PerformanceService');
const NotificationService = require('./NotificationService');

class PerformanceAdvisorService {
    constructor() {
        this.config = {
            // 性能指标阈值
            thresholds: {
                cpu: 80,              // CPU 使用率警告阈值
                memory: 85,           // 内存使用率警告阈值
                responseTime: 1000,   // 响应时间警告阈值（ms）
                queryTime: 500,       // 数据库查询时间警告阈值（ms）
                cacheHitRate: 0.7     // 缓存命中率警告阈值
            },
            // 检查间隔
            checkInterval: 5 * 60 * 1000,  // 5分钟
            // 建议优先级
            priority: {
                critical: 1,
                high: 2,
                medium: 3,
                low: 4
            }
        };

        // 启动性能监控
        this._startMonitoring();
    }

    // 启动性能监控
    _startMonitoring() {
        setInterval(async () => {
            try {
                const advice = await this.analyzePerformance();
                if (advice.criticalIssues.length > 0) {
                    await this._notifyIssues(advice.criticalIssues);
                }
            } catch (error) {
                logger.error('Error in performance monitoring:', error);
            }
        }, this.config.checkInterval);
    }

    // 分析性能
    async analyzePerformance() {
        const issues = {
            criticalIssues: [],
            recommendations: []
        };

        try {
            // 系统性能分析
            const systemIssues = await this._analyzeSystemPerformance();
            issues.criticalIssues.push(...systemIssues.critical);
            issues.recommendations.push(...systemIssues.recommendations);

            // 数据库性能分析
            const dbIssues = await this._analyzeDatabasePerformance();
            issues.criticalIssues.push(...dbIssues.critical);
            issues.recommendations.push(...dbIssues.recommendations);

            // 缓存性能分析
            const cacheIssues = await this._analyzeCachePerformance();
            issues.criticalIssues.push(...cacheIssues.critical);
            issues.recommendations.push(...cacheIssues.recommendations);

            // API 性能分析
            const apiIssues = await this._analyzeAPIPerformance();
            issues.criticalIssues.push(...apiIssues.critical);
            issues.recommendations.push(...apiIssues.recommendations);

            // 记录分析结果
            logger.info('Performance analysis completed', {
                criticalCount: issues.criticalIssues.length,
                recommendationCount: issues.recommendations.length
            });

            return issues;
        } catch (error) {
            logger.error('Error analyzing performance:', error);
            throw error;
        }
    }

    // 分析系统性能
    async _analyzeSystemPerformance() {
        const metrics = await PerformanceService.getPerformanceReport();
        const issues = {
            critical: [],
            recommendations: []
        };

        // 检查 CPU 使用率
        if (metrics.system.cpu.current > this.config.thresholds.cpu) {
            issues.critical.push({
                type: 'HIGH_CPU_USAGE',
                priority: this.config.priority.critical,
                metric: metrics.system.cpu.current,
                threshold: this.config.thresholds.cpu,
                recommendation: 'Consider scaling up CPU resources or optimizing CPU-intensive operations'
            });
        }

        // 检查内存使用率
        if (metrics.system.memory.current.percentage > this.config.thresholds.memory) {
            issues.critical.push({
                type: 'HIGH_MEMORY_USAGE',
                priority: this.config.priority.critical,
                metric: metrics.system.memory.current.percentage,
                threshold: this.config.thresholds.memory,
                recommendation: 'Increase memory allocation or optimize memory usage'
            });
        }

        // 检查事件循环延迟
        if (metrics.system.eventLoop.current > 100) {
            issues.recommendations.push({
                type: 'HIGH_EVENT_LOOP_LATENCY',
                priority: this.config.priority.high,
                metric: metrics.system.eventLoop.current,
                recommendation: 'Review and optimize async operations'
            });
        }

        return issues;
    }

    // 分析数据库性能
    async _analyzeDatabasePerformance() {
        const issues = {
            critical: [],
            recommendations: []
        };

        try {
            // 获取慢查询
            const slowQueries = await this._getSlowQueries();
            if (slowQueries.length > 0) {
                issues.critical.push({
                    type: 'SLOW_QUERIES',
                    priority: this.config.priority.high,
                    queries: slowQueries,
                    recommendation: 'Optimize slow queries and review indexing strategy'
                });
            }

            // 检查索引使用情况
            const unusedIndexes = await this._checkUnusedIndexes();
            if (unusedIndexes.length > 0) {
                issues.recommendations.push({
                    type: 'UNUSED_INDEXES',
                    priority: this.config.priority.medium,
                    indexes: unusedIndexes,
                    recommendation: 'Consider removing unused indexes to improve write performance'
                });
            }

            // 检查表大小和增长率
            const tableGrowth = await this._analyzeTableGrowth();
            if (tableGrowth.rapidGrowth.length > 0) {
                issues.recommendations.push({
                    type: 'RAPID_TABLE_GROWTH',
                    priority: this.config.priority.medium,
                    tables: tableGrowth.rapidGrowth,
                    recommendation: 'Implement data archiving or cleanup strategies'
                });
            }

        } catch (error) {
            logger.error('Error analyzing database performance:', error);
        }

        return issues;
    }

    // 分析缓存性能
    async _analyzeCachePerformance() {
        const issues = {
            critical: [],
            recommendations: []
        };

        try {
            const cacheStats = await this._getCacheStats();

            // 检查缓存命中率
            if (cacheStats.hitRate < this.config.thresholds.cacheHitRate) {
                issues.recommendations.push({
                    type: 'LOW_CACHE_HIT_RATE',
                    priority: this.config.priority.high,
                    metric: cacheStats.hitRate,
                    threshold: this.config.thresholds.cacheHitRate,
                    recommendation: 'Review cache strategy and consider preloading frequently accessed data'
                });
            }

            // 检查缓存驱逐率
            if (cacheStats.evictionRate > 0.1) {
                issues.recommendations.push({
                    type: 'HIGH_CACHE_EVICTION_RATE',
                    priority: this.config.priority.medium,
                    metric: cacheStats.evictionRate,
                    recommendation: 'Consider increasing cache size or optimizing cache usage'
                });
            }

        } catch (error) {
            logger.error('Error analyzing cache performance:', error);
        }

        return issues;
    }

    // 分析 API 性能
    async _analyzeAPIPerformance() {
        const issues = {
            critical: [],
            recommendations: []
        };

        try {
            const apiMetrics = await this._getAPIMetrics();

            // 检查响应时间
            if (apiMetrics.avgResponseTime > this.config.thresholds.responseTime) {
                issues.critical.push({
                    type: 'HIGH_RESPONSE_TIME',
                    priority: this.config.priority.critical,
                    metric: apiMetrics.avgResponseTime,
                    threshold: this.config.thresholds.responseTime,
                    recommendation: 'Optimize API endpoints and consider caching frequently accessed data'
                });
            }

            // 检查错误率
            if (apiMetrics.errorRate > 0.05) {
                issues.critical.push({
                    type: 'HIGH_ERROR_RATE',
                    priority: this.config.priority.critical,
                    metric: apiMetrics.errorRate,
                    recommendation: 'Investigate and fix API errors'
                });
            }

            // 检查并发请求
            if (apiMetrics.concurrentRequests > 1000) {
                issues.recommendations.push({
                    type: 'HIGH_CONCURRENT_REQUESTS',
                    priority: this.config.priority.high,
                    metric: apiMetrics.concurrentRequests,
                    recommendation: 'Implement rate limiting or scaling strategies'
                });
            }

        } catch (error) {
            logger.error('Error analyzing API performance:', error);
        }

        return issues;
    }

    // 获取慢查询
    async _getSlowQueries() {
        const { rows } = await DatabaseService.pool.query(`
            SELECT query, calls, total_time / calls as avg_time
            FROM pg_stat_statements
            WHERE total_time / calls > $1
            ORDER BY total_time / calls DESC
            LIMIT 10
        `, [this.config.thresholds.queryTime]);

        return rows;
    }

    // 检查未使用的索引
    async _checkUnusedIndexes() {
        const { rows } = await DatabaseService.pool.query(`
            SELECT schemaname, tablename, indexname, idx_scan
            FROM pg_stat_user_indexes
            WHERE idx_scan = 0
            AND NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                WHERE c.conname = indexname
            )
        `);

        return rows;
    }

    // 分析表增长
    async _analyzeTableGrowth() {
        const { rows } = await DatabaseService.pool.query(`
            SELECT relname as table_name,
                   n_live_tup as row_count,
                   pg_size_pretty(pg_total_relation_size(relid)) as total_size
            FROM pg_stat_user_tables
            ORDER BY pg_total_relation_size(relid) DESC
        `);

        return {
            tables: rows,
            rapidGrowth: rows.filter(table => table.row_count > 1000000)
        };
    }

    // 获取缓存统计
    async _getCacheStats() {
        // 实现缓存统计逻辑
        return {
            hitRate: 0.8,
            evictionRate: 0.05
        };
    }

    // 获取 API 指标
    async _getAPIMetrics() {
        // 实现 API 指标统计逻辑
        return {
            avgResponseTime: 500,
            errorRate: 0.02,
            concurrentRequests: 500
        };
    }

    // 通知问题
    async _notifyIssues(issues) {
        for (const issue of issues) {
            await NotificationService.sendSystemStatus({
                type: 'PERFORMANCE_ISSUE',
                priority: issue.priority,
                details: issue
            });
        }
    }

    // 生成优化建议报告
    async generateOptimizationReport() {
        const analysis = await this.analyzePerformance();
        
        return {
            timestamp: new Date().toISOString(),
            summary: {
                criticalIssues: analysis.criticalIssues.length,
                recommendations: analysis.recommendations.length
            },
            issues: {
                critical: analysis.criticalIssues.sort((a, b) => a.priority - b.priority),
                recommendations: analysis.recommendations.sort((a, b) => a.priority - b.priority)
            },
            metrics: await PerformanceService.getPerformanceReport()
        };
    }
}

module.exports = new PerformanceAdvisorService(); 