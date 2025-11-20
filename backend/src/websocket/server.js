/**
 * POLYMIR WEBSOCKET SERVER
 * =========================
 * Real-time WebSocket server for player positions, subscriptions, and validation
 * Handles bidirectional communication for world state updates
 */

import { WebSocketServer } from 'ws';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

// =============================================
// WEBSOCKET SERVER CLASS
// =============================================

export class PolymirWebSocketServer {
    constructor(config = {}) {
        this.config = {
            port: config.port || 3001,
            host: config.host || '0.0.0.0',
            pingInterval: config.pingInterval || 30000, // 30 seconds
            pingTimeout: config.pingTimeout || 5000, // 5 seconds
            maxConnections: config.maxConnections || 1000,
            ...config
        };

        this.wss = null;
        this.clients = new Map(); // connectionId -> client info
        this.playerConnections = new Map(); // playerId -> connectionId
        this.messageHandlers = new Map(); // messageType -> handler function

        this.log = logger.child('WebSocket');
    }

    /**
     * Initialize WebSocket server
     * @param {Object} httpServer - Optional HTTP server to attach to
     */
    async initialize(httpServer = null) {
        try {
            const wsOptions = httpServer
                ? { server: httpServer }
                : { port: this.config.port, host: this.config.host };

            this.wss = new WebSocketServer(wsOptions);

            this.setupServerHandlers();
            this.startHeartbeat();

            const serverInfo = httpServer
                ? `attached to HTTP server`
                : `${this.config.host}:${this.config.port}`;

            this.log.info(`WebSocket server initialized on ${serverInfo}`);

        } catch (error) {
            this.log.error('Failed to initialize WebSocket server', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Set up server-level event handlers
     */
    setupServerHandlers() {
        this.wss.on('connection', (ws, request) => {
            this.handleConnection(ws, request);
        });

        this.wss.on('error', (error) => {
            this.log.error('WebSocket server error', {
                error: error.message
            });
        });

        this.wss.on('close', () => {
            this.log.info('WebSocket server closed');
        });
    }

    /**
     * Handle new WebSocket connection
     * @param {WebSocket} ws
     * @param {Object} request
     */
    handleConnection(ws, request) {
        // Check max connections
        if (this.clients.size >= this.config.maxConnections) {
            ws.close(1008, 'Server at maximum capacity');
            this.log.warn('Connection rejected - max capacity reached');
            return;
        }

        const connectionId = uuidv4();
        const clientIp = request.socket.remoteAddress;

        // Create client info
        const clientInfo = {
            connectionId,
            ws,
            playerId: null,
            isAuthenticated: false,
            ip: clientIp,
            connectedAt: Date.now(),
            lastPong: Date.now(),
            subscriptions: {
                megachunks: new Set(),
                bodies: new Set()
            }
        };

        this.clients.set(connectionId, clientInfo);

        this.log.info('Client connected', {
            connectionId,
            ip: clientIp,
            totalClients: this.clients.size
        });

        // Set up client handlers
        this.setupClientHandlers(ws, clientInfo);

        // Send welcome message
        this.sendToClient(connectionId, {
            type: 'welcome',
            connectionId,
            serverTime: Date.now()
        });
    }

    /**
     * Set up client-level event handlers
     * @param {WebSocket} ws
     * @param {Object} clientInfo
     */
    setupClientHandlers(ws, clientInfo) {
        const { connectionId } = clientInfo;

        // Message handler
        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                await this.handleMessage(connectionId, message);
            } catch (error) {
                this.log.error('Failed to handle message', {
                    connectionId,
                    error: error.message
                });

                this.sendToClient(connectionId, {
                    type: 'error',
                    error: 'Invalid message format',
                    message: error.message
                });
            }
        });

        // Pong handler (for heartbeat)
        ws.on('pong', () => {
            clientInfo.lastPong = Date.now();
        });

        // Close handler
        ws.on('close', (code, reason) => {
            this.handleDisconnection(connectionId, code, reason);
        });

        // Error handler
        ws.on('error', (error) => {
            this.log.error('Client error', {
                connectionId,
                error: error.message
            });
        });
    }

    /**
     * Handle incoming message from client
     * @param {string} connectionId
     * @param {Object} message
     */
    async handleMessage(connectionId, message) {
        const { type } = message;

        if (!type) {
            this.sendToClient(connectionId, {
                type: 'error',
                error: 'Missing message type'
            });
            return;
        }

        this.log.trace('Message received', {
            connectionId,
            type
        });

        // Get handler for message type
        const handler = this.messageHandlers.get(type);

        if (!handler) {
            this.sendToClient(connectionId, {
                type: 'error',
                error: 'Unknown message type',
                messageType: type
            });
            return;
        }

        try {
            await handler(connectionId, message, this);
        } catch (error) {
            this.log.error('Message handler error', {
                connectionId,
                type,
                error: error.message
            });

            this.sendToClient(connectionId, {
                type: 'error',
                error: 'Failed to process message',
                messageType: type,
                details: error.message
            });
        }
    }

