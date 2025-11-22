/**
 * PlayerStateManager.js
 * High-performance real-time player state synchronization
 *
 * Features:
 * - Tick-based batching (20 ticks/sec default)
 * - In-memory state with periodic DB persistence
 * - Delta compression for bandwidth efficiency
 * - Spatial partitioning for broadcast optimization
 * - Priority-based updates (closer players = higher frequency)
 */

import logger from '../utils/logger.js';

const log = logger.child('PlayerStateManager');

// =============================================
// CONFIGURATION
// =============================================

export const SYNC_CONFIG = {
    // Server tick rate (Hz) - how often to broadcast batched updates
    TICK_RATE: 20,

    // How often to persist to database (ms)
    DB_PERSIST_INTERVAL: 5000,

    // Maximum players per batch message
    MAX_BATCH_SIZE: 50,

    // Position change threshold to trigger update (units)
    POSITION_THRESHOLD: 0.01,

    // Rotation change threshold (radians)
    ROTATION_THRESHOLD: 0.01,

    // Priority distance tiers (units)
    PRIORITY_TIERS: {
        HIGH: 50,      // < 50 units: every tick
        MEDIUM: 150,   // < 150 units: every 2 ticks
        LOW: 500,      // < 500 units: every 5 ticks
        MINIMAL: 1000  // < 1000 units: every 10 ticks
    },

    // Beyond this distance, don't send updates
    MAX_SYNC_DISTANCE: 2000
};

// =============================================
// PLAYER STATE
// =============================================

class PlayerState {
    constructor(playerId, username = null) {
        this.playerId = playerId;
        this.username = username;
        this.connectionId = null;

        // Current state
        this.position = { x: 0, y: 0, z: 0 };
        this.velocity = { x: 0, y: 0, z: 0 };
        this.rotation = { x: 0, y: 0, z: 0, w: 1 };

        // Location context
        this.megachunkId = null;
        this.bodyId = null;
        this.shipId = null;

        // Tracking
        this.lastUpdate = Date.now();
        this.lastBroadcast = Date.now();
        this.lastDbPersist = Date.now();
        this.dirty = false;  // Has state changed since last broadcast?
        this.dbDirty = false; // Has state changed since last DB persist?

        // Previous state for delta calculation
        this.prevPosition = { x: 0, y: 0, z: 0 };
        this.prevRotation = { x: 0, y: 0, z: 0, w: 1 };

        // Sequence number for ordering
        this.sequence = 0;
    }

    /**
     * Update state from client message
     * Handles both nested {position: {x,y,z}} and flat {positionX, positionY, positionZ} formats
     * @returns {boolean} true if update was valid, false if rejected
     */
    update(data) {
        // Store previous for delta
        this.prevPosition.x = this.position.x;
        this.prevPosition.y = this.position.y;
        this.prevPosition.z = this.position.z;
        this.prevRotation.x = this.rotation.x;
        this.prevRotation.y = this.rotation.y;
        this.prevRotation.z = this.rotation.z;
        this.prevRotation.w = this.rotation.w;

        // Extract and validate position
        let newX = this.position.x;
        let newY = this.position.y;
        let newZ = this.position.z;

        if (data.position) {
            if (data.position.x !== undefined) newX = data.position.x;
            if (data.position.y !== undefined) newY = data.position.y;
            if (data.position.z !== undefined) newZ = data.position.z;
        }
        if (data.positionX !== undefined) newX = data.positionX;
        if (data.positionY !== undefined) newY = data.positionY;
        if (data.positionZ !== undefined) newZ = data.positionZ;

        // Validate position - reject NaN/Infinity
        if (!Number.isFinite(newX) || !Number.isFinite(newY) || !Number.isFinite(newZ)) {
            return false;
        }

        this.position.x = newX;
        this.position.y = newY;
        this.position.z = newZ;

        // Update velocity - handle nested or flat format
        if (data.velocity) {
            if (Number.isFinite(data.velocity.x)) this.velocity.x = data.velocity.x;
            if (Number.isFinite(data.velocity.y)) this.velocity.y = data.velocity.y;
            if (Number.isFinite(data.velocity.z)) this.velocity.z = data.velocity.z;
        }
        if (Number.isFinite(data.velocityX)) this.velocity.x = data.velocityX;
        if (Number.isFinite(data.velocityY)) this.velocity.y = data.velocityY;
        if (Number.isFinite(data.velocityZ)) this.velocity.z = data.velocityZ;

        // Update rotation - handle nested or flat format
        if (data.rotation) {
            if (Number.isFinite(data.rotation.x)) this.rotation.x = data.rotation.x;
            if (Number.isFinite(data.rotation.y)) this.rotation.y = data.rotation.y;
            if (Number.isFinite(data.rotation.z)) this.rotation.z = data.rotation.z;
            if (Number.isFinite(data.rotation.w)) this.rotation.w = data.rotation.w;
        }
        if (Number.isFinite(data.rotationX)) this.rotation.x = data.rotationX;
        if (Number.isFinite(data.rotationY)) this.rotation.y = data.rotationY;
        if (Number.isFinite(data.rotationZ)) this.rotation.z = data.rotationZ;
        if (Number.isFinite(data.rotationW)) this.rotation.w = data.rotationW;

        // Context
        if (data.megachunkId !== undefined) this.megachunkId = data.megachunkId;
        if (data.bodyId !== undefined) this.bodyId = data.bodyId;
        if (data.shipId !== undefined) this.shipId = data.shipId;

        this.lastUpdate = Date.now();

        // Increment sequence with overflow protection (wrap at 2^32 - 1)
        this.sequence = (this.sequence + 1) >>> 0;

        // Check if significant change
        if (this.hasSignificantChange()) {
            this.dirty = true;
            this.dbDirty = true;
        }

        return true;
    }

