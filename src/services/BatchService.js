const logger = require('../utils/logger');
const { Worker } = require('worker_threads');
const path = require('path');
const os = require('os');

class BatchService {
    constructor() {
        this.workerPool = [];
        this.maxWorkers = os.cpus().length;
        this.taskQueue = [];
        this.isProcessing = false;
        
        this._initializeWorkerPool();
    }

    async _initializeWorkerPool() {
        for (let i = 0; i < this.maxWorkers; i++) {
            const worker = new Worker(path.join(__dirname, '../workers/dataWorker.js'));
            worker.on('message', this._handleWorkerMessage.bind(this));
            worker.on('error', this._handleWorkerError.bind(this));
            this.workerPool.push({
                worker,
                isBusy: false
            });
        }
    }

    async processBatch(tasks, options = {}) {
        const {
            batchSize = 1000,
            timeout = 30000,
            retries = 3
        } = options;

        const results = [];
        const errors = [];

        for (let i = 0; i < tasks.length; i += batchSize) {
            const batch = tasks.slice(i, i + batchSize);
            try {
                const batchResults = await this._processBatchWithRetry(
                    batch,
                    timeout,
                    retries
                );
                results.push(...batchResults.successes);
                errors.push(...batchResults.errors);
            } catch (error) {
                logger.error('Batch processing error:', error);
                errors.push(...batch.map(task => ({
                    task,
                    error: error.message
                })));
            }
        }

        return {
            results,
            errors,
            stats: {
                total: tasks.length,
                successful: results.length,
                failed: errors.length,
                successRate: (results.length / tasks.length * 100).toFixed(2) + '%'
            }
        };
    }

    async _processBatchWithRetry(batch, timeout, retries) {
        let attempt = 0;
        let lastError;

        while (attempt <= retries) {
            try {
                const worker = await this._getAvailableWorker();
                return await this._processWithWorker(worker, batch, timeout);
            } catch (error) {
                lastError = error;
                attempt++;
                if (attempt <= retries) {
                    const delay = Math.pow(2, attempt) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw lastError;
    }

    async _getAvailableWorker() {
        const worker = this.workerPool.find(w => !w.isBusy);
        if (worker) {
            worker.isBusy = true;
            return worker;
        }

        return new Promise((resolve) => {
            this.taskQueue.push(resolve);
        });
    }

    _handleWorkerMessage(worker, message) {
        worker.isBusy = false;
        
        if (this.taskQueue.length > 0) {
            const nextTask = this.taskQueue.shift();
            worker.isBusy = true;
            nextTask(worker);
        }
    }

    _handleWorkerError(worker, error) {
        logger.error('Worker error:', error);
        worker.isBusy = false;
        
        // 重新创建worker
        const index = this.workerPool.findIndex(w => w.worker === worker.worker);
        if (index !== -1) {
            const newWorker = new Worker(path.join(__dirname, '../workers/dataWorker.js'));
            newWorker.on('message', this._handleWorkerMessage.bind(this));
            newWorker.on('error', this._handleWorkerError.bind(this));
            this.workerPool[index] = {
                worker: newWorker,
                isBusy: false
            };
        }
    }

    async _processWithWorker(worker, batch, timeout) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                worker.isBusy = false;
                reject(new Error('Worker timeout'));
            }, timeout);

            worker.worker.postMessage({ batch });

            worker.worker.once('message', (result) => {
                clearTimeout(timeoutId);
                worker.isBusy = false;
                resolve(result);
            });
        });
    }

    async shutdown() {
        await Promise.all(
            this.workerPool.map(({ worker }) => worker.terminate())
        );
    }
}

module.exports = new BatchService(); 