/**
 * POLYMIR WEBSOCKET POSITION HANDLER
 * ===================================
 * Handles player position updates and broadcasts to nearby players
 */

import { logger } from '../../utils/logger.js';

const log = logger.child('WS:Position');

// =============================================
// POSITION UPDATE HANDLER
// =============================================

/**
 * Create position update handler
 * @param {Object} worldServerDB - World Server database adapter
 * @returns {Function} Handler function
 */
export function createPositionUpdateHandler(worldServerDB) {
    /**
     * Handle 'position_update' message
     * @param {string} connectionId
     * @param {Object} message
     * @param {Object} wsServer
     */
    return async function handlePositionUpdate(connectionId, message, wsServer) {
        const clientInfo = wsServer.getClient(connectionId);

        if (!clientInfo || !clientInfo.isAuthenticated) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Not authenticated'
            });
            return;
        }

        const { playerId } = clientInfo;
        const {
            megachunkId,
            bodyId,
            positionX,
            positionY,
            positionZ,
            velocityX,
            velocityY,
            velocityZ,
            rotationX,
            rotationY,
            rotationZ,
            rotationW
        } = message;

        // Validation
        if (positionX === undefined || positionY === undefined || positionZ === undefined) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Invalid position data',
                required: ['positionX', 'positionY', 'positionZ']
            });
            return;
        }

        try {
            // Update player position in database
            await worldServerDB.upsertPlayerPosition(playerId, {
                megachunkId: megachunkId || null,
                bodyId: bodyId || null,
                positionX,
                positionY,
                positionZ,
                velocityX: velocityX || 0,
                velocityY: velocityY || 0,
                velocityZ: velocityZ || 0,
                rotationX: rotationX || 0,
                rotationY: rotationY || 0,
                rotationZ: rotationZ || 0,
                rotationW: rotationW || 1,
                isOnline: true,
                websocketConnectionId: connectionId
            });

            log.trace('Position updated', {
                playerId,
                megachunkId,
                bodyId,
                position: [positionX, positionY, positionZ]
            });

            // Broadcast position to nearby players
            const broadcastMessage = {
                type: 'player_position',
                playerId,
                megachunkId,
                bodyId,
                position: { x: positionX, y: positionY, z: positionZ },
                velocity: { x: velocityX || 0, y: velocityY || 0, z: velocityZ || 0 },
                rotation: { x: rotationX || 0, y: rotationY || 0, z: rotationZ || 0, w: rotationW || 1 },
                timestamp: Date.now()
            };

            // Broadcast to subscribed regions
            let broadcastCount = 0;

            if (megachunkId) {
                broadcastCount += wsServer.broadcastToMegachunk(megachunkId, broadcastMessage);
            }

            if (bodyId) {
                broadcastCount += wsServer.broadcastToBody(bodyId, broadcastMessage);
            }

            // Send acknowledgment to sender
            wsServer.sendToClient(connectionId, {
                type: 'position_ack',
                timestamp: message.timestamp || Date.now(),
                broadcastCount
            });

        } catch (error) {
            log.error('Position update failed', {
                connectionId,
                playerId,
                error: error.message
            });

            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Failed to update position',
                message: error.message
            });
        }
    };
}

/**
 * Create position request handler
 * @param {Object} worldServerDB
 * @returns {Function} Handler function
 */