    /**
     * Check if state changed enough to broadcast
     */
    hasSignificantChange() {
        // Position delta (squared distance for efficiency, compare against squared threshold)
        const posDistSq =
            (this.position.x - this.prevPosition.x) ** 2 +
            (this.position.y - this.prevPosition.y) ** 2 +
            (this.position.z - this.prevPosition.z) ** 2;

        const posThresholdSq = SYNC_CONFIG.POSITION_THRESHOLD ** 2;
        if (posDistSq > posThresholdSq) return true;

        // Rotation delta using quaternion dot product
        // dot = 1 means identical, dot = 0 means 90 degrees apart
        const dot =
            this.rotation.x * this.prevRotation.x +
            this.rotation.y * this.prevRotation.y +
            this.rotation.z * this.prevRotation.z +
            this.rotation.w * this.prevRotation.w;

        // Convert dot to angle: angle = 2 * acos(|dot|)
        // For small angles: 1 - |dot| approximates angle^2 / 8
        // Threshold: if 1 - |dot| > threshold, rotation changed significantly
        const rotDelta = 1 - Math.abs(dot);
        const rotThreshold = (SYNC_CONFIG.ROTATION_THRESHOLD ** 2) / 8;
        if (rotDelta > rotThreshold) return true;

        return false;
    }

    /**
     * Serialize for network (full state)
     * Allocates new objects - use sparingly (join/initial sync only)
     */
    toFullState() {
        return {
            playerId: this.playerId,
            username: this.username,
            position: {
                x: this.position.x,
                y: this.position.y,
                z: this.position.z
            },
            velocity: {
                x: this.velocity.x,
                y: this.velocity.y,
                z: this.velocity.z
            },
            rotation: {
                x: this.rotation.x,
                y: this.rotation.y,
                z: this.rotation.z,
                w: this.rotation.w
            },
            megachunkId: this.megachunkId,
            bodyId: this.bodyId,
            shipId: this.shipId,
            sequence: this.sequence,
            timestamp: this.lastUpdate
        };
    }

    /**
     * Serialize for network (delta - position and rotation only)
     */
    toDeltaState() {
        return {
            p: this.playerId,
            x: this.position.x,
            y: this.position.y,
            z: this.position.z,
            vx: this.velocity.x,
            vy: this.velocity.y,
            vz: this.velocity.z,
            rx: this.rotation.x,
            ry: this.rotation.y,
            rz: this.rotation.z,
            rw: this.rotation.w,
            s: this.sequence,
            t: this.lastUpdate
        };
    }

    /**
     * Serialize for database
     */
    toDbRecord() {
        return {
            playerId: this.playerId,
            megachunkId: this.megachunkId,
            bodyId: this.bodyId,
            positionX: this.position.x,
            positionY: this.position.y,
            positionZ: this.position.z,
            velocityX: this.velocity.x,
            velocityY: this.velocity.y,
            velocityZ: this.velocity.z,
            rotationX: this.rotation.x,
            rotationY: this.rotation.y,
            rotationZ: this.rotation.z,
            rotationW: this.rotation.w,
            isOnline: true,
            websocketConnectionId: this.connectionId
        };
    }
}

