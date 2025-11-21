/**
 * DamageMapManager.js
 * Client-side damage map overlay system
 *
 * Maintains a local overlay of player modifications on top of base terrain.
 * Syncs with server damage_map table.
 * Provides merged view for rendering (base + damage).
 * Handles build mode state and automatic build detection.
 */

import { BuildDetector } from './BuildDetector.js';
import { BuildExtractor } from './BuildExtractor.js';

// Build mode constants
export const BUILD_MODE = {
    NEW_SCHEMATIC: 'new_schematic',
    EXTEND_BUILD: 'extend_build',
    RAW_DAMAGE: 'raw_damage'
};

export class DamageMapManager {
    constructor(options = {}) {
        // Local damage map storage: Map<bodyId, Map<voxelKey, entry>>
        this.damageMapsByBody = new Map();

        // Current build mode
        this.buildMode = options.initialBuildMode || BUILD_MODE.NEW_SCHEMATIC;

        // If in EXTEND_BUILD mode, which placement are we extending?
        this.extendingPlacementId = null;

        // Build detection
        this.buildDetector = new BuildDetector({
            buildThreshold: options.buildThreshold || 5,
            includeDiagonals: options.includeDiagonals || false
        });

        this.buildExtractor = new BuildExtractor({
            defaultCategory: options.defaultCategory || 'player_build'
        });

        // Callbacks
        this.onBuildDetected = options.onBuildDetected || null;
        this.onDamageChanged = options.onDamageChanged || null;

        // Server sync
        this.pendingSync = new Map(); // Changes not yet synced to server
        this.syncInterval = options.syncInterval || 1000; // ms
        this.syncTimer = null;

        // Player context
        this.playerId = options.playerId || null;
        this.trustScore = options.trustScore || 0.5;
    }

    /**
     * Encode voxel position to key
     */
    encodeKey(x, y, z, layerId = 0) {
        return `${x},${y},${z},${layerId}`;
    }

    /**
     * Decode key to position
     */
    decodeKey(key) {
        const [x, y, z, layerId] = key.split(',').map(Number);
        return { x, y, z, layerId };
    }

    // =============================================
    // BUILD MODE MANAGEMENT
    // =============================================

    /**
     * Set build mode
     * @param {string} mode - BUILD_MODE constant
     * @param {string} extendingPlacementId - For EXTEND_BUILD mode
     */
    setBuildMode(mode, extendingPlacementId = null) {
        this.buildMode = mode;
        this.extendingPlacementId = mode === BUILD_MODE.EXTEND_BUILD ? extendingPlacementId : null;

        console.log(`[DamageMapManager] Build mode set to: ${mode}`, {
            extendingPlacementId: this.extendingPlacementId
        });
    }

    /**
     * Get current build mode
     */
    getBuildMode() {
        return {
            mode: this.buildMode,
            extendingPlacementId: this.extendingPlacementId
        };
    }

    // =============================================
    // DAMAGE MAP OPERATIONS
    // =============================================

    /**
     * Get or create damage map for a body
     */
    getDamageMapForBody(bodyId) {
        if (!this.damageMapsByBody.has(bodyId)) {
            this.damageMapsByBody.set(bodyId, new Map());
        }
        return this.damageMapsByBody.get(bodyId);
    }

    /**
     * Add a voxel to the damage map (player placed a block)
     * @param {string} bodyId
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} voxelType
     * @param {number} voxelColor
     * @param {number} layerId
     * @returns {Object} The created entry
     */
    addVoxel(bodyId, x, y, z, voxelType, voxelColor, layerId = 0) {
        const damageMap = this.getDamageMapForBody(bodyId);
        const key = this.encodeKey(x, y, z, layerId);

        const entry = {
            damage_id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            body_id: bodyId,
            voxel_x: x,
            voxel_y: y,
            voxel_z: z,
            layer_id: layerId,
            change_type: 'add',
            voxel_type: voxelType,
            voxel_color: voxelColor,
            player_id: this.playerId,
            trust_score_at_change: this.trustScore,
            build_mode: this.buildMode,
            attached_schematic_placement_id: this.extendingPlacementId,
            created_at: new Date().toISOString(),
            synced: false
        };

        damageMap.set(key, entry);

        // Queue for server sync
        this.queueForSync(bodyId, key, entry);

        // Notify listeners
        if (this.onDamageChanged) {
            this.onDamageChanged('add', entry);
        }

        // Check for build detection (if not in raw damage mode)
        if (this.buildMode !== BUILD_MODE.RAW_DAMAGE) {
            this.checkForBuilds(bodyId);
        }

        return entry;
    }

