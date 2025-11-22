/**
 * PlayerInterpolation.js
 * Client-side interpolation and prediction for smooth multiplayer
 *
 * Features:
 * - Snapshot buffer for interpolation
 * - Linear interpolation between states
 * - Velocity-based extrapolation for prediction
 * - Jitter buffer to handle network variance
 */

// =============================================
// CONFIGURATION
// =============================================

export const INTERPOLATION_CONFIG = {
    // How far behind real-time to interpolate (ms)
    // Higher = smoother but more latency
    INTERPOLATION_DELAY: 100,

    // Maximum snapshots to keep in buffer
    MAX_SNAPSHOTS: 30,

    // Maximum time to extrapolate into future (ms)
    MAX_EXTRAPOLATION: 200,

    // Snap to position if too far off (units)
    SNAP_THRESHOLD: 10,

    // Rotation snap threshold (radians)
    ROTATION_SNAP_THRESHOLD: Math.PI / 2
};

// =============================================
// SNAPSHOT
// =============================================

/**
 * Safely extract a finite number, defaulting to fallback if NaN/Infinity/undefined
 */
function safeNumber(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
}

class Snapshot {
    constructor(data) {
        this.timestamp = safeNumber(data.timestamp || data.t, Date.now());
        this.sequence = safeNumber(data.sequence || data.s, 0);

        // Extract with validation - reject NaN/Infinity
        const posX = data.position?.x ?? data.x;
        const posY = data.position?.y ?? data.y;
        const posZ = data.position?.z ?? data.z;

        this.position = {
            x: safeNumber(posX, 0),
            y: safeNumber(posY, 0),
            z: safeNumber(posZ, 0)
        };

        const velX = data.velocity?.x ?? data.vx;
        const velY = data.velocity?.y ?? data.vy;
        const velZ = data.velocity?.z ?? data.vz;

        this.velocity = {
            x: safeNumber(velX, 0),
            y: safeNumber(velY, 0),
            z: safeNumber(velZ, 0)
        };

        const rotX = data.rotation?.x ?? data.rx;
        const rotY = data.rotation?.y ?? data.ry;
        const rotZ = data.rotation?.z ?? data.rz;
        const rotW = data.rotation?.w ?? data.rw;

        this.rotation = {
            x: safeNumber(rotX, 0),
            y: safeNumber(rotY, 0),
            z: safeNumber(rotZ, 0),
            w: safeNumber(rotW, 1)
        };
    }
}

// =============================================
// REMOTE PLAYER STATE
// =============================================

export class RemotePlayerState {
    constructor(playerId) {
        this.playerId = playerId;

        // Snapshot buffer (sorted by timestamp)
        this.snapshots = [];

        // Current interpolated state
        this.position = { x: 0, y: 0, z: 0 };
        this.velocity = { x: 0, y: 0, z: 0 };
        this.rotation = { x: 0, y: 0, z: 0, w: 1 };

        // Context
        this.megachunkId = null;
        this.bodyId = null;
        this.shipId = null;

        // Timing
        this.lastUpdateTime = 0;
        this.serverTimeOffset = 0; // Estimated offset between client and server time
    }

    /**
     * Add a new snapshot from server
     */
    addSnapshot(data) {
        const snapshot = new Snapshot(data);

        // Insert sorted by timestamp
        let inserted = false;
        for (let i = this.snapshots.length - 1; i >= 0; i--) {
            if (this.snapshots[i].timestamp <= snapshot.timestamp) {
                this.snapshots.splice(i + 1, 0, snapshot);
                inserted = true;
                break;
            }
        }
        if (!inserted) {
            this.snapshots.unshift(snapshot);
        }

        // Trim old snapshots
        while (this.snapshots.length > INTERPOLATION_CONFIG.MAX_SNAPSHOTS) {
            this.snapshots.shift();
        }

        // Update context
        if (data.megachunkId !== undefined) this.megachunkId = data.megachunkId;
        if (data.bodyId !== undefined) this.bodyId = data.bodyId;
        if (data.shipId !== undefined) this.shipId = data.shipId;

        this.lastUpdateTime = Date.now();
    }

    /**
     * Update interpolated state for current frame
     * @param {number} renderTime - Current render time (client time - delay)
     */
    update(renderTime) {
        if (this.snapshots.length === 0) return;

        // Find surrounding snapshots
        let before = null;
        let after = null;

        for (let i = 0; i < this.snapshots.length; i++) {
            if (this.snapshots[i].timestamp <= renderTime) {
                before = this.snapshots[i];
            } else {
                after = this.snapshots[i];
                break;
            }
        }

        if (before && after) {
            // Interpolate between two snapshots
            this.interpolate(before, after, renderTime);
        } else if (before) {
            // Extrapolate from last known state
            this.extrapolate(before, renderTime);
        } else if (after) {
            // Haven't reached first snapshot yet, snap to it
            this.snapTo(after);
        }
    }