// =============================================
// SPATIAL CELL
// =============================================

const CELL_SIZE = 256; // Same as megachunk size

function getCellKey(x, y, z) {
    const cx = Math.floor(x / CELL_SIZE);
    const cy = Math.floor(y / CELL_SIZE);
    const cz = Math.floor(z / CELL_SIZE);
    return `${cx},${cy},${cz}`;
}

// =============================================
// PLAYER STATE MANAGER
// =============================================

export class PlayerStateManager {
    constructor(wsServer, worldServerDB) {
        this.wsServer = wsServer;
        this.worldServerDB = worldServerDB;

        // Player states indexed by playerId
        this.players = new Map();

        // Spatial index: cellKey -> Set<playerId>
        this.spatialIndex = new Map();

        // Region index: megachunkId/bodyId -> Set<playerId>
        this.megachunkIndex = new Map();
        this.bodyIndex = new Map();

        // Tick state
        this.tickTimeout = null;
        this.currentTick = 0;
        this.lastTickTime = 0;
        this.lastDbPersist = Date.now();
        this.isRunning = false;
        this.isTickInProgress = false;
        this.isPersisting = false;

        // Stats
        this.stats = {
            ticksProcessed: 0,
            updatesSent: 0,
            dbPersists: 0,
            tickOverruns: 0,
            maxTickDuration: 0
        };
    }

    /**
     * Start the tick loop using setTimeout for drift compensation
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastTickTime = performance.now();
        this.scheduleTick();
        log.info(`PlayerStateManager started at ${SYNC_CONFIG.TICK_RATE} Hz`);
    }

    /**
     * Schedule next tick with drift compensation
     * Uses a fixed-timestep approach to maintain consistent tick rate
     */
    scheduleTick() {
        if (!this.isRunning) return;

        const targetInterval = 1000 / SYNC_CONFIG.TICK_RATE;

        this.tickTimeout = setTimeout(() => {
            const tickStart = performance.now();

            // Calculate time since last tick started (includes previous tick duration + sleep)
            const elapsed = tickStart - this.lastTickTime;
            this.lastTickTime = tickStart;

            // Execute the tick
            this.executeTick();

            // Calculate how long the tick took
            const tickDuration = performance.now() - tickStart;

            // Drift = how much we overshot the target interval
            // Positive drift means we're behind schedule
            const drift = elapsed - targetInterval;

            // Next delay = target - drift, but account for the tick we just ran
            // If tick took 10ms and target is 50ms, sleep for 40ms
            // If we're also 5ms behind (drift=5), sleep for 35ms
            const nextDelay = Math.max(1, targetInterval - tickDuration - Math.max(0, drift));

            if (this.isRunning) {
                this.tickTimeout = setTimeout(() => this.runScheduledTick(), nextDelay);
            }
        }, targetInterval);
    }

    /**
     * Run a scheduled tick (called by setTimeout)
     */
    runScheduledTick() {
        if (!this.isRunning) return;

        const tickStart = performance.now();
        const elapsed = tickStart - this.lastTickTime;
        this.lastTickTime = tickStart;

        this.executeTick();

        const tickDuration = performance.now() - tickStart;
        const targetInterval = 1000 / SYNC_CONFIG.TICK_RATE;
        const drift = elapsed - targetInterval;
        const nextDelay = Math.max(1, targetInterval - tickDuration - Math.max(0, drift));

        if (this.isRunning) {
            this.tickTimeout = setTimeout(() => this.runScheduledTick(), nextDelay);
        }
    }

    /**
     * Execute tick with overrun protection
     */
    executeTick() {
        // Skip if previous tick still running (overrun protection)
        if (this.isTickInProgress) {
            this.stats.tickOverruns++;
            log.warn(`Tick overrun detected (${this.stats.tickOverruns} total)`);
            return;
        }

        this.isTickInProgress = true;
        const tickStart = performance.now();

        try {
            this.tick();
        } catch (error) {
            log.error('Error in tick:', error);
        } finally {
            this.isTickInProgress = false;
            const tickDuration = performance.now() - tickStart;
            if (tickDuration > this.stats.maxTickDuration) {
                this.stats.maxTickDuration = tickDuration;
            }
        }
    }