    /**
     * Remove a voxel from the damage map (player destroyed a block)
     * @param {string} bodyId
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} layerId
     * @returns {Object|null} The created removal entry
     */
    removeVoxel(bodyId, x, y, z, layerId = 0) {
        const damageMap = this.getDamageMapForBody(bodyId);
        const key = this.encodeKey(x, y, z, layerId);

        const entry = {
            damage_id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            body_id: bodyId,
            voxel_x: x,
            voxel_y: y,
            voxel_z: z,
            layer_id: layerId,
            change_type: 'remove',
            voxel_type: null,
            voxel_color: null,
            player_id: this.playerId,
            trust_score_at_change: this.trustScore,
            build_mode: this.buildMode,
            attached_schematic_placement_id: null,
            created_at: new Date().toISOString(),
            synced: false
        };

        damageMap.set(key, entry);

        // Queue for server sync
        this.queueForSync(bodyId, key, entry);

        // Notify listeners
        if (this.onDamageChanged) {
            this.onDamageChanged('remove', entry);
        }

        return entry;
    }

    /**
     * Get damage entry at position
     */
    getDamageAt(bodyId, x, y, z, layerId = 0) {
        const damageMap = this.getDamageMapForBody(bodyId);
        const key = this.encodeKey(x, y, z, layerId);
        return damageMap.get(key) || null;
    }

    /**
     * Check if position has an addition in damage map
     */
    hasAdditionAt(bodyId, x, y, z, layerId = 0) {
        const entry = this.getDamageAt(bodyId, x, y, z, layerId);
        return entry && entry.change_type === 'add';
    }

    /**
     * Check if position has a removal in damage map
     */
    hasRemovalAt(bodyId, x, y, z, layerId = 0) {
        const entry = this.getDamageAt(bodyId, x, y, z, layerId);
        return entry && entry.change_type === 'remove';
    }

    /**
     * Get merged voxel data (base terrain + damage overlay)
     * @param {string} bodyId
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} layerId
     * @param {Function} getBaseVoxel - Function to get base terrain voxel
     * @returns {Object|null} Merged voxel data
     */
    getMergedVoxel(bodyId, x, y, z, layerId, getBaseVoxel) {
        const damageEntry = this.getDamageAt(bodyId, x, y, z, layerId);

        if (damageEntry) {
            if (damageEntry.change_type === 'add') {
                return {
                    type: damageEntry.voxel_type,
                    color: damageEntry.voxel_color,
                    isDamageMap: true,
                    playerId: damageEntry.player_id
                };
            } else if (damageEntry.change_type === 'remove') {
                return null; // Removed, return nothing
            }
        }

        // No damage entry, return base terrain
        const baseVoxel = getBaseVoxel(x, y, z, layerId);
        return baseVoxel ? { ...baseVoxel, isDamageMap: false } : null;
    }

    /**
     * Get all additions in damage map for a body
     */
    getAdditions(bodyId) {
        const damageMap = this.getDamageMapForBody(bodyId);
        const additions = [];

        for (const entry of damageMap.values()) {
            if (entry.change_type === 'add') {
                additions.push(entry);
            }
        }

        return additions;
    }

    /**
     * Get all removals in damage map for a body
     */
    getRemovals(bodyId) {
        const damageMap = this.getDamageMapForBody(bodyId);
        const removals = [];

        for (const entry of damageMap.values()) {
            if (entry.change_type === 'remove') {
                removals.push(entry);
            }
        }

        return removals;
    }

    // =============================================
    // BUILD DETECTION
    // =============================================

    /**
     * Check for builds in the damage map
     * Called after each voxel placement (if not in raw damage mode)
     */
    checkForBuilds(bodyId) {
        // Get unconverted additions
        const additions = this.getAdditions(bodyId).filter(e =>
            !e.converted_to_schematic_id &&
            e.build_mode === BUILD_MODE.NEW_SCHEMATIC
        );

        if (additions.length < this.buildDetector.buildThreshold) {
            return; // Not enough voxels yet
        }

        // Run build detection
        const builds = this.buildDetector.detectBuilds(additions);

        // Notify for each detected build
        for (const build of builds) {
            console.log(`[DamageMapManager] Build detected:`, {
                voxelCount: build.voxelCount,
                bounds: build.bounds,
                primaryContributor: build.primaryContributor
            });

            if (this.onBuildDetected) {
                this.onBuildDetected(build, bodyId);
            }
        }
    }

    /**
     * Extract detected builds to MVoxFile
     * @param {string} bodyId
     * @param {Object} context - Body context (gravitational center, etc.)
     * @returns {Array} Array of extracted build data
     */
    extractBuilds(bodyId, context) {
        const additions = this.getAdditions(bodyId).filter(e =>
            !e.converted_to_schematic_id &&
            e.build_mode === BUILD_MODE.NEW_SCHEMATIC
        );

        const builds = this.buildDetector.detectBuilds(additions);
        return this.buildExtractor.processBuildCandidates(builds, context);
    }