    /**
     * Interpolate between two snapshots
     */
    interpolate(before, after, renderTime) {
        const duration = after.timestamp - before.timestamp;
        if (duration <= 0) {
            this.snapTo(after);
            return;
        }

        const t = (renderTime - before.timestamp) / duration;
        const clampedT = Math.max(0, Math.min(1, t));

        // Linear interpolation for position
        this.position.x = before.position.x + (after.position.x - before.position.x) * clampedT;
        this.position.y = before.position.y + (after.position.y - before.position.y) * clampedT;
        this.position.z = before.position.z + (after.position.z - before.position.z) * clampedT;

        // Interpolate velocity
        this.velocity.x = before.velocity.x + (after.velocity.x - before.velocity.x) * clampedT;
        this.velocity.y = before.velocity.y + (after.velocity.y - before.velocity.y) * clampedT;
        this.velocity.z = before.velocity.z + (after.velocity.z - before.velocity.z) * clampedT;

        // Slerp for rotation
        this.slerpRotation(before.rotation, after.rotation, clampedT);
    }

    /**
     * Extrapolate from last known state using velocity
     */
    extrapolate(snapshot, renderTime) {
        const elapsed = renderTime - snapshot.timestamp;

        // Cap extrapolation time
        const maxElapsed = Math.min(elapsed, INTERPOLATION_CONFIG.MAX_EXTRAPOLATION);
        const dt = maxElapsed / 1000; // Convert to seconds

        // Apply velocity
        this.position.x = snapshot.position.x + snapshot.velocity.x * dt;
        this.position.y = snapshot.position.y + snapshot.velocity.y * dt;
        this.position.z = snapshot.position.z + snapshot.velocity.z * dt;

        this.velocity.x = snapshot.velocity.x;
        this.velocity.y = snapshot.velocity.y;
        this.velocity.z = snapshot.velocity.z;

        // Keep rotation as-is during extrapolation
        this.rotation.x = snapshot.rotation.x;
        this.rotation.y = snapshot.rotation.y;
        this.rotation.z = snapshot.rotation.z;
        this.rotation.w = snapshot.rotation.w;
    }

    /**
     * Snap directly to a snapshot
     */
    snapTo(snapshot) {
        this.position.x = snapshot.position.x;
        this.position.y = snapshot.position.y;
        this.position.z = snapshot.position.z;

        this.velocity.x = snapshot.velocity.x;
        this.velocity.y = snapshot.velocity.y;
        this.velocity.z = snapshot.velocity.z;

        this.rotation.x = snapshot.rotation.x;
        this.rotation.y = snapshot.rotation.y;
        this.rotation.z = snapshot.rotation.z;
        this.rotation.w = snapshot.rotation.w;
    }

    /**
     * Spherical linear interpolation for quaternions
     */
    slerpRotation(a, b, t) {
        // Compute dot product
        let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;

        // If negative dot, negate one quaternion to take shorter path
        let bx = b.x, by = b.y, bz = b.z, bw = b.w;
        if (dot < 0) {
            dot = -dot;
            bx = -bx;
            by = -by;
            bz = -bz;
            bw = -bw;
        }

        // If very close, just lerp
        if (dot > 0.9995) {
            this.rotation.x = a.x + (bx - a.x) * t;
            this.rotation.y = a.y + (by - a.y) * t;
            this.rotation.z = a.z + (bz - a.z) * t;
            this.rotation.w = a.w + (bw - a.w) * t;
            this.normalizeRotation();
            return;
        }

        // Slerp
        const theta0 = Math.acos(dot);
        const theta = theta0 * t;
        const sinTheta = Math.sin(theta);
        const sinTheta0 = Math.sin(theta0);

        const s0 = Math.cos(theta) - dot * sinTheta / sinTheta0;
        const s1 = sinTheta / sinTheta0;

        this.rotation.x = a.x * s0 + bx * s1;
        this.rotation.y = a.y * s0 + by * s1;
        this.rotation.z = a.z * s0 + bz * s1;
        this.rotation.w = a.w * s0 + bw * s1;
    }

    /**
     * Normalize rotation quaternion
     */
    normalizeRotation() {
        const len = Math.sqrt(
            this.rotation.x ** 2 +
            this.rotation.y ** 2 +
            this.rotation.z ** 2 +
            this.rotation.w ** 2
        );
        if (len > 0.0001) {
            this.rotation.x /= len;
            this.rotation.y /= len;
            this.rotation.z /= len;
            this.rotation.w /= len;
        }
    }