    /**
     * Handle client disconnection
     * @param {string} connectionId
     * @param {number} code
     * @param {string} reason
     */
    handleDisconnection(connectionId, code, reason) {
        const clientInfo = this.clients.get(connectionId);

        if (!clientInfo) return;

        this.log.info('Client disconnected', {
            connectionId,
            playerId: clientInfo.playerId,
            code,
            reason: reason.toString(),
            totalClients: this.clients.size - 1
        });

        // Remove player connection mapping
        if (clientInfo.playerId) {
            this.playerConnections.delete(clientInfo.playerId);
        }

        // Clean up subscriptions
        clientInfo.subscriptions.megachunks.clear();
        clientInfo.subscriptions.bodies.clear();

        // Remove client
        this.clients.delete(connectionId);
    }

    /**
     * Register message handler
     * @param {string} type - Message type
     * @param {Function} handler - Handler function
     */
    registerHandler(type, handler) {
        this.messageHandlers.set(type, handler);
        this.log.debug('Handler registered', { type });
    }

    /**
     * Send message to specific client
     * @param {string} connectionId
     * @param {Object} message
     */
    sendToClient(connectionId, message) {
        const clientInfo = this.clients.get(connectionId);

        if (!clientInfo || clientInfo.ws.readyState !== 1) {
            return false;
        }

        try {
            clientInfo.ws.send(JSON.stringify(message));
            return true;
        } catch (error) {
            this.log.error('Failed to send message', {
                connectionId,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Send message to player (by player ID)
     * @param {string} playerId
     * @param {Object} message
     */
    sendToPlayer(playerId, message) {
        const connectionId = this.playerConnections.get(playerId);

        if (!connectionId) {
            return false;
        }

        return this.sendToClient(connectionId, message);
    }

    /**
     * Broadcast message to all authenticated clients
     * @param {Object} message
     * @param {Function} filter - Optional filter function
     */
    broadcast(message, filter = null) {
        let sentCount = 0;

        for (const [connectionId, clientInfo] of this.clients) {
            if (!clientInfo.isAuthenticated) continue;

            if (filter && !filter(clientInfo)) continue;

            if (this.sendToClient(connectionId, message)) {
                sentCount++;
            }
        }

        return sentCount;
    }

    /**
     * Broadcast to players subscribed to a megachunk
     * @param {string} megachunkId
     * @param {Object} message
     */
    broadcastToMegachunk(megachunkId, message) {
        return this.broadcast(message, (clientInfo) => {
            return clientInfo.subscriptions.megachunks.has(megachunkId);
        });
    }

    /**
     * Broadcast to players subscribed to a celestial body
     * @param {string} bodyId
     * @param {Object} message
     */
    broadcastToBody(bodyId, message) {
        return this.broadcast(message, (clientInfo) => {
            return clientInfo.subscriptions.bodies.has(bodyId);
        });
    }

    /**
     * Get client info
     * @param {string} connectionId
     * @returns {Object|null}
     */
    getClient(connectionId) {
        return this.clients.get(connectionId) || null;
    }

    /**
     * Get connection by player ID
     * @param {string} playerId
     * @returns {string|null}
     */
    getConnectionByPlayer(playerId) {
        return this.playerConnections.get(playerId) || null;
    }

    /**
     * Get server statistics
     * @returns {Object}
     */
    getStats() {
        let authenticatedCount = 0;
        let totalSubscriptions = 0;

        for (const clientInfo of this.clients.values()) {
            if (clientInfo.isAuthenticated) authenticatedCount++;
            totalSubscriptions += clientInfo.subscriptions.megachunks.size;
            totalSubscriptions += clientInfo.subscriptions.bodies.size;
        }

        return {
            totalConnections: this.clients.size,
            authenticatedConnections: authenticatedCount,
            totalSubscriptions,
            maxConnections: this.config.maxConnections
        };
    }

    /**
     * Start heartbeat ping/pong
     */
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            const now = Date.now();
            const timeout = this.config.pingTimeout;

            for (const [connectionId, clientInfo] of this.clients) {
                // Check if client responded to last ping
                if (now - clientInfo.lastPong > this.config.pingInterval + timeout) {
                    this.log.warn('Client heartbeat timeout', { connectionId });
                    clientInfo.ws.terminate();
                    continue;
                }

                // Send ping
                if (clientInfo.ws.readyState === 1) {
                    clientInfo.ws.ping();
                }
            }
        }, this.config.pingInterval);

        this.log.debug('Heartbeat started', {
            interval: this.config.pingInterval,
            timeout: this.config.pingTimeout
        });
    }

    /**
     * Stop heartbeat
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Gracefully close server
     * @returns {Promise<void>}
     */
    async close() {
        this.log.info('Closing WebSocket server...');

        this.stopHeartbeat();

        // Close all client connections
        for (const [connectionId, clientInfo] of this.clients) {
            clientInfo.ws.close(1001, 'Server shutting down');
        }

        // Close server
        return new Promise((resolve, reject) => {
            if (!this.wss) {
                resolve();
                return;
            }

            this.wss.close((error) => {
                if (error) {
                    this.log.error('Error closing WebSocket server', {
                        error: error.message
                    });
                    reject(error);
                } else {
                    this.log.info('WebSocket server closed');
                    resolve();
                }
            });
        });
    }
}

// =============================================
// EXPORTS
// =============================================

export default PolymirWebSocketServer;