    /**
     * Mark damage entries as converted to schematic
     * @param {Array<string>} damageIds
     * @param {string} schematicId
     */
    markAsConverted(damageIds, schematicId) {
        const damageIdSet = new Set(damageIds);

        for (const [bodyId, damageMap] of this.damageMapsByBody) {
            for (const [key, entry] of damageMap) {
                if (damageIdSet.has(entry.damage_id)) {
                    entry.converted_to_schematic_id = schematicId;
                    entry.converted_at = new Date().toISOString();
                }
            }
        }
    }

    // =============================================
    // SERVER SYNC
    // =============================================

    /**
     * Queue an entry for server sync
     */
    queueForSync(bodyId, key, entry) {
        if (!this.pendingSync.has(bodyId)) {
            this.pendingSync.set(bodyId, new Map());
        }
        this.pendingSync.get(bodyId).set(key, entry);

        // Start sync timer if not running
        if (!this.syncTimer) {
            this.syncTimer = setTimeout(() => this.flushSync(), this.syncInterval);
        }
    }

    /**
     * Flush pending changes to server
     * Override this to implement actual server communication
     */
    async flushSync() {
        this.syncTimer = null;

        const changes = [];

        for (const [bodyId, pendingMap] of this.pendingSync) {
            for (const [key, entry] of pendingMap) {
                changes.push({
                    bodyId,
                    voxelX: entry.voxel_x,
                    voxelY: entry.voxel_y,
                    voxelZ: entry.voxel_z,
                    layerId: entry.layer_id,
                    changeType: entry.change_type,
                    voxelType: entry.voxel_type,
                    voxelColor: entry.voxel_color,
                    playerId: entry.player_id,
                    trustScore: entry.trust_score_at_change,
                    buildMode: entry.build_mode,
                    attachedSchematicPlacementId: entry.attached_schematic_placement_id
                });
            }
        }

        if (changes.length === 0) return;

        console.log(`[DamageMapManager] Syncing ${changes.length} changes to server`);

        // TODO: Implement actual server sync
        // await this.serverApi.syncDamageMap(changes);

        // Mark as synced
        for (const [bodyId, pendingMap] of this.pendingSync) {
            const damageMap = this.getDamageMapForBody(bodyId);
            for (const [key, entry] of pendingMap) {
                const storedEntry = damageMap.get(key);
                if (storedEntry) {
                    storedEntry.synced = true;
                }
            }
        }

        this.pendingSync.clear();
    }

    /**
     * Load damage map from server
     * @param {string} bodyId
     * @param {Array} serverEntries - Entries from server
     */
    loadFromServer(bodyId, serverEntries) {
        const damageMap = this.getDamageMapForBody(bodyId);

        for (const entry of serverEntries) {
            const key = this.encodeKey(
                entry.voxel_x,
                entry.voxel_y,
                entry.voxel_z,
                entry.layer_id
            );

            damageMap.set(key, {
                ...entry,
                synced: true
            });
        }

        console.log(`[DamageMapManager] Loaded ${serverEntries.length} entries for body ${bodyId}`);
    }

    // =============================================
    // UNDO SUPPORT
    // =============================================

    /**
     * Undo last change by current player
     * @param {string} bodyId
     * @returns {Object|null} The undone entry
     */
    undoLastChange(bodyId) {
        const damageMap = this.getDamageMapForBody(bodyId);

        // Find most recent entry by current player
        let mostRecent = null;
        let mostRecentKey = null;

        for (const [key, entry] of damageMap) {
            if (entry.player_id === this.playerId) {
                if (!mostRecent || entry.created_at > mostRecent.created_at) {
                    mostRecent = entry;
                    mostRecentKey = key;
                }
            }
        }

        if (mostRecent && mostRecentKey) {
            damageMap.delete(mostRecentKey);

            // Queue undo for server sync
            // TODO: Implement undo sync

            if (this.onDamageChanged) {
                this.onDamageChanged('undo', mostRecent);
            }

            return mostRecent;
        }

        return null;
    }

    // =============================================
    // CLEANUP
    // =============================================

    /**
     * Clear damage map for a body
     */
    clearBody(bodyId) {
        this.damageMapsByBody.delete(bodyId);
        this.pendingSync.delete(bodyId);
    }

    /**
     * Clear all damage maps
     */
    clearAll() {
        this.damageMapsByBody.clear();
        this.pendingSync.clear();
    }

    /**
     * Destroy manager
     */
    destroy() {
        if (this.syncTimer) {
            clearTimeout(this.syncTimer);
            this.syncTimer = null;
        }
        this.clearAll();
    }
}

export default DamageMapManager;
