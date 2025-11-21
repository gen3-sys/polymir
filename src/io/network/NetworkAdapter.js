/**
 * POLYMIR NETWORK ADAPTER (Base Interface)
 * =========================================
 * Abstract base class for network adapters
 * Defines interface for HTTP, WebSocket, and other network protocols
 */

import { Logger } from '../../debug/Logger.js';

const log = new Logger('NetworkAdapter');

// =============================================
// NETWORK ADAPTER BASE CLASS
// =============================================

export class NetworkAdapter {
    constructor(config = {}) {
        if (new.target === NetworkAdapter) {
            throw new Error('NetworkAdapter is abstract and cannot be instantiated directly');
        }

        this.config = config;
        this.isConnected = false;
    }

    /**
     * Connect to server
     * @returns {Promise<void>}
     */
    async connect() {
        throw new Error('connect() must be implemented by subclass');
    }

    /**
     * Disconnect from server
     * @returns {Promise<void>}
     */
    async disconnect() {
        throw new Error('disconnect() must be implemented by subclass');
    }

    /**
     * Send request to server
     * @param {Object} request
     * @returns {Promise<Object>}
     */
    async send(request) {
        throw new Error('send() must be implemented by subclass');
    }

    /**
     * Check if connected
     * @returns {boolean}
     */
    getConnectionStatus() {
        return this.isConnected;
    }

    /**
     * Set event listener
     * @param {string} event
     * @param {Function} handler
     */
    on(event, handler) {
        throw new Error('on() must be implemented by subclass');
    }

    /**
     * Remove event listener
     * @param {string} event
     * @param {Function} handler
     */
    off(event, handler) {
        throw new Error('off() must be implemented by subclass');
    }
}

// =============================================
// NETWORK EVENTS
// =============================================

export const NetworkEvents = {
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    ERROR: 'error',
    MESSAGE: 'message',
    RECONNECTING: 'reconnecting'
};

// =============================================
// EXPORTS
// =============================================

export default NetworkAdapter;
