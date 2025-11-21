/**
 * NetworkDamageSync.js
 * Bridges DamageMapManager with WebSocketAdapter for multiplayer sync
 *
 * Handles:
 * - Sending local damage changes to server
 * - Receiving damage updates from other players
 * - Build mode synchronization
 * - Damage map loading on body subscription
 */

import { BUILD_MODE } from './DamageMapManager.js';

export class NetworkDamageSync {
    /**
     * @param {DamageMapManager} damageMapManager - Client-side damage manager
     * @param {WebSocketAdapter} wsAdapter - Network adapter
     */
    constructor(damageMapManager, wsAdapter) {
        this.damageMapManager = damageMapManager;
        this.wsAdapter = wsAdapter;

        // Bind handlers
        this.boundHandlers = {
            damageUpdate: this.handleRemoteDamageUpdate.bind(this),
            batchDamageUpdate: this.handleRemoteBatchDamage.bind(this),
            damageMapData: this.handleDamageMapData.bind(this),
            damageAck: this.handleDamageAck.bind(this),
            batchDamageAck: this.handleBatchDamageAck.bind(this),
            buildModeAck: this.handleBuildModeAck.bind(this),
            damageUndone: this.handleRemoteUndo.bind(this),
            undoAck: this.handleUndoAck.bind(this)
        };

        // Track pending syncs for retry
        this.pendingDamageIds = new Map(); // localId -> serverDamageId

        // Connect the damage manager's flush to actually send
        this.overrideDamageManagerSync();
    }

    /**
     * Initialize network sync - register all event handlers
     */
    initialize() {
        // Listen for server messages
        this.wsAdapter.on('damage_update', this.boundHandlers.damageUpdate);
        this.wsAdapter.on('batch_damage_update', this.boundHandlers.batchDamageUpdate);
        this.wsAdapter.on('damage_map_data', this.boundHandlers.damageMapData);
        this.wsAdapter.on('damage_ack', this.boundHandlers.damageAck);
        this.wsAdapter.on('batch_damage_ack', this.boundHandlers.batchDamageAck);
        this.wsAdapter.on('build_mode_ack', this.boundHandlers.buildModeAck);
        this.wsAdapter.on('damage_undone', this.boundHandlers.damageUndone);
        this.wsAdapter.on('undo_ack', this.boundHandlers.undoAck);

        console.log('[NetworkDamageSync] Initialized');
    }

    /**
     * Clean up event handlers
     */
    destroy() {
        this.wsAdapter.off('damage_update', this.boundHandlers.damageUpdate);
        this.wsAdapter.off('batch_damage_update', this.boundHandlers.batchDamageUpdate);
        this.wsAdapter.off('damage_map_data', this.boundHandlers.damageMapData);
        this.wsAdapter.off('damage_ack', this.boundHandlers.damageAck);
        this.wsAdapter.off('batch_damage_ack', this.boundHandlers.batchDamageAck);
        this.wsAdapter.off('build_mode_ack', this.boundHandlers.buildModeAck);
        this.wsAdapter.off('damage_undone', this.boundHandlers.damageUndone);
        this.wsAdapter.off('undo_ack', this.boundHandlers.undoAck);

        console.log('[NetworkDamageSync] Destroyed');
    }

    /**
     * Override DamageMapManager's flushSync to use network
     */
    overrideDamageManagerSync() {
        const originalFlush = this.damageMapManager.flushSync.bind(this.damageMapManager);

        this.damageMapManager.flushSync = async () => {
            // Get pending changes before they're cleared
            const pendingSync = this.damageMapManager.pendingSync;

            if (pendingSync.size === 0) return;

            // Group by body for batch sending
            for (const [bodyId, pendingMap] of pendingSync) {
                const changes = [];

                for (const [key, entry] of pendingMap) {
                    changes.push({
                        x: entry.voxel_x,
                        y: entry.voxel_y,
                        z: entry.voxel_z,
                        layerId: entry.layer_id,
                        changeType: entry.change_type,
                        voxelType: entry.voxel_type,
                        voxelColor: entry.voxel_color,
                        attachedSchematicPlacementId: entry.attached_schematic_placement_id
                    });

                    // Track local ID for ack matching
                    this.pendingDamageIds.set(entry.damage_id, { bodyId, key });
                }

                if (changes.length === 1) {
                    // Single change - send individual update
                    const change = changes[0];
                    await this.wsAdapter.sendDamageUpdate({
                        bodyId,
                        voxelX: change.x,
                        voxelY: change.y,
                        voxelZ: change.z,
                        layerId: change.layerId,
                        changeType: change.changeType,
                        voxelType: change.voxelType,
                        voxelColor: change.voxelColor,
                        buildMode: this.damageMapManager.buildMode,
                        attachedSchematicPlacementId: change.attachedSchematicPlacementId
                    });
                } else if (changes.length > 1) {
                    // Multiple changes - batch
                    await this.wsAdapter.sendBatchDamage(
                        bodyId,
                        changes,
                        this.damageMapManager.buildMode
                    );
                }

                console.log(`[NetworkDamageSync] Sent ${changes.length} changes for body ${bodyId}`);
            }

            // Clear pending (mark as synced happens on ack)
            pendingSync.clear();
            this.damageMapManager.syncTimer = null;
        };
    }

    // =============================================
    // BUILD MODE SYNC
    // =============================================

    /**
     * Sync build mode change to server
     * Call this after damageMapManager.setBuildMode()
     */
    async syncBuildMode(mode, extendingPlacementId = null) {
        this.damageMapManager.setBuildMode(mode, extendingPlacementId);
        await this.wsAdapter.setBuildMode(mode, extendingPlacementId);
    }