    /**
     * Check if player data is stale
     */
    isStale(maxAge = 5000) {
        return Date.now() - this.lastUpdateTime > maxAge;
    }
}

// =============================================
// PLAYER INTERPOLATION MANAGER
// =============================================

export class PlayerInterpolationManager {
    constructor() {
        // Remote player states indexed by playerId
        this.remotePlayers = new Map();

        // Estimated server time offset
        this.serverTimeOffset = 0;

        // Stats
        this.stats = {
            playersTracked: 0,
            snapshotsReceived: 0,
            interpolationUpdates: 0
        };
    }

    /**
     * Process incoming player state from server
     */
    receivePlayerState(data) {
        const playerId = data.playerId || data.p;
        if (!playerId) return;

        let state = this.remotePlayers.get(playerId);
        if (!state) {
            state = new RemotePlayerState(playerId);
            this.remotePlayers.set(playerId, state);
        }

        state.addSnapshot(data);
        this.stats.snapshotsReceived++;
    }

    /**
     * Process batched player states
     */
    receivePlayerStatesBatch(data) {
        const players = data.players || [];
        for (const playerData of players) {
            this.receivePlayerState(playerData);
        }
    }

    /**
     * Process initial state sync (full state for all nearby players)
     */
    receiveInitialStates(data) {
        const players = data.players || [];
        for (const playerData of players) {
            const playerId = playerData.playerId || playerData.p;
            if (!playerId) continue;

            // Create fresh state and add initial snapshot
            const state = new RemotePlayerState(playerId);
            this.remotePlayers.set(playerId, state);
            state.addSnapshot(playerData);

            // Copy context data
            if (playerData.megachunkId !== undefined) state.megachunkId = playerData.megachunkId;
            if (playerData.bodyId !== undefined) state.bodyId = playerData.bodyId;
            if (playerData.shipId !== undefined) state.shipId = playerData.shipId;
        }
        this.stats.snapshotsReceived += players.length;
    }

    /**
     * Handle player joined notification
     */
    receivePlayerJoined(data) {
        const playerData = data.player;
        if (!playerData) return;

        const playerId = playerData.playerId || playerData.p;
        if (!playerId) return;

        // Create fresh state
        const state = new RemotePlayerState(playerId);
        this.remotePlayers.set(playerId, state);
        state.addSnapshot(playerData);

        // Copy context data
        if (playerData.megachunkId !== undefined) state.megachunkId = playerData.megachunkId;
        if (playerData.bodyId !== undefined) state.bodyId = playerData.bodyId;
        if (playerData.shipId !== undefined) state.shipId = playerData.shipId;

        this.stats.snapshotsReceived++;
    }

    /**
     * Handle player left notification
     */
    receivePlayerLeft(data) {
        const playerId = data.playerId;
        if (playerId) {
            this.remotePlayers.delete(playerId);
        }
    }

    /**
     * Handle any player sync message from server
     * Convenience method that routes to correct handler based on message type
     */
    handleMessage(message) {
        switch (message.type) {
            case 'player_state':
                this.receivePlayerState(message);
                break;
            case 'player_states_batch':
                this.receivePlayerStatesBatch(message);
                break;
            case 'player_states_initial':
                this.receiveInitialStates(message);
                break;
            case 'player_joined':
                this.receivePlayerJoined(message);
                break;
            case 'player_left':
                this.receivePlayerLeft(message);
                break;
            default:
                return false; // Unhandled message type
        }
        return true; // Message was handled
    }

    /**
     * Update all remote players for current frame
     * Call this every frame before rendering
     */
    update() {
        const renderTime = Date.now() - INTERPOLATION_CONFIG.INTERPOLATION_DELAY;

        for (const [playerId, state] of this.remotePlayers) {
            // Remove stale players
            if (state.isStale()) {
                this.remotePlayers.delete(playerId);
                continue;
            }

            state.update(renderTime);
        }

        this.stats.playersTracked = this.remotePlayers.size;
        this.stats.interpolationUpdates++;
    }

    /**
     * Get interpolated state for a player
     */
    getPlayerState(playerId) {
        return this.remotePlayers.get(playerId) || null;
    }

    /**
     * Get all remote players
     */
    getAllPlayers() {
        return Array.from(this.remotePlayers.values());
    }

    /**
     * Remove a player
     */
    removePlayer(playerId) {
        this.remotePlayers.delete(playerId);
    }

    /**
     * Clear all players
     */
    clear() {
        this.remotePlayers.clear();
    }

    /**
     * Get stats
     */
    getStats() {
        return { ...this.stats };
    }
}

export default PlayerInterpolationManager;
