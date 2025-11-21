/**
 * POLYMIR WEBSOCKET DAMAGE MAP HANDLER
 * =====================================
 * Handles damage map updates, build mode changes, and build detection
 * Real-time sync of player block placements/removals
 */

import logger from '../../utils/logger.js';

const log = logger.child('WS:Damage');

// =============================================
// DAMAGE MAP UPDATE HANDLER
// =============================================

/**
 * Create damage map update handler (single voxel change)
 * @param {Object} worldServerDB - World Server database adapter
 * @returns {Function} Handler function
 */
export function createDamageUpdateHandler(worldServerDB) {
    return async function handleDamageUpdate(connectionId, message, wsServer) {
        const clientInfo = wsServer.getClient(connectionId);

        if (!clientInfo || !clientInfo.isAuthenticated) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Not authenticated'
            });
            return;
        }

        const { playerId, trustScore } = clientInfo;
        const {
            bodyId,
            voxelX,
            voxelY,
            voxelZ,
            layerId,
            changeType, // 'add' or 'remove'
            voxelType,
            voxelColor,
            buildMode,
            attachedSchematicPlacementId,
            clientTimestamp
        } = message;

        // Validation
        if (!bodyId || voxelX === undefined || voxelY === undefined || voxelZ === undefined) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Invalid damage data',
                required: ['bodyId', 'voxelX', 'voxelY', 'voxelZ']
            });
            return;
        }

        if (!['add', 'remove'].includes(changeType)) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Invalid changeType',
                valid: ['add', 'remove']
            });
            return;
        }

        try {
            // Record in database
            const result = await worldServerDB.recordDamageMapEntry({
                bodyId,
                voxelX,
                voxelY,
                voxelZ,
                layerId: layerId || 0,
                changeType,
                voxelType: changeType === 'add' ? voxelType : null,
                voxelColor: changeType === 'add' ? voxelColor : null,
                playerId,
                trustScore,
                buildMode: buildMode || 'new_schematic',
                attachedSchematicPlacementId: attachedSchematicPlacementId || null
            });

            log.debug('Damage recorded', {
                playerId,
                bodyId,
                position: [voxelX, voxelY, voxelZ],
                changeType
            });

            // Send acknowledgment
            wsServer.sendToClient(connectionId, {
                type: 'damage_ack',
                damageId: result.damage_id,
                clientTimestamp,
                serverTimestamp: Date.now()
            });

            // Broadcast to other players on same body
            const broadcastMessage = {
                type: 'damage_update',
                playerId,
                bodyId,
                voxelX,
                voxelY,
                voxelZ,
                layerId: layerId || 0,
                changeType,
                voxelType,
                voxelColor,
                timestamp: Date.now()
            };

            wsServer.broadcastToBody(bodyId, broadcastMessage, connectionId);

        } catch (error) {
            log.error('Damage update failed', {
                connectionId,
                playerId,
                error: error.message
            });

            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Failed to record damage',
                message: error.message
            });
        }
    };
}

// =============================================
// BATCH DAMAGE UPDATE HANDLER
// =============================================

/**
 * Create batch damage update handler (multiple voxels at once)
 * @param {Object} worldServerDB
 * @returns {Function} Handler function
 */
