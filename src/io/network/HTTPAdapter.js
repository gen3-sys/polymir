/**
 * POLYMIR HTTP ADAPTER
 * =====================
 * REST API client for communicating with Polymir backend
 * Handles authentication, retries, and error handling
 */

import { NetworkAdapter, NetworkEvents } from './NetworkAdapter.js';

// Simple console logger for browser compatibility
const log = {
    info: (...args) => console.log('[HTTPAdapter]', ...args),
    error: (...args) => console.error('[HTTPAdapter]', ...args),
    warn: (...args) => console.warn('[HTTPAdapter]', ...args),
    debug: (...args) => console.debug('[HTTPAdapter]', ...args)
};

// =============================================
// HTTP ADAPTER
// =============================================

export class HTTPAdapter extends NetworkAdapter {
    constructor(configOrUrl = {}) {
        // Support passing just URL string or config object
        const config = typeof configOrUrl === 'string'
            ? { baseUrl: configOrUrl }
            : configOrUrl;

        super(config);

        this.baseUrl = config.baseUrl || 'http://localhost:3000';
        this.playerId = config.playerId || null;
        this.timeout = config.timeout || 30000;
        this.retryAttempts = config.retryAttempts || 3;
        this.retryDelay = config.retryDelay || 1000;

        this.eventListeners = new Map();
    }

    /**
     * Connect (validate server is reachable)
     * @returns {Promise<void>}
     */
    async connect() {
        try {
            const response = await this.request('GET', '/health');

            if (response.status === 'healthy') {
                this.isConnected = true;
                this.emit(NetworkEvents.CONNECTED);
                log.info('Connected to server', { baseUrl: this.baseUrl });
            } else {
                throw new Error('Server health check failed');
            }

        } catch (error) {
            this.isConnected = false;
            log.error('Connection failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Disconnect
     * @returns {Promise<void>}
     */
    async disconnect() {
        this.isConnected = false;
        this.emit(NetworkEvents.DISCONNECTED);
        log.info('Disconnected from server');
    }

    /**
     * Make HTTP request
     * @param {string} method - HTTP method
     * @param {string} path - API path
     * @param {Object} data - Request body
     * @param {Object} options - Additional options
     * @returns {Promise<Object>}
     */
    async request(method, path, data = null, options = {}) {
        const url = `${this.baseUrl}${path}`;
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        // Add authentication header if playerId is set
        if (this.playerId && !options.skipAuth) {
            headers['X-Player-Id'] = this.playerId;
        }

        const requestOptions = {
            method,
            headers,
            signal: AbortSignal.timeout(this.timeout)
        };

        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            requestOptions.body = JSON.stringify(data);
        }

        let lastError;

        // Retry logic
        for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
            try {
                const response = await fetch(url, requestOptions);

                // Parse response
                const contentType = response.headers.get('content-type');
                let responseData;

                if (contentType && contentType.includes('application/json')) {
                    responseData = await response.json();
                } else {
                    responseData = await response.text();
                }

                // Handle error responses
                if (!response.ok) {
                    const error = new Error(responseData.error || responseData.message || 'Request failed');
                    error.status = response.status;
                    error.data = responseData;
                    throw error;
                }

                return responseData;

            } catch (error) {
                lastError = error;

                // Don't retry on client errors (4xx)
                if (error.status >= 400 && error.status < 500) {
                    throw error;
                }

                // Don't retry on last attempt
                if (attempt === this.retryAttempts - 1) {
                    break;
                }

                // Wait before retry
                await this.delay(this.retryDelay * (attempt + 1));
                log.warn('Retrying request', { attempt: attempt + 1, path });
            }
        }

        // All retries failed
        log.error('Request failed after retries', {
            method,
            path,
            error: lastError.message
        });

        throw lastError;
    }

    /**
     * Send (alias for request)
     * @param {Object} request
     * @returns {Promise<Object>}
     */
    async send(request) {
        return await this.request(
            request.method || 'POST',
            request.path,
            request.data,
            request.options
        );
    }

    // =============================================
    // PLAYER API
    // =============================================

    async registerPlayer(username, password = null) {
        const body = { username };
        if (password) body.password = password;
        return await this.request('POST', '/api/players/register', body);
    }

    // Alias for registerPlayer
    async register(username, password = null) {
        return this.registerPlayer(username, password);
    }

    async loginPlayer(username, password = null) {
        const body = { username };
        if (password) body.password = password;
        const response = await this.request('POST', '/api/players/login', body);

        // Store player ID for authenticated requests
        if (response.player && response.player.playerId) {
            this.playerId = response.player.playerId;
        }

        return response;
    }

    // Alias for loginPlayer
    async login(username, password = null) {
        return this.loginPlayer(username, password);
    }

    async getPlayer(playerId) {
        return await this.request('GET', `/api/players/${playerId}`);
    }

    async getPlayerProfile() {
        return await this.request('GET', '/api/players/me');
    }

    async getTrustHistory(limit = 50) {
        return await this.request('GET', `/api/players/me/trust-history?limit=${limit}`);
    }

    async getTrustLeaderboard(limit = 100) {
        return await this.request('GET', `/api/players/leaderboard?limit=${limit}`);
    }

    // =============================================
    // SCHEMATIC API
    // =============================================

    async searchSchematics(filters = {}) {
        const params = new URLSearchParams(filters).toString();
        return await this.request('GET', `/api/schematics/search?${params}`);
    }

    async getSchematic(schematicId) {
        return await this.request('GET', `/api/schematics/${schematicId}`);
    }

    async uploadSchematic(schematicData) {
        return await this.request('POST', '/api/schematics/upload', schematicData);
    }

    async downloadSchematic(schematicId) {
        const url = `${this.baseUrl}/api/schematics/${schematicId}/download`;
        const headers = {};

        if (this.playerId) {
            headers['X-Player-Id'] = this.playerId;
        }

        const response = await fetch(url, { headers });

        if (!response.ok) {
            throw new Error('Download failed');
        }

        return await response.arrayBuffer();
    }

    async recordSchematicUsage(schematicId, usageData) {
        return await this.request('POST', `/api/schematics/${schematicId}/usage`, usageData);
    }

    // =============================================
    // VALIDATION API
    // =============================================

    async requestValidation(eventType, eventData, location = {}) {
        return await this.request('POST', '/api/validation/request', {
            eventType,
            eventData,
            ...location
        });
    }

    async submitVote(consensusId, agrees, computationProof = null) {
        return await this.request('POST', `/api/validation/${consensusId}/vote`, {
            agrees,
            computationProof
        });
    }

    async getConsensusResult(consensusId) {
        return await this.request('GET', `/api/validation/${consensusId}`);
    }

    async getPendingValidations(limit = 20) {
        return await this.request('GET', `/api/validation/pending?limit=${limit}`);
    }

    async getValidationHistory(limit = 50) {
        return await this.request('GET', `/api/validation/history?limit=${limit}`);
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

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    setPlayerId(playerId) {
        this.playerId = playerId;
    }

    getPlayerId() {
        return this.playerId;
    }
}

// =============================================
// EXPORTS
// =============================================

export default HTTPAdapter;
