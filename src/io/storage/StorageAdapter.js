/**
 * POLYMIR STORAGE ADAPTER (Base Interface)
 * =========================================
 * Abstract base class for storage adapters
 * Defines interface for IndexedDB, localStorage, and other storage mechanisms
 */

import { Logger } from '../../debug/Logger.js';

const log = new Logger('StorageAdapter');

// =============================================
// STORAGE ADAPTER BASE CLASS
// =============================================

export class StorageAdapter {
    constructor(config = {}) {
        if (new.target === StorageAdapter) {
            throw new Error('StorageAdapter is abstract and cannot be instantiated directly');
        }

        this.config = config;
        this.isInitialized = false;
    }

    /**
     * Initialize storage
     * @returns {Promise<void>}
     */
    async initialize() {
        throw new Error('initialize() must be implemented by subclass');
    }

    /**
     * Get value by key
     * @param {string} key
     * @returns {Promise<any>}
     */
    async get(key) {
        throw new Error('get() must be implemented by subclass');
    }

    /**
     * Set value by key
     * @param {string} key
     * @param {any} value
     * @returns {Promise<void>}
     */
    async set(key, value) {
        throw new Error('set() must be implemented by subclass');
    }

    /**
     * Delete value by key
     * @param {string} key
     * @returns {Promise<void>}
     */
    async delete(key) {
        throw new Error('delete() must be implemented by subclass');
    }

    /**
     * Clear all values
     * @returns {Promise<void>}
     */
    async clear() {
        throw new Error('clear() must be implemented by subclass');
    }

    /**
     * Get all keys
     * @returns {Promise<string[]>}
     */
    async keys() {
        throw new Error('keys() must be implemented by subclass');
    }

    /**
     * Check if key exists
     * @param {string} key
     * @returns {Promise<boolean>}
     */
    async has(key) {
        throw new Error('has() must be implemented by subclass');
    }

    /**
     * Get storage size in bytes (estimate)
     * @returns {Promise<number>}
     */
    async size() {
        throw new Error('size() must be implemented by subclass');
    }

    /**
     * Check if initialized
     * @returns {boolean}
     */
    getInitializationStatus() {
        return this.isInitialized;
    }
}

// =============================================
// STORAGE EVENTS
// =============================================

export const StorageEvents = {
    INITIALIZED: 'initialized',
    ERROR: 'error',
    QUOTA_EXCEEDED: 'quota_exceeded',
    CLEARED: 'cleared'
};

// =============================================
// EXPORTS
// =============================================

export default StorageAdapter;