    /**
     * Stop the tick loop
     */
    stop() {
        this.isRunning = false;
        if (this.tickTimeout) {
            clearTimeout(this.tickTimeout);
            this.tickTimeout = null;
        }
        log.info('PlayerStateManager stopped');
    }

    /**
     * Graceful shutdown - persist all dirty data before stopping
     * @returns {Promise<void>}
     */
    async shutdown() {
        log.info('PlayerStateManager shutting down...');
        this.stop();

        // Force persist all remaining dirty data
        // Mark all players as dbDirty to ensure final state is saved
        for (const state of this.players.values()) {
            state.dbDirty = true;
        }

        // Wait for any in-progress persistence to complete
        while (this.isPersisting) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Final persistence
        await this.persistToDatabase();
        log.info('PlayerStateManager shutdown complete');
    }

    /**
     * Add/register a player
     * @param {string} playerId - UUID of the player
     * @param {string} connectionId - WebSocket connection ID
     * @returns {PlayerState|null} The player state, or null if invalid
     */
    addPlayer(playerId, connectionId, username = null) {
        // Validate playerId is a non-empty string (basic sanity check)
        if (typeof playerId !== 'string' || playerId.length === 0) {
            log.warn('Invalid playerId provided to addPlayer');
            return null;
        }

        let state = this.players.get(playerId);
        const isNew = !state;
        if (isNew) {
            state = new PlayerState(playerId, username);
            this.players.set(playerId, state);
            // Add to spatial index at default position (will update on first position_update)
            this.addToSpatialIndex(playerId, state.position);
        } else if (username) {
            // Update username if provided (might have changed or been set later)
            state.username = username;
        }
        state.connectionId = connectionId;
        state.needsInitialSync = isNew; // Flag for initial state sync
        log.debug(`Player ${playerId} registered`);
        return state;
    }

    /**
     * Send initial state to a newly connected player
     * Called after first position update so we know where they are
     */
    sendInitialStateToPlayer(playerId) {
        const playerState = this.players.get(playerId);
        if (!playerState || !playerState.connectionId) return;

        // Get all nearby players
        const nearby = this.getNearbyPlayers(
            playerState.position,
            SYNC_CONFIG.MAX_SYNC_DISTANCE
        );

        // Filter out self and collect states
        const otherPlayers = nearby
            .filter(({ playerId: otherId }) => otherId !== playerId)
            .map(({ state }) => state);

        if (otherPlayers.length === 0) return;

        // Send as batched full state (not delta)
        this.wsServer.sendToClient(playerState.connectionId, {
            type: 'player_states_initial',
            players: otherPlayers.map(s => s.toFullState()),
            tick: this.currentTick,
            timestamp: Date.now()
        });

        log.debug(`Sent initial state with ${otherPlayers.length} players to ${playerId}`);
    }

    /**
     * Remove a player
     */
    removePlayer(playerId) {
        const state = this.players.get(playerId);
        if (state) {
            // Broadcast player left to nearby players BEFORE removing
            this.broadcastPlayerLeft(playerId, state.position);

            // Remove from spatial index
            this.removeFromSpatialIndex(playerId, state.position);
            this.removeFromRegionIndex(playerId, state.megachunkId, state.bodyId);
            this.players.delete(playerId);
            log.debug(`Player ${playerId} removed`);
        }
    }

    /**
     * Broadcast that a player left to nearby players
     */
    broadcastPlayerLeft(playerId, position) {
        // Get nearby players based on last known position
        const nearby = this.getNearbyPlayers(position, SYNC_CONFIG.MAX_SYNC_DISTANCE);

        for (const { playerId: otherId, state: otherState } of nearby) {
            if (otherId === playerId || !otherState.connectionId) continue;

            this.wsServer.sendToClient(otherState.connectionId, {
                type: 'player_left',
                playerId: playerId
            });
        }
    }