export function createBatchDamageHandler(worldServerDB) {
    return async function handleBatchDamage(connectionId, message, wsServer) {
        const clientInfo = wsServer.getClient(connectionId);

        if (!clientInfo || !clientInfo.isAuthenticated) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Not authenticated'
            });
            return;
        }

        const { playerId, trustScore } = clientInfo;
        const { bodyId, changes, buildMode, clientTimestamp } = message;

        if (!bodyId || !Array.isArray(changes) || changes.length === 0) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Invalid batch damage data',
                required: ['bodyId', 'changes (array)']
            });
            return;
        }

        // Limit batch size
        if (changes.length > 100) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Batch too large',
                maxSize: 100
            });
            return;
        }

        try {
            const results = [];

            for (const change of changes) {
                const result = await worldServerDB.recordDamageMapEntry({
                    bodyId,
                    voxelX: change.x,
                    voxelY: change.y,
                    voxelZ: change.z,
                    layerId: change.layerId || 0,
                    changeType: change.changeType,
                    voxelType: change.changeType === 'add' ? change.voxelType : null,
                    voxelColor: change.changeType === 'add' ? change.voxelColor : null,
                    playerId,
                    trustScore,
                    buildMode: buildMode || 'new_schematic',
                    attachedSchematicPlacementId: change.attachedSchematicPlacementId || null
                });

                results.push({
                    x: change.x,
                    y: change.y,
                    z: change.z,
                    damageId: result.damage_id
                });
            }

            log.debug('Batch damage recorded', {
                playerId,
                bodyId,
                count: changes.length
            });

            // Send acknowledgment
            wsServer.sendToClient(connectionId, {
                type: 'batch_damage_ack',
                bodyId,
                count: results.length,
                results,
                clientTimestamp,
                serverTimestamp: Date.now()
            });

            // Broadcast to other players
            const broadcastMessage = {
                type: 'batch_damage_update',
                playerId,
                bodyId,
                changes: changes.map(c => ({
                    x: c.x,
                    y: c.y,
                    z: c.z,
                    layerId: c.layerId || 0,
                    changeType: c.changeType,
                    voxelType: c.voxelType,
                    voxelColor: c.voxelColor
                })),
                timestamp: Date.now()
            };

            wsServer.broadcastToBody(bodyId, broadcastMessage, connectionId);

        } catch (error) {
            log.error('Batch damage failed', {
                connectionId,
                playerId,
                error: error.message
            });

            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Failed to record batch damage',
                message: error.message
            });
        }
    };
}

// =============================================
// BUILD MODE HANDLER
// =============================================

/**
 * Create build mode change handler
 * @param {Object} worldServerDB
 * @returns {Function} Handler function
 */
export function createBuildModeHandler(worldServerDB) {
    return async function handleBuildModeChange(connectionId, message, wsServer) {
        const clientInfo = wsServer.getClient(connectionId);

        if (!clientInfo || !clientInfo.isAuthenticated) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Not authenticated'
            });
            return;
        }

        const { playerId } = clientInfo;
        const { buildMode, extendingPlacementId } = message;

        // Validate build mode
        const validModes = ['new_schematic', 'extend_build', 'raw_damage'];
        if (!validModes.includes(buildMode)) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Invalid build mode',
                valid: validModes
            });
            return;
        }

        // extend_build requires a placement ID
        if (buildMode === 'extend_build' && !extendingPlacementId) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'extend_build mode requires extendingPlacementId'
            });
            return;
        }

        try {
            await worldServerDB.updatePlayerBuildMode(
                playerId,
                buildMode,
                buildMode === 'extend_build' ? extendingPlacementId : null
            );

            log.info('Build mode changed', {
                playerId,
                buildMode,
                extendingPlacementId
            });

            wsServer.sendToClient(connectionId, {
                type: 'build_mode_ack',
                buildMode,
                extendingPlacementId: buildMode === 'extend_build' ? extendingPlacementId : null,
                timestamp: Date.now()
            });

        } catch (error) {
            log.error('Build mode change failed', {
                connectionId,
                playerId,
                error: error.message
            });

            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Failed to change build mode',
                message: error.message
            });
        }
    };
}

// =============================================
// DAMAGE MAP REQUEST HANDLER
// =============================================

/**
 * Create damage map request handler (load damage for a body)
 * @param {Object} worldServerDB
 * @returns {Function} Handler function
 */
