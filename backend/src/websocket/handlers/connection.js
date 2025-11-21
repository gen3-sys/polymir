/**
 * POLYMIR WEBSOCKET CONNECTION HANDLER
 * =====================================
 * Handles player authentication and connection management
 */

import logger from '../../utils/logger.js';

const log = logger.child('WS:Connection');

// =============================================
// CONNECTION HANDLER
// =============================================

/**
 * Create connection handler with database dependency injection
 * @param {Object} centralLibraryDB - Central Library database adapter
 * @param {Object} worldServerDB - World Server database adapter
 * @returns {Function} Handler function
 */
export function createConnectionHandler(centralLibraryDB, worldServerDB) {
    /**
     * Handle 'authenticate' message
     * @param {string} connectionId
     * @param {Object} message
     * @param {Object} wsServer - WebSocket server instance
     */
    return async function handleAuthenticate(connectionId, message, wsServer) {
        const { playerId } = message;

        if (!playerId) {
            wsServer.sendToClient(connectionId, {
                type: 'auth_error',
                error: 'Missing playerId'
            });
            return;
        }

        try {
            // Verify player exists in Central Library
            const player = await centralLibraryDB.getPlayerById(playerId);

            if (!player) {
                wsServer.sendToClient(connectionId, {
                    type: 'auth_error',
                    error: 'Invalid playerId',
                    message: 'Player not found'
                });
                return;
            }

            // Get client info
            const clientInfo = wsServer.getClient(connectionId);

            if (!clientInfo) {
                log.error('Client not found for authentication', { connectionId });
                return;
            }

            // Check if player already connected (disconnect old connection)
            const existingConnectionId = wsServer.getConnectionByPlayer(playerId);
            if (existingConnectionId && existingConnectionId !== connectionId) {
                log.warn('Player already connected, disconnecting old connection', {
                    playerId,
                    oldConnectionId: existingConnectionId,
                    newConnectionId: connectionId
                });

                wsServer.sendToClient(existingConnectionId, {
                    type: 'disconnected',
                    reason: 'Connected from another location'
                });

                const oldClient = wsServer.getClient(existingConnectionId);
                if (oldClient) {
                    oldClient.ws.close(1000, 'Duplicate connection');
                }

                wsServer.playerConnections.delete(playerId);
            }

            // Update client info
            clientInfo.playerId = playerId;
            clientInfo.isAuthenticated = true;

            // Register player connection
            wsServer.playerConnections.set(playerId, connectionId);

            // Get or create player position in world
            let playerPosition = await worldServerDB.getPlayerPosition(playerId);

            if (!playerPosition) {
                // Create initial position (spawn point)
                await worldServerDB.upsertPlayerPosition(playerId, {
                    positionX: 0,
                    positionY: 100,
                    positionZ: 0,
                    velocityX: 0,
                    velocityY: 0,
                    velocityZ: 0,
                    rotationX: 0,
                    rotationY: 0,
                    rotationZ: 0,
                    rotationW: 1,
                    isOnline: true,
                    websocketConnectionId: connectionId
                });

                playerPosition = await worldServerDB.getPlayerPosition(playerId);
            } else {
                // Update online status
                await worldServerDB.upsertPlayerPosition(playerId, {
                    ...playerPosition,
                    isOnline: true,
                    websocketConnectionId: connectionId
                });
            }

            log.info('Player authenticated', {
                connectionId,
                playerId,
                username: player.username,
                trustScore: player.trust_score
            });

            // Send authentication success
            wsServer.sendToClient(connectionId, {
                type: 'authenticated',
                player: {
                    playerId: player.player_id,
                    username: player.username,
                    trustScore: player.trust_score
                },
                position: playerPosition,
                serverTime: Date.now()
            });

        } catch (error) {
            log.error('Authentication failed', {
                connectionId,
                error: error.message
            });

            wsServer.sendToClient(connectionId, {
                type: 'auth_error',
                error: 'Authentication failed',
                message: error.message
            });
        }
    };
}

/**
 * Create disconnect handler
 * @param {Object} worldServerDB - World Server database adapter
 * @returns {Function} Handler function
 */
export function createDisconnectHandler(worldServerDB) {
    /**
     * Handle 'disconnect' message (graceful disconnect)
     * @param {string} connectionId
     * @param {Object} message
     * @param {Object} wsServer
     */
    return async function handleDisconnect(connectionId, message, wsServer) {
        const clientInfo = wsServer.getClient(connectionId);

        if (!clientInfo) {
            return;
        }

        const { playerId } = clientInfo;

        if (playerId) {
            try {
                // Mark player offline
                await worldServerDB.markPlayerOffline(playerId);

                log.info('Player disconnected gracefully', {
                    connectionId,
                    playerId
                });

            } catch (error) {
                log.error('Failed to mark player offline', {
                    connectionId,
                    playerId,
                    error: error.message
                });
            }
        }

        // Close connection
        wsServer.sendToClient(connectionId, {
            type: 'goodbye',
            message: 'Disconnected'
        });

        clientInfo.ws.close(1000, 'Client requested disconnect');
    };
}

/**
 * Create ping handler
 * @returns {Function} Handler function
 */
export function createPingHandler() {
    /**
     * Handle 'ping' message
     * @param {string} connectionId
     * @param {Object} message
     * @param {Object} wsServer
     */
    return async function handlePing(connectionId, message, wsServer) {
        wsServer.sendToClient(connectionId, {
            type: 'pong',
            timestamp: message.timestamp || Date.now(),
            serverTime: Date.now()
        });
    };
}

// =============================================
// HANDLER REGISTRATION
// =============================================

/**
 * Register all connection handlers
 * @param {Object} wsServer - WebSocket server instance
 * @param {Object} centralLibraryDB
 * @param {Object} worldServerDB
 */
export function registerConnectionHandlers(wsServer, centralLibraryDB, worldServerDB) {
    wsServer.registerHandler('authenticate', createConnectionHandler(centralLibraryDB, worldServerDB));
    wsServer.registerHandler('disconnect', createDisconnectHandler(worldServerDB));
    wsServer.registerHandler('ping', createPingHandler());

    log.info('Connection handlers registered');
}

// =============================================
// EXPORTS
// =============================================

export default {
    createConnectionHandler,
    createDisconnectHandler,
    createPingHandler,
    registerConnectionHandlers
};