    /**
     * Update player state (called from WebSocket handler)
     * @returns {boolean} true if update was accepted, false if rejected
     */
    updatePlayer(playerId, data) {
        const state = this.players.get(playerId);
        if (!state) {
            log.warn(`Update for unknown player ${playerId}`);
            return false;
        }

        // Capture old values before update (no allocation)
        const oldX = state.position.x;
        const oldY = state.position.y;
        const oldZ = state.position.z;
        const oldMegachunk = state.megachunkId;
        const oldBody = state.bodyId;
        const wasFirstUpdate = state.needsInitialSync;

        // Update state - returns false if validation fails
        if (!state.update(data)) {
            log.warn(`Invalid position data for player ${playerId}`);
            return false;
        }

        // Update spatial index if cell changed
        const oldCell = getCellKey(oldX, oldY, oldZ);
        const newCell = getCellKey(state.position.x, state.position.y, state.position.z);

        if (oldCell !== newCell) {
            // Remove from old cell using captured coordinates
            const oldCellSet = this.spatialIndex.get(oldCell);
            if (oldCellSet) {
                oldCellSet.delete(playerId);
                if (oldCellSet.size === 0) {
                    this.spatialIndex.delete(oldCell);
                }
            }
            // Add to new cell
            this.addToSpatialIndex(playerId, state.position);
        }

        // Update region index if changed
        if (oldMegachunk !== state.megachunkId || oldBody !== state.bodyId) {
            this.removeFromRegionIndex(playerId, oldMegachunk, oldBody);
            this.addToRegionIndex(playerId, state.megachunkId, state.bodyId);
        }

        // Send initial state to new player after first position update
        // Also broadcast this player to existing nearby players
        if (wasFirstUpdate) {
            state.needsInitialSync = false;
            this.sendInitialStateToPlayer(playerId);
            this.broadcastPlayerJoined(playerId);
        }

        return true;
    }

    /**
     * Broadcast that a player joined to all nearby players
     */
    broadcastPlayerJoined(playerId) {
        const playerState = this.players.get(playerId);
        if (!playerState) return;

        // Get nearby players
        const nearby = this.getNearbyPlayers(
            playerState.position,
            SYNC_CONFIG.MAX_SYNC_DISTANCE
        );

        // Send full state to each nearby player
        for (const { playerId: otherId, state: otherState } of nearby) {
            if (otherId === playerId || !otherState.connectionId) continue;

            this.wsServer.sendToClient(otherState.connectionId, {
                type: 'player_joined',
                player: playerState.toFullState()
            });
        }
    }

    // =============================================
    // SPATIAL INDEXING
    // =============================================

    addToSpatialIndex(playerId, position) {
        const key = getCellKey(position.x, position.y, position.z);
        if (!this.spatialIndex.has(key)) {
            this.spatialIndex.set(key, new Set());
        }
        this.spatialIndex.get(key).add(playerId);
    }

    removeFromSpatialIndex(playerId, position) {
        const key = getCellKey(position.x, position.y, position.z);
        const cell = this.spatialIndex.get(key);
        if (cell) {
            cell.delete(playerId);
            if (cell.size === 0) {
                this.spatialIndex.delete(key);
            }
        }
    }

    addToRegionIndex(playerId, megachunkId, bodyId) {
        if (megachunkId) {
            if (!this.megachunkIndex.has(megachunkId)) {
                this.megachunkIndex.set(megachunkId, new Set());
            }
            this.megachunkIndex.get(megachunkId).add(playerId);
        }
        if (bodyId) {
            if (!this.bodyIndex.has(bodyId)) {
                this.bodyIndex.set(bodyId, new Set());
            }
            this.bodyIndex.get(bodyId).add(playerId);
        }
    }

    removeFromRegionIndex(playerId, megachunkId, bodyId) {
        if (megachunkId) {
            const set = this.megachunkIndex.get(megachunkId);
            if (set) {
                set.delete(playerId);
                if (set.size === 0) this.megachunkIndex.delete(megachunkId);
            }
        }
        if (bodyId) {
            const set = this.bodyIndex.get(bodyId);
            if (set) {
                set.delete(playerId);
                if (set.size === 0) this.bodyIndex.delete(bodyId);
            }
        }
    }