export function createPositionRequestHandler(worldServerDB) {
    /**
     * Handle 'request_position' message
     * Request positions of players in a region
     * @param {string} connectionId
     * @param {Object} message
     * @param {Object} wsServer
     */
    return async function handlePositionRequest(connectionId, message, wsServer) {
        const clientInfo = wsServer.getClient(connectionId);

        if (!clientInfo || !clientInfo.isAuthenticated) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Not authenticated'
            });
            return;
        }

        const { megachunkId, bodyId } = message;

        try {
            let players = [];

            if (megachunkId) {
                players = await worldServerDB.getPlayersInMegachunk(megachunkId);
            } else if (bodyId) {
                players = await worldServerDB.getPlayersOnBody(bodyId);
            } else {
                wsServer.sendToClient(connectionId, {
                    type: 'error',
                    error: 'Missing region identifier',
                    message: 'Provide megachunkId or bodyId'
                });
                return;
            }

            // Filter out self
            const otherPlayers = players.filter(p => p.player_id !== clientInfo.playerId);

            // Format positions
            const positions = otherPlayers.map(p => ({
                playerId: p.player_id,
                position: {
                    x: p.position_x,
                    y: p.position_y,
                    z: p.position_z
                },
                velocity: {
                    x: p.velocity_x,
                    y: p.velocity_y,
                    z: p.velocity_z
                },
                rotation: {
                    x: p.rotation_x,
                    y: p.rotation_y,
                    z: p.rotation_z,
                    w: p.rotation_w
                },
                lastUpdate: p.last_position_update
            }));

            wsServer.sendToClient(connectionId, {
                type: 'player_positions',
                megachunkId,
                bodyId,
                players: positions,
                count: positions.length,
                timestamp: Date.now()
            });

            log.debug('Positions sent', {
                connectionId,
                megachunkId,
                bodyId,
                playerCount: positions.length
            });

        } catch (error) {
            log.error('Position request failed', {
                connectionId,
                error: error.message
            });

            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Failed to get positions',
                message: error.message
            });
        }
    };
}

/**
 * Create player teleport handler
 * @param {Object} worldServerDB
 * @returns {Function} Handler function
 */
export function createTeleportHandler(worldServerDB) {
    /**
     * Handle 'teleport' message
     * @param {string} connectionId
     * @param {Object} message
     * @param {Object} wsServer
     */
    return async function handleTeleport(connectionId, message, wsServer) {
        const clientInfo = wsServer.getClient(connectionId);

        if (!clientInfo || !clientInfo.isAuthenticated) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Not authenticated'
            });
            return;
        }

        const { playerId } = clientInfo;
        const {
            megachunkId,
            bodyId,
            positionX,
            positionY,
            positionZ
        } = message;

        if (positionX === undefined || positionY === undefined || positionZ === undefined) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Invalid teleport data'
            });
            return;
        }

        try {
            // Update position (teleport)
            await worldServerDB.upsertPlayerPosition(playerId, {
                megachunkId: megachunkId || null,
                bodyId: bodyId || null,
                positionX,
                positionY,
                positionZ,
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

            log.info('Player teleported', {
                playerId,
                megachunkId,
                bodyId,
                position: [positionX, positionY, positionZ]
            });

            // Send confirmation
            wsServer.sendToClient(connectionId, {
                type: 'teleport_complete',
                position: { x: positionX, y: positionY, z: positionZ },
                megachunkId,
                bodyId,
                timestamp: Date.now()
            });

            // Broadcast to nearby players
            const broadcastMessage = {
                type: 'player_teleported',
                playerId,
                position: { x: positionX, y: positionY, z: positionZ },
                timestamp: Date.now()
            };

            if (megachunkId) {
                wsServer.broadcastToMegachunk(megachunkId, broadcastMessage);
            }

            if (bodyId) {
                wsServer.broadcastToBody(bodyId, broadcastMessage);
            }

        } catch (error) {
            log.error('Teleport failed', {
                connectionId,
                playerId,
                error: error.message
            });

            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Teleport failed',
                message: error.message
            });
        }
    };
}

// =============================================
// HANDLER REGISTRATION
// =============================================

/**
 * Register all position handlers
 * @param {Object} wsServer
 * @param {Object} worldServerDB
 */
export function registerPositionHandlers(wsServer, worldServerDB) {
    wsServer.registerHandler('position_update', createPositionUpdateHandler(worldServerDB));
    wsServer.registerHandler('request_positions', createPositionRequestHandler(worldServerDB));
    wsServer.registerHandler('teleport', createTeleportHandler(worldServerDB));

    log.info('Position handlers registered');
}

// =============================================
// EXPORTS
// =============================================

export default {
    createPositionUpdateHandler,
    createPositionRequestHandler,
    createTeleportHandler,
    registerPositionHandlers
};