export function createDamageRequestHandler(worldServerDB) {
    return async function handleDamageRequest(connectionId, message, wsServer) {
        const clientInfo = wsServer.getClient(connectionId);

        if (!clientInfo || !clientInfo.isAuthenticated) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Not authenticated'
            });
            return;
        }

        const { bodyId, layerId } = message;

        if (!bodyId) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Missing bodyId'
            });
            return;
        }

        try {
            const entries = await worldServerDB.getDamageMapForBody(bodyId, layerId);

            // Format for client
            const damageData = entries.map(e => ({
                damageId: e.damage_id,
                x: e.voxel_x,
                y: e.voxel_y,
                z: e.voxel_z,
                layerId: e.layer_id,
                changeType: e.change_type,
                voxelType: e.voxel_type,
                voxelColor: e.voxel_color,
                playerId: e.player_id,
                buildMode: e.build_mode,
                createdAt: e.created_at
            }));

            wsServer.sendToClient(connectionId, {
                type: 'damage_map_data',
                bodyId,
                layerId,
                entries: damageData,
                count: damageData.length,
                timestamp: Date.now()
            });

            log.debug('Damage map sent', {
                connectionId,
                bodyId,
                entryCount: damageData.length
            });

        } catch (error) {
            log.error('Damage request failed', {
                connectionId,
                error: error.message
            });

            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Failed to get damage map',
                message: error.message
            });
        }
    };
}

// =============================================
// UNDO HANDLER
// =============================================

/**
 * Create undo handler
 * @param {Object} worldServerDB
 * @returns {Function} Handler function
 */
export function createUndoHandler(worldServerDB) {
    return async function handleUndo(connectionId, message, wsServer) {
        const clientInfo = wsServer.getClient(connectionId);

        if (!clientInfo || !clientInfo.isAuthenticated) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Not authenticated'
            });
            return;
        }

        const { playerId } = clientInfo;
        const { historyId, bodyId } = message;

        if (!historyId) {
            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Missing historyId'
            });
            return;
        }

        try {
            const success = await worldServerDB.undoDamageMapEntry(historyId, playerId);

            if (success) {
                wsServer.sendToClient(connectionId, {
                    type: 'undo_ack',
                    historyId,
                    success: true,
                    timestamp: Date.now()
                });

                // Broadcast undo to other players
                if (bodyId) {
                    wsServer.broadcastToBody(bodyId, {
                        type: 'damage_undone',
                        playerId,
                        historyId,
                        timestamp: Date.now()
                    }, connectionId);
                }

                log.debug('Undo successful', { playerId, historyId });
            } else {
                wsServer.sendToClient(connectionId, {
                    type: 'undo_ack',
                    historyId,
                    success: false,
                    reason: 'Entry not found or already undone'
                });
            }

        } catch (error) {
            log.error('Undo failed', {
                connectionId,
                playerId,
                error: error.message
            });

            wsServer.sendToClient(connectionId, {
                type: 'error',
                error: 'Failed to undo',
                message: error.message
            });
        }
    };
}

// =============================================
// HANDLER REGISTRATION
// =============================================

/**
 * Register all damage map handlers
 * @param {Object} wsServer
 * @param {Object} worldServerDB
 */
export function registerDamageHandlers(wsServer, worldServerDB) {
    wsServer.registerHandler('damage_update', createDamageUpdateHandler(worldServerDB));
    wsServer.registerHandler('batch_damage', createBatchDamageHandler(worldServerDB));
    wsServer.registerHandler('set_build_mode', createBuildModeHandler(worldServerDB));
    wsServer.registerHandler('request_damage_map', createDamageRequestHandler(worldServerDB));
    wsServer.registerHandler('undo_damage', createUndoHandler(worldServerDB));

    log.info('Damage map handlers registered');
}

// =============================================
// EXPORTS
// =============================================

export default {
    createDamageUpdateHandler,
    createBatchDamageHandler,
    createBuildModeHandler,
    createDamageRequestHandler,
    createUndoHandler,
    registerDamageHandlers
};