    /**
     * Get nearby players within distance
     * Optimized to minimize cell checks and use squared distance comparisons
     */
    getNearbyPlayers(position, maxDistance) {
        const nearby = [];
        const maxDistSq = maxDistance * maxDistance;

        // Calculate cell range - add 1 to ensure we catch edge cases
        // but don't go overboard (cap at reasonable maximum)
        const cellRadius = Math.min(
            Math.ceil(maxDistance / CELL_SIZE) + 1,
            10 // Cap at 10 cells in each direction (21^3 = 9261 max cells)
        );

        const cx = Math.floor(position.x / CELL_SIZE);
        const cy = Math.floor(position.y / CELL_SIZE);
        const cz = Math.floor(position.z / CELL_SIZE);

        // Check cells in range - use squared distance for cell culling
        const cellDistThresholdSq = (cellRadius * CELL_SIZE) ** 2;

        for (let dx = -cellRadius; dx <= cellRadius; dx++) {
            for (let dy = -cellRadius; dy <= cellRadius; dy++) {
                for (let dz = -cellRadius; dz <= cellRadius; dz++) {
                    // Early cull: skip cells that are definitely too far
                    // Cell center distance squared (approximate)
                    const cellDistSq = (dx * CELL_SIZE) ** 2 + (dy * CELL_SIZE) ** 2 + (dz * CELL_SIZE) ** 2;
                    // Cell diagonal is sqrt(3) * CELL_SIZE, so max reach is cellDist + diagonal
                    // Skip if cell center is more than maxDistance + diagonal away
                    if (cellDistSq > cellDistThresholdSq) continue;

                    const key = `${cx + dx},${cy + dy},${cz + dz}`;
                    const cell = this.spatialIndex.get(key);
                    if (!cell) continue;

                    for (const playerId of cell) {
                        const state = this.players.get(playerId);
                        if (!state) continue;

                        // Use squared distance to avoid sqrt
                        const distSq =
                            (state.position.x - position.x) ** 2 +
                            (state.position.y - position.y) ** 2 +
                            (state.position.z - position.z) ** 2;

                        if (distSq <= maxDistSq) {
                            // Only compute sqrt when we need the actual distance
                            nearby.push({ playerId, state, distance: Math.sqrt(distSq) });
                        }
                    }
                }
            }
        }

        return nearby;
    }

    // =============================================
    // TICK PROCESSING
    // =============================================

    /**
     * Main tick - batch and broadcast updates
     * Uses source-centric approach with spatial queries for O(dirty * nearby) complexity
     */
    tick() {
        // Increment with overflow protection (wrap at 2^32 - 1)
        this.currentTick = (this.currentTick + 1) >>> 0;
        this.stats.ticksProcessed++;

        const now = Date.now();

        // Collect dirty players into array for iteration
        const dirtyPlayers = [];
        for (const state of this.players.values()) {
            if (state.dirty) {
                dirtyPlayers.push(state);
            }
        }

        if (dirtyPlayers.length === 0) {
            // Still check DB persistence even if no dirty players
            this.maybePersistToDatabase(now);
            return;
        }

        // Build batched updates PER RECIPIENT
        // Map: connectionId -> [delta states to send]
        const recipientBatches = new Map();

        // For each dirty player, find nearby recipients using spatial index
        for (const sourceState of dirtyPlayers) {
            // Use spatial query instead of iterating all players
            const nearbyRecipients = this.getNearbyPlayers(
                sourceState.position,
                SYNC_CONFIG.MAX_SYNC_DISTANCE
            );

            for (const { playerId: recipientId, state: recipientState, distance } of nearbyRecipients) {
                // Skip self
                if (recipientId === sourceState.playerId) continue;

                // Skip if no connection
                if (!recipientState.connectionId) continue;

                // Check priority-based frequency
                const priority = this.getPriorityForDistance(distance);
                if (this.currentTick % priority !== 0) continue;

                // Add to recipient's batch
                let batch = recipientBatches.get(recipientState.connectionId);
                if (!batch) {
                    batch = [];
                    recipientBatches.set(recipientState.connectionId, batch);
                }
                batch.push(sourceState);
            }

            // Clear dirty flag immediately after processing
            sourceState.dirty = false;
            sourceState.lastBroadcast = now;
        }

        // Send batched updates to each recipient
        for (const [connectionId, updates] of recipientBatches) {
            this.sendBatchedUpdates(connectionId, updates);
        }

        // Periodic DB persistence
        this.maybePersistToDatabase(now);
    }

    /**
     * Trigger DB persistence if interval elapsed
     * Uses lock to prevent concurrent persistence
     */
    maybePersistToDatabase(now) {
        if (now - this.lastDbPersist >= SYNC_CONFIG.DB_PERSIST_INTERVAL) {
            this.persistToDatabase();
            this.lastDbPersist = now;
        }
    }

