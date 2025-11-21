/**
 * POLYMIR WEBSOCKET ADAPTER
 * ==========================
 * Real-time WebSocket client for Polymir backend
 * Handles authentication, reconnection, and message routing
 */

import { NetworkAdapter, NetworkEvents } from './NetworkAdapter.js';
import { Logger } from '../../debug/Logger.js';

const log = new Logger('WebSocketAdapter');

// =============================================
// WEBSOCKET ADAPTER
// =============================================

export class WebSocketAdapter extends NetworkAdapter {
    constructor(config = {}) {
        super(config);

        this.url = config.url || 'ws://localhost:3001';
        this.playerId = config.playerId || null;
        this.autoReconnect = config.autoReconnect !== false;
        this.reconnectDelay = config.reconnectDelay || 3000;
        this.maxReconnectDelay = config.maxReconnectDelay || 30000;
        this.pingInterval = config.pingInterval || 30000;

        this.ws = null;
        this.connectionId = null;
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.pingTimer = null;
        this.eventListeners = new Map();
        this.isAuthenticated = false;
    }

    /**
     * Connect to WebSocket server
     * @returns {Promise<void>}
     */
    async connect() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.url);

                this.ws.onopen = () => {
                    log.info('WebSocket connected', { url: this.url });
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.startPing();
                    this.emit(NetworkEvents.CONNECTED);
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data);
                };

                this.ws.onerror = (error) => {
                    log.error('WebSocket error', { error });
                    this.emit(NetworkEvents.ERROR, error);
                };

                this.ws.onclose = (event) => {
                    log.info('WebSocket closed', { code: event.code, reason: event.reason });
                    this.handleClose();
                };

                // Wait for welcome message
                const welcomeHandler = (message) => {
                    if (message.type === 'welcome') {
                        this.connectionId = message.connectionId;
                        this.off('message', welcomeHandler);
                        resolve();
                    }
                };

                this.on('message', welcomeHandler);

                // Timeout if no welcome message
                setTimeout(() => {
                    if (!this.connectionId) {
                        this.off('message', welcomeHandler);
                        reject(new Error('Connection timeout - no welcome message'));
                    }
                }, 5000);

            } catch (error) {
                log.error('Connection failed', { error: error.message });
                reject(error);
            }
        });
    }

    /**
     * Disconnect from WebSocket server
     * @returns {Promise<void>}
     */
    async disconnect() {
        this.autoReconnect = false;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        this.stopPing();

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.send({ type: 'disconnect' });
            this.ws.close(1000, 'Client disconnect');
        }

        this.isConnected = false;
        this.isAuthenticated = false;
        this.emit(NetworkEvents.DISCONNECTED);
    }

    /**
     * Send message to server
     * @param {Object} message
     * @returns {Promise<void>}
     */
    async send(message) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket not connected');
        }

        this.ws.send(JSON.stringify(message));
    }

    /**
     * Handle incoming message
     * @param {string} data
     */
    handleMessage(data) {
        try {
            const message = JSON.parse(data);

            // Emit specific message type
            this.emit(message.type, message);

            // Emit generic message event
            this.emit(NetworkEvents.MESSAGE, message);

            // Handle special messages
            switch (message.type) {
                case 'authenticated':
                    this.isAuthenticated = true;
                    log.info('Authenticated', { player: message.player });
                    break;

                case 'auth_error':
                    log.error('Authentication failed', { error: message.error });
                    break;

                case 'error':
                    log.error('Server error', { error: message.error });
                    break;

                case 'pong':
                    // Pong received, connection is alive
                    break;
            }

        } catch (error) {
            log.error('Failed to parse message', { error: error.message });
        }
    }

    /**
     * Handle connection close
     */
    handleClose() {
        this.isConnected = false;
        this.isAuthenticated = false;
        this.stopPing();
        this.emit(NetworkEvents.DISCONNECTED);

        // Auto-reconnect
        if (this.autoReconnect) {
            this.scheduleReconnect();
        }
    }

    /**
     * Schedule reconnection attempt
     */
    scheduleReconnect() {
        if (this.reconnectTimer) {
            return;
        }

        const delay = Math.min(
            this.reconnectDelay * Math.pow(2, this.reconnectAttempts),
            this.maxReconnectDelay
        );

        log.info('Scheduling reconnect', {
            attempt: this.reconnectAttempts + 1,
            delay: `${delay}ms`
        });

        this.emit(NetworkEvents.RECONNECTING, {
            attempt: this.reconnectAttempts + 1,
            delay
        });

        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            this.reconnectAttempts++;

            try {
                await this.connect();

                // Re-authenticate if we have playerId
                if (this.playerId) {
                    await this.authenticate(this.playerId);
                }

            } catch (error) {
                log.error('Reconnect failed', { error: error.message });
            }
        }, delay);
    }

    /**
     * Start ping interval
     */
    startPing() {
        this.stopPing();

        this.pingTimer = setInterval(() => {
            if (this.isConnected) {
                this.send({ type: 'ping', timestamp: Date.now() });
            }
        }, this.pingInterval);
    }

    /**
     * Stop ping interval
     */
    stopPing() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    // =============================================
    // AUTHENTICATION
    // =============================================

    async authenticate(playerId) {
        this.playerId = playerId;
        await this.send({ type: 'authenticate', playerId });

        return new Promise((resolve, reject) => {
            const authHandler = (message) => {
                this.off('authenticated', authHandler);
                this.off('auth_error', errorHandler);
                resolve(message);
            };

            const errorHandler = (message) => {
                this.off('authenticated', authHandler);
                this.off('auth_error', errorHandler);
                reject(new Error(message.error));
            };

            this.on('authenticated', authHandler);
            this.on('auth_error', errorHandler);

            setTimeout(() => {
                this.off('authenticated', authHandler);
                this.off('auth_error', errorHandler);
                reject(new Error('Authentication timeout'));
            }, 5000);
        });
    }

    // =============================================
    // POSITION UPDATES
    // =============================================

    async updatePosition(position) {
        await this.send({
            type: 'position_update',
            ...position,
            timestamp: Date.now()
        });
    }

    async requestPositions(megachunkId = null, bodyId = null) {
        await this.send({
            type: 'request_positions',
            megachunkId,
            bodyId
        });
    }

    async teleport(position) {
        await this.send({
            type: 'teleport',
            ...position
        });
    }

    // =============================================
    // SUBSCRIPTIONS
    // =============================================

    async subscribeMegachunk(megachunkId) {
        await this.send({
            type: 'subscribe_megachunk',
            megachunkId
        });
    }

    async unsubscribeMegachunk(megachunkId) {
        await this.send({
            type: 'unsubscribe_megachunk',
            megachunkId
        });
    }

    async subscribeBody(bodyId) {
        await this.send({
            type: 'subscribe_body',
            bodyId
        });
    }

    async unsubscribeBody(bodyId) {
        await this.send({
            type: 'unsubscribe_body',
            bodyId
        });
    }

    async listSubscriptions() {
        await this.send({
            type: 'list_subscriptions'
        });
    }

    async clearSubscriptions() {
        await this.send({
            type: 'clear_subscriptions'
        });
    }

    // =============================================
    // VALIDATION
    // =============================================

    async requestValidation(eventType, eventDataCid, location = {}) {
        await this.send({
            type: 'validation_request',
            eventType,
            eventDataCid,
            ...location
        });
    }

    async submitVote(consensusId, agrees, computationProofCid = null) {
        await this.send({
            type: 'validation_vote',
            consensusId,
            agrees,
            computationProofCid
        });
    }

    async getValidationStatus(consensusId) {
        await this.send({
            type: 'validation_status',
            consensusId
        });
    }

    // =============================================
    // DAMAGE MAP / BUILD SYSTEM
    // =============================================

    /**
     * Send single voxel damage update
     * @param {Object} damage - Damage entry
     */
    async sendDamageUpdate(damage) {
        await this.send({
            type: 'damage_update',
            bodyId: damage.bodyId,
            voxelX: damage.voxelX,
            voxelY: damage.voxelY,
            voxelZ: damage.voxelZ,
            layerId: damage.layerId || 0,
            changeType: damage.changeType, // 'add' or 'remove'
            voxelType: damage.voxelType,
            voxelColor: damage.voxelColor,
            buildMode: damage.buildMode || 'new_schematic',
            attachedSchematicPlacementId: damage.attachedSchematicPlacementId,
            clientTimestamp: Date.now()
        });
    }

    /**
     * Send batch of damage updates
     * @param {string} bodyId
     * @param {Array} changes - Array of voxel changes
     * @param {string} buildMode
     */
    async sendBatchDamage(bodyId, changes, buildMode = 'new_schematic') {
        await this.send({
            type: 'batch_damage',
            bodyId,
            changes: changes.map(c => ({
                x: c.x,
                y: c.y,
                z: c.z,
                layerId: c.layerId || 0,
                changeType: c.changeType,
                voxelType: c.voxelType,
                voxelColor: c.voxelColor,
                attachedSchematicPlacementId: c.attachedSchematicPlacementId
            })),
            buildMode,
            clientTimestamp: Date.now()
        });
    }

    /**
     * Set player's build mode
     * @param {string} buildMode - 'new_schematic' | 'extend_build' | 'raw_damage'
     * @param {string} extendingPlacementId - If extend_build, which placement
     */
    async setBuildMode(buildMode, extendingPlacementId = null) {
        await this.send({
            type: 'set_build_mode',
            buildMode,
            extendingPlacementId
        });
    }

    /**
     * Request damage map for a body
     * @param {string} bodyId
     * @param {number} layerId - Optional layer filter
     */
    async requestDamageMap(bodyId, layerId = null) {
        await this.send({
            type: 'request_damage_map',
            bodyId,
            layerId
        });
    }

    /**
     * Undo a damage entry
     * @param {string} historyId
     * @param {string} bodyId
     */
    async undoDamage(historyId, bodyId) {
        await this.send({
            type: 'undo_damage',
            historyId,
            bodyId
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

    setPlayerId(playerId) {
        this.playerId = playerId;
    }

    getPlayerId() {
        return this.playerId;
    }

    getConnectionId() {
        return this.connectionId;
    }
}

// =============================================
// EXPORTS
// =============================================

export default WebSocketAdapter;
