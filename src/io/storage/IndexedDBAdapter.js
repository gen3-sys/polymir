/**
 * POLYMIR INDEXEDDB ADAPTER
 * ==========================
 * IndexedDB client for local caching of schematics, player data, and world state
 * Provides persistent storage with structured data and indexing
 */

import { StorageAdapter, StorageEvents } from './StorageAdapter.js';
import { Logger } from '../../debug/Logger.js';

const log = new Logger('IndexedDBAdapter');

// =============================================
// INDEXEDDB ADAPTER
// =============================================

export class IndexedDBAdapter extends StorageAdapter {
    constructor(config = {}) {
        super(config);

        this.dbName = config.dbName || 'polymir';
        this.version = config.version || 1;
        this.storeName = config.storeName || 'default';
        this.db = null;
        this.eventListeners = new Map();
    }

    /**
     * Initialize IndexedDB
     * @returns {Promise<void>}
     */
    async initialize() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                const error = new Error('Failed to open IndexedDB');
                log.error('Initialization failed', { error: request.error });
                this.emit(StorageEvents.ERROR, error);
                reject(error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.isInitialized = true;
                log.info('IndexedDB initialized', {
                    dbName: this.dbName,
                    version: this.version,
                    storeName: this.storeName
                });
                this.emit(StorageEvents.INITIALIZED);
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create object store if it doesn't exist
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const objectStore = db.createObjectStore(this.storeName, { keyPath: 'key' });

                    // Create indexes for common queries
                    objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                    objectStore.createIndex('type', 'type', { unique: false });
                    objectStore.createIndex('size', 'size', { unique: false });

                    log.info('Object store created', { storeName: this.storeName });
                }
            };
        });
    }

    /**
     * Get value by key
     * @param {string} key
     * @returns {Promise<any>}
     */
    async get(key) {
        if (!this.isInitialized) {
            throw new Error('IndexedDB not initialized');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.get(key);

            request.onsuccess = () => {
                const record = request.result;
                resolve(record ? record.value : null);
            };

            request.onerror = () => {
                log.error('Get failed', { key, error: request.error });
                reject(request.error);
            };
        });
    }

    /**
     * Set value by key
     * @param {string} key
     * @param {any} value
     * @param {Object} metadata - Optional metadata (type, tags, etc.)
     * @returns {Promise<void>}
     */
    async set(key, value, metadata = {}) {
        if (!this.isInitialized) {
            throw new Error('IndexedDB not initialized');
        }

        return new Promise((resolve, reject) => {
            const record = {
                key,
                value,
                timestamp: Date.now(),
                type: metadata.type || 'unknown',
                size: this._estimateSize(value),
                ...metadata
            };

            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.put(record);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                if (request.error.name === 'QuotaExceededError') {
                    log.error('Quota exceeded', { key, size: record.size });
                    this.emit(StorageEvents.QUOTA_EXCEEDED, { key, size: record.size });
                } else {
                    log.error('Set failed', { key, error: request.error });
                }
                reject(request.error);
            };
        });
    }

    /**
     * Delete value by key
     * @param {string} key
     * @returns {Promise<void>}
     */
    async delete(key) {
        if (!this.isInitialized) {
            throw new Error('IndexedDB not initialized');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.delete(key);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                log.error('Delete failed', { key, error: request.error });
                reject(request.error);
            };
        });
    }

    /**
     * Clear all values
     * @returns {Promise<void>}
     */
    async clear() {
        if (!this.isInitialized) {
            throw new Error('IndexedDB not initialized');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.clear();

            request.onsuccess = () => {
                log.info('Storage cleared');
                this.emit(StorageEvents.CLEARED);
                resolve();
            };

            request.onerror = () => {
                log.error('Clear failed', { error: request.error });
                reject(request.error);
            };
        });
    }

    /**
     * Get all keys
     * @returns {Promise<string[]>}
     */
    async keys() {
        if (!this.isInitialized) {
            throw new Error('IndexedDB not initialized');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.getAllKeys();

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                log.error('Keys retrieval failed', { error: request.error });
                reject(request.error);
            };
        });
    }

    /**
     * Check if key exists
     * @param {string} key
     * @returns {Promise<boolean>}
     */
    async has(key) {
        if (!this.isInitialized) {
            throw new Error('IndexedDB not initialized');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.getKey(key);

            request.onsuccess = () => {
                resolve(request.result !== undefined);
            };

            request.onerror = () => {
                log.error('Has check failed', { key, error: request.error });
                reject(request.error);
            };
        });
    }

    /**
     * Get storage size in bytes (estimate)
     * @returns {Promise<number>}
     */
    async size() {
        if (!this.isInitialized) {
            throw new Error('IndexedDB not initialized');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.getAll();

            request.onsuccess = () => {
                const records = request.result;
                const totalSize = records.reduce((sum, record) => sum + (record.size || 0), 0);
                resolve(totalSize);
            };

            request.onerror = () => {
                log.error('Size calculation failed', { error: request.error });
                reject(request.error);
            };
        });
    }

    // =============================================
    // ADVANCED QUERIES
    // =============================================

    /**
     * Get all records by type
     * @param {string} type
     * @returns {Promise<Array>}
     */
    async getByType(type) {
        if (!this.isInitialized) {
            throw new Error('IndexedDB not initialized');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const objectStore = transaction.objectStore(this.storeName);
            const index = objectStore.index('type');
            const request = index.getAll(type);

            request.onsuccess = () => {
                resolve(request.result.map(record => ({ key: record.key, value: record.value })));
            };

            request.onerror = () => {
                log.error('Get by type failed', { type, error: request.error });
                reject(request.error);
            };
        });
    }

    /**
     * Get records older than timestamp
     * @param {number} timestamp
     * @returns {Promise<Array>}
     */
    async getOlderThan(timestamp) {
        if (!this.isInitialized) {
            throw new Error('IndexedDB not initialized');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const objectStore = transaction.objectStore(this.storeName);
            const index = objectStore.index('timestamp');
            const range = IDBKeyRange.upperBound(timestamp);
            const request = index.getAll(range);

            request.onsuccess = () => {
                resolve(request.result.map(record => ({ key: record.key, value: record.value })));
            };

            request.onerror = () => {
                log.error('Get older than failed', { timestamp, error: request.error });
                reject(request.error);
            };
        });
    }

    /**
     * Delete records older than timestamp
     * @param {number} timestamp
     * @returns {Promise<number>} - Number of records deleted
     */
    async deleteOlderThan(timestamp) {
        if (!this.isInitialized) {
            throw new Error('IndexedDB not initialized');
        }

        const oldRecords = await this.getOlderThan(timestamp);

        for (const record of oldRecords) {
            await this.delete(record.key);
        }

        log.info('Deleted old records', { count: oldRecords.length, timestamp });
        return oldRecords.length;
    }

    /**
     * Get storage quota information
     * @returns {Promise<Object>}
     */
    async getQuota() {
        if (!navigator.storage || !navigator.storage.estimate) {
            return { usage: 0, quota: 0, available: 0 };
        }

        try {
            const estimate = await navigator.storage.estimate();
            return {
                usage: estimate.usage || 0,
                quota: estimate.quota || 0,
                available: (estimate.quota || 0) - (estimate.usage || 0),
                usagePercentage: estimate.quota ? ((estimate.usage / estimate.quota) * 100).toFixed(2) : 0
            };
        } catch (error) {
            log.error('Quota check failed', { error: error.message });
            return { usage: 0, quota: 0, available: 0, usagePercentage: 0 };
        }
    }

    // =============================================
    // CACHE MANAGEMENT
    // =============================================

    /**
     * Evict least recently used items until under size limit
     * @param {number} targetSize - Target size in bytes
     * @returns {Promise<number>} - Number of items evicted
     */
    async evictLRU(targetSize) {
        if (!this.isInitialized) {
            throw new Error('IndexedDB not initialized');
        }

        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const objectStore = transaction.objectStore(this.storeName);
        const index = objectStore.index('timestamp');
        const request = index.openCursor();

        let currentSize = await this.size();
        let evicted = 0;

        return new Promise((resolve, reject) => {
            request.onsuccess = (event) => {
                const cursor = event.target.result;

                if (cursor && currentSize > targetSize) {
                    const record = cursor.value;
                    cursor.delete();
                    currentSize -= record.size || 0;
                    evicted++;
                    cursor.continue();
                } else {
                    log.info('LRU eviction complete', { evicted, currentSize, targetSize });
                    resolve(evicted);
                }
            };

            request.onerror = () => {
                log.error('LRU eviction failed', { error: request.error });
                reject(request.error);
            };
        });
    }

    // =============================================
    // EVENT HANDLING
    // =============================================

    on(event, handler) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(handler);
    }

    off(event, handler) {
        if (!this.eventListeners.has(event)) return;

        const handlers = this.eventListeners.get(event);
        const index = handlers.indexOf(handler);

        if (index !== -1) {
            handlers.splice(index, 1);
        }
    }

    emit(event, data) {
        if (!this.eventListeners.has(event)) return;

        const handlers = this.eventListeners.get(event);
        for (const handler of handlers) {
            try {
                handler(data);
            } catch (error) {
                log.error('Event handler error', { event, error: error.message });
            }
        }
    }

    // =============================================
    // UTILITIES
    // =============================================

    /**
     * Estimate size of value in bytes
     * @param {any} value
     * @returns {number}
     */
    _estimateSize(value) {
        try {
            const json = JSON.stringify(value);
            return new Blob([json]).size;
        } catch (error) {
            log.error('Size estimation failed', { error: error.message });
            return 0;
        }
    }

    /**
     * Close database connection
     * @returns {Promise<void>}
     */
    async close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.isInitialized = false;
            log.info('Database connection closed');
        }
    }

    /**
     * Delete entire database
     * @returns {Promise<void>}
     */
    async deleteDatabase() {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.isInitialized = false;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(this.dbName);

            request.onsuccess = () => {
                log.info('Database deleted', { dbName: this.dbName });
                resolve();
            };

            request.onerror = () => {
                log.error('Database deletion failed', { error: request.error });
                reject(request.error);
            };

            request.onblocked = () => {
                log.warn('Database deletion blocked - close all tabs');
            };
        });
    }
}

// =============================================
// EXPORTS
// =============================================

export default IndexedDBAdapter;