    // =============================================
    // DAMAGE MAP LOADING
    // =============================================

    /**
     * Request damage map when subscribing to a body
     * @param {string} bodyId
     * @param {number} layerId - Optional layer filter
     */
    async requestDamageMap(bodyId, layerId = null) {
        await this.wsAdapter.requestDamageMap(bodyId, layerId);
    }

    // =============================================
    // UNDO
    // =============================================

    /**
     * Undo a damage entry (synced to server)
     * @param {string} historyId - Server damage_id or history_id
     * @param {string} bodyId
     */
    async undoDamage(historyId, bodyId) {
        await this.wsAdapter.undoDamage(historyId, bodyId);
    }

    // =============================================
    // INCOMING MESSAGE HANDLERS
    // =============================================

    /**
     * Handle damage update from another player
     */
    handleRemoteDamageUpdate(message) {
        const {
            playerId,
            bodyId,
            voxelX,
            voxelY,
            voxelZ,
            layerId,
            changeType,
            voxelType,
            voxelColor
        } = message;

        // Don't apply our own changes (we already have them locally)
        if (playerId === this.damageMapManager.playerId) return;

        const damageMap = this.damageMapManager.getDamageMapForBody(bodyId);
        const key = this.damageMapManager.encodeKey(voxelX, voxelY, voxelZ, layerId);

        const entry = {
            damage_id: `remote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            body_id: bodyId,
            voxel_x: voxelX,
            voxel_y: voxelY,
            voxel_z: voxelZ,
            layer_id: layerId,
            change_type: changeType,
            voxel_type: voxelType,
            voxel_color: voxelColor,
            player_id: playerId,
            created_at: new Date().toISOString(),
            synced: true
        };

        damageMap.set(key, entry);

        // Notify listeners
        if (this.damageMapManager.onDamageChanged) {
            this.damageMapManager.onDamageChanged(changeType, entry);
        }

        console.log(`[NetworkDamageSync] Remote damage from ${playerId}:`, {
            position: [voxelX, voxelY, voxelZ],
            changeType
        });
    }

    /**
     * Handle batch damage from another player
     */
    handleRemoteBatchDamage(message) {
        const { playerId, bodyId, changes } = message;

        // Don't apply our own changes
        if (playerId === this.damageMapManager.playerId) return;

        const damageMap = this.damageMapManager.getDamageMapForBody(bodyId);

        for (const change of changes) {
            const key = this.damageMapManager.encodeKey(
                change.x, change.y, change.z, change.layerId
            );

            const entry = {
                damage_id: `remote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                body_id: bodyId,
                voxel_x: change.x,
                voxel_y: change.y,
                voxel_z: change.z,
                layer_id: change.layerId,
                change_type: change.changeType,
                voxel_type: change.voxelType,
                voxel_color: change.voxelColor,
                player_id: playerId,
                created_at: new Date().toISOString(),
                synced: true
            };

            damageMap.set(key, entry);

            if (this.damageMapManager.onDamageChanged) {
                this.damageMapManager.onDamageChanged(change.changeType, entry);
            }
        }

        console.log(`[NetworkDamageSync] Remote batch damage from ${playerId}: ${changes.length} changes`);
    }

    /**
     * Handle full damage map data from server (on subscribe/request)
     */
    handleDamageMapData(message) {
        const { bodyId, entries } = message;

        // Convert server format to local format
        const serverEntries = entries.map(e => ({
            damage_id: e.damageId,
            voxel_x: e.x,
            voxel_y: e.y,
            voxel_z: e.z,
            layer_id: e.layerId,
            change_type: e.changeType,
            voxel_type: e.voxelType,
            voxel_color: e.voxelColor,
            player_id: e.playerId,
            build_mode: e.buildMode,
            created_at: e.createdAt
        }));

        this.damageMapManager.loadFromServer(bodyId, serverEntries);
    }

    /**
     * Handle acknowledgment of single damage update
     */
    handleDamageAck(message) {
        const { damageId, clientTimestamp, serverTimestamp } = message;

        // Update local entry with server ID
        // The entry is already in place, just mark synced
        console.log(`[NetworkDamageSync] Damage ack received`, {
            damageId,
            latency: serverTimestamp - clientTimestamp
        });
    }

    /**
     * Handle acknowledgment of batch damage
     */
    handleBatchDamageAck(message) {
        const { bodyId, count, results, clientTimestamp, serverTimestamp } = message;

        console.log(`[NetworkDamageSync] Batch damage ack: ${count} changes`, {
            latency: serverTimestamp - clientTimestamp
        });
    }

    /**
     * Handle build mode acknowledgment
     */
    handleBuildModeAck(message) {
        const { buildMode, extendingPlacementId } = message;

        console.log(`[NetworkDamageSync] Build mode confirmed: ${buildMode}`);
    }

    /**
     * Handle remote undo (another player undid something)
     */
    handleRemoteUndo(message) {
        const { playerId, historyId } = message;

        // Don't process our own undos
        if (playerId === this.damageMapManager.playerId) return;

        // TODO: Remove the undone entry from local damage map
        // This requires tracking damage_id -> key mapping
        console.log(`[NetworkDamageSync] Remote undo from ${playerId}: ${historyId}`);
    }

    /**
     * Handle undo acknowledgment
     */
    handleUndoAck(message) {
        const { historyId, success, reason } = message;

        if (success) {
            console.log(`[NetworkDamageSync] Undo confirmed: ${historyId}`);
        } else {
            console.warn(`[NetworkDamageSync] Undo failed: ${reason}`);
        }
    }
}

export default NetworkDamageSync;