    /**
     * Get tick divisor for distance-based priority
     */
    getPriorityForDistance(distance) {
        if (distance < SYNC_CONFIG.PRIORITY_TIERS.HIGH) return 1;
        if (distance < SYNC_CONFIG.PRIORITY_TIERS.MEDIUM) return 2;
        if (distance < SYNC_CONFIG.PRIORITY_TIERS.LOW) return 5;
        if (distance < SYNC_CONFIG.PRIORITY_TIERS.MINIMAL) return 10;
        return 20; // Very far - rarely update
    }

    /**
     * Send position update to a specific player (single update, rarely used)
     */
    sendUpdateToPlayer(connectionId, sourceState) {
        if (!connectionId) return;

        // Build message without spread operator
        const delta = sourceState.toDeltaState();
        delta.type = 'player_state';
        this.wsServer.sendToClient(connectionId, delta);

        this.stats.updatesSent++;
    }

    /**
     * Send batched updates to a player (multiple other players)
     * Optimized to minimize allocations in the hot path
     * @returns {boolean} true if send succeeded, false if connection is dead
     */
    sendBatchedUpdates(connectionId, states) {
        if (!connectionId || states.length === 0) return true;

        const maxBatch = SYNC_CONFIG.MAX_BATCH_SIZE;
        const tick = this.currentTick;
        const timestamp = Date.now();

        let success = true;

        // Process in chunks without slice() when possible
        if (states.length <= maxBatch) {
            // Single batch - build players array directly
            const players = new Array(states.length);
            for (let i = 0; i < states.length; i++) {
                players[i] = states[i].toDeltaState();
            }
            success = this.wsServer.sendToClient(connectionId, {
                type: 'player_states_batch',
                players,
                tick,
                timestamp
            });
        } else {
            // Multiple batches needed
            for (let i = 0; i < states.length; i += maxBatch) {
                const end = Math.min(i + maxBatch, states.length);
                const players = new Array(end - i);
                for (let j = i; j < end; j++) {
                    players[j - i] = states[j].toDeltaState();
                }
                if (!this.wsServer.sendToClient(connectionId, {
                    type: 'player_states_batch',
                    players,
                    tick,
                    timestamp
                })) {
                    success = false;
                    break; // Don't bother sending more batches to dead connection
                }
            }
        }

        if (success) {
            this.stats.updatesSent += states.length;
        }
        return success;
    }

    /**
     * Persist dirty states to database
     * Uses lock to prevent concurrent persistence operations
     */
    async persistToDatabase() {
        // Prevent concurrent persistence
        if (this.isPersisting) {
            return;
        }

        this.isPersisting = true;

        // Snapshot dirty players and clear flags atomically
        const dirtyPlayers = [];
        for (const state of this.players.values()) {
            if (state.dbDirty) {
                dirtyPlayers.push(state);
                state.dbDirty = false;
            }
        }

        if (dirtyPlayers.length === 0) {
            this.isPersisting = false;
            return;
        }

        try {
            // Batch upsert - capture records before async operation
            const records = dirtyPlayers.map(s => s.toDbRecord());
            await this.worldServerDB.batchUpsertPlayerPositions(records);

            this.stats.dbPersists++;
            log.debug(`Persisted ${dirtyPlayers.length} player positions to DB`);
        } catch (error) {
            log.error('Failed to persist player positions:', error);
            // Mark as dirty again for retry (only if player still exists)
            for (const state of dirtyPlayers) {
                if (this.players.has(state.playerId)) {
                    state.dbDirty = true;
                }
            }
        } finally {
            this.isPersisting = false;
        }
    }

    /**
     * Get current stats
     */
    getStats() {
        return {
            ...this.stats,
            playerCount: this.players.size,
            cellCount: this.spatialIndex.size,
            currentTick: this.currentTick
        };
    }

    /**
     * Request full state for a region (for new subscribers)
     */
    getPlayersInMegachunk(megachunkId) {
        const playerIds = this.megachunkIndex.get(megachunkId);
        if (!playerIds) return [];

        return Array.from(playerIds)
            .map(id => this.players.get(id))
            .filter(s => s)
            .map(s => s.toFullState());
    }

    getPlayersOnBody(bodyId) {
        const playerIds = this.bodyIndex.get(bodyId);
        if (!playerIds) return [];

        return Array.from(playerIds)
            .map(id => this.players.get(id))
            .filter(s => s)
            .map(s => s.toFullState());
    }
}

export default PlayerStateManager;
