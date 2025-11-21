/**
 * POLYMIR CELESTIAL BODY PHYSICS SYSTEM
 * ======================================
 * Server-side physics simulation for celestial bodies
 * Handles position updates, rotation, velocity, and megachunk transfers
 */

import logger from '../utils/logger.js';
import { MegachunkTransferSystem } from './megachunkTransfer.js';

const log = logger.child('BodyPhysics');

// =============================================
// PHYSICS CONSTANTS
// =============================================

// Gravitational constant (simplified for game physics)
const G = 6.67430e-11; // m³/kg/s²

// Physics tick rate (Hz)
const DEFAULT_TICK_RATE = 10; // 10 updates per second

// Maximum velocity (units per second) to prevent runaway physics
const MAX_VELOCITY = 1000;

// Minimum velocity threshold (below this, set to zero)
const MIN_VELOCITY_THRESHOLD = 0.001;

// =============================================
// QUATERNION MATH
// =============================================

/**
 * Normalize quaternion
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} w
 * @returns {Object}
 */
function normalizeQuaternion(x, y, z, w) {
    const magnitude = Math.sqrt(x * x + y * y + z * z + w * w);

    if (magnitude === 0) {
        return { x: 0, y: 0, z: 0, w: 1 };
    }

    return {
        x: x / magnitude,
        y: y / magnitude,
        z: z / magnitude,
        w: w / magnitude
    };
}

/**
 * Apply angular velocity to quaternion
 * @param {Object} rotation - Current rotation quaternion
 * @param {Object} angularVelocity - Angular velocity (radians per second)
 * @param {number} deltaTime - Time step (seconds)
 * @returns {Object} New rotation quaternion
 */
function applyAngularVelocity(rotation, angularVelocity, deltaTime) {
    const { x: rx, y: ry, z: rz, w: rw } = rotation;
    const { x: wx, y: wy, z: wz } = angularVelocity;

    // Calculate half-angle rotation
    const halfAngle = Math.sqrt(wx * wx + wy * wy + wz * wz) * deltaTime * 0.5;

    if (halfAngle < 0.0001) {
        // No significant rotation
        return rotation;
    }

    const sinHalf = Math.sin(halfAngle);
    const cosHalf = Math.cos(halfAngle);
    const invMagnitude = sinHalf / Math.sqrt(wx * wx + wy * wy + wz * wz);

    // Quaternion multiplication for rotation
    const qx = wx * invMagnitude;
    const qy = wy * invMagnitude;
    const qz = wz * invMagnitude;
    const qw = cosHalf;

    // Multiply quaternions: rotation * angularRotation
    const newX = rw * qx + rx * qw + ry * qz - rz * qy;
    const newY = rw * qy - rx * qz + ry * qw + rz * qx;
    const newZ = rw * qz + rx * qy - ry * qx + rz * qw;
    const newW = rw * qw - rx * qx - ry * qy - rz * qz;

    return normalizeQuaternion(newX, newY, newZ, newW);
}

// =============================================
// BODY PHYSICS SYSTEM
// =============================================

export class BodyPhysicsSystem {
    constructor(worldServerDB, wsServer = null) {
        this.worldServerDB = worldServerDB;
        this.wsServer = wsServer;
        this.transferSystem = new MegachunkTransferSystem(worldServerDB);

        // Physics loop state
        this.isRunning = false;
        this.tickInterval = null;
        this.tickRate = parseInt(process.env.PHYSICS_TICK_RATE_HZ) || DEFAULT_TICK_RATE;
        this.tickDuration = 1000 / this.tickRate; // milliseconds
        this.deltaTime = 1 / this.tickRate; // seconds

        // Performance tracking
        this.lastTickTime = 0;
        this.tickCount = 0;
        this.avgTickDuration = 0;

        // Active bodies cache
        this.activeBodies = new Map();
    }

    /**
     * Start physics loop
     */
    start() {
        if (this.isRunning) {
            log.warn('Physics system already running');
            return;
        }

        this.isRunning = true;
        this.lastTickTime = Date.now();

        this.tickInterval = setInterval(() => {
            this.tick().catch(error => {
                log.error('Physics tick failed', {
                    error: error.message,
                    stack: error.stack
                });
            });
        }, this.tickDuration);

        log.info('Body physics system started', {
            tickRate: this.tickRate,
            tickDuration: this.tickDuration,
            deltaTime: this.deltaTime
        });
    }

    /**
     * Stop physics loop
     */
    stop() {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;

        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }

        log.info('Body physics system stopped', {
            totalTicks: this.tickCount,
            avgTickDuration: this.avgTickDuration.toFixed(2) + 'ms'
        });
    }

    /**
     * Physics tick - update all active bodies
     */
    async tick() {
        const tickStartTime = Date.now();

        try {
            // Get active bodies (in active megachunks with players)
            const activeBodies = await this.getActiveBodies();

            if (activeBodies.length === 0) {
                return;
            }

            log.trace('Physics tick', {
                bodyCount: activeBodies.length,
                deltaTime: this.deltaTime
            });

            // Update each body
            const updatePromises = activeBodies.map(body => this.updateBody(body));
            await Promise.all(updatePromises);

            // Check for megachunk transfers
            const transfers = await this.transferSystem.processBatch(activeBodies);
            const transferredCount = transfers.filter(t => t.transferred).length;

            if (transferredCount > 0) {
                log.info('Megachunk transfers completed', {
                    transferredCount,
                    totalBodies: activeBodies.length
                });

                // Broadcast transfers to connected players
                if (this.wsServer) {
                    this.broadcastTransfers(transfers);
                }
            }

            // Update performance metrics
            this.tickCount++;
            const tickDuration = Date.now() - tickStartTime;
            this.avgTickDuration = (this.avgTickDuration * (this.tickCount - 1) + tickDuration) / this.tickCount;

            if (tickDuration > this.tickDuration * 0.8) {
                log.warn('Physics tick taking too long', {
                    duration: tickDuration,
                    target: this.tickDuration,
                    bodyCount: activeBodies.length
                });
            }

        } catch (error) {
            log.error('Physics tick error', {
                error: error.message,
                stack: error.stack
            });
        }
    }

    /**
     * Get active celestial bodies (in megachunks with players)
     * @returns {Promise<Array>}
     */
    async getActiveBodies() {
        try {
            const query = `
                SELECT DISTINCT cb.*
                FROM celestial_bodies cb
                JOIN megachunks m ON cb.megachunk_id = m.megachunk_id
                WHERE m.is_active = true
                ORDER BY cb.body_id
            `;

            const result = await this.worldServerDB.pool.query(query);
            return result.rows;

        } catch (error) {
            log.error('Failed to get active bodies', {
                error: error.message
            });
            return [];
        }
    }

    /**
     * Update single body physics
     * @param {Object} body
     * @returns {Promise<void>}
     */
    async updateBody(body) {
        try {
            // Update position based on velocity
            const newLocalX = body.local_x + body.velocity_x * this.deltaTime;
            const newLocalY = body.local_y + body.velocity_y * this.deltaTime;
            const newLocalZ = body.local_z + body.velocity_z * this.deltaTime;

            // Update rotation based on angular velocity
            const newRotation = applyAngularVelocity(
                {
                    x: body.rotation_x,
                    y: body.rotation_y,
                    z: body.rotation_z,
                    w: body.rotation_w
                },
                {
                    x: body.angular_velocity_x,
                    y: body.angular_velocity_y,
                    z: body.angular_velocity_z
                },
                this.deltaTime
            );

            // Apply velocity damping (very slight for celestial bodies)
            const damping = 0.9999; // Almost no damping (space has no friction)
            const newVelocityX = this.clampVelocity(body.velocity_x * damping);
            const newVelocityY = this.clampVelocity(body.velocity_y * damping);
            const newVelocityZ = this.clampVelocity(body.velocity_z * damping);

            // Update body in database
            await this.worldServerDB.updateCelestialBodyPhysics(body.body_id, {
                localX: newLocalX,
                localY: newLocalY,
                localZ: newLocalZ,
                velocityX: newVelocityX,
                velocityY: newVelocityY,
                velocityZ: newVelocityZ,
                rotationX: newRotation.x,
                rotationY: newRotation.y,
                rotationZ: newRotation.z,
                rotationW: newRotation.w
            });

            // Update body object for megachunk transfer check
            body.local_x = newLocalX;
            body.local_y = newLocalY;
            body.local_z = newLocalZ;
            body.velocity_x = newVelocityX;
            body.velocity_y = newVelocityY;
            body.velocity_z = newVelocityZ;
            body.rotation_x = newRotation.x;
            body.rotation_y = newRotation.y;
            body.rotation_z = newRotation.z;
            body.rotation_w = newRotation.w;

            log.trace('Body updated', {
                bodyId: body.body_id,
                position: [newLocalX.toFixed(2), newLocalY.toFixed(2), newLocalZ.toFixed(2)]
            });

        } catch (error) {
            log.error('Body update failed', {
                bodyId: body.body_id,
                error: error.message
            });
        }
    }

    /**
     * Apply gravity between two bodies (simplified N-body gravity)
     * @param {Object} body1
     * @param {Object} body2
     * @returns {Object} Force vector
     */
    calculateGravitationalForce(body1, body2) {
        // Calculate distance vector
        const dx = body2.local_x - body1.local_x;
        const dy = body2.local_y - body1.local_y;
        const dz = body2.local_z - body1.local_z;

        const distanceSquared = dx * dx + dy * dy + dz * dz;
        const distance = Math.sqrt(distanceSquared);

        // Avoid division by zero and ignore very close bodies
        if (distance < 1.0) {
            return { x: 0, y: 0, z: 0 };
        }

        // F = G * (m1 * m2) / r²
        const forceMagnitude = G * body1.mass * body2.mass / distanceSquared;

        // Force direction (unit vector)
        const forceX = (dx / distance) * forceMagnitude;
        const forceY = (dy / distance) * forceMagnitude;
        const forceZ = (dz / distance) * forceMagnitude;

        return { x: forceX, y: forceY, z: forceZ };
    }

    /**
     * Clamp velocity to prevent physics explosions
     * @param {number} velocity
     * @returns {number}
     */
    clampVelocity(velocity) {
        // Apply minimum threshold
        if (Math.abs(velocity) < MIN_VELOCITY_THRESHOLD) {
            return 0;
        }

        // Clamp to maximum
        return Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, velocity));
    }

    /**
     * Broadcast megachunk transfers to connected players
     * @param {Array} transfers
     */
    broadcastTransfers(transfers) {
        if (!this.wsServer) return;

        for (const transfer of transfers) {
            if (!transfer.transferred) continue;

            const message = {
                type: 'body_transferred',
                bodyId: transfer.bodyId,
                oldMegachunkId: transfer.oldMegachunkId,
                newMegachunkId: transfer.newMegachunkId,
                newPosition: transfer.newLocalPosition,
                timestamp: Date.now()
            };

            // Broadcast to both old and new megachunks
            this.wsServer.broadcastToMegachunk(transfer.oldMegachunkId, message);
            this.wsServer.broadcastToMegachunk(transfer.newMegachunkId, message);
        }
    }

    /**
     * Get physics statistics
     * @returns {Object}
     */
    getStats() {
        return {
            isRunning: this.isRunning,
            tickRate: this.tickRate,
            deltaTime: this.deltaTime,
            tickCount: this.tickCount,
            avgTickDuration: this.avgTickDuration.toFixed(2) + 'ms',
            activeBodies: this.activeBodies.size
        };
    }

    /**
     * Manually trigger a physics update (for testing)
     * @returns {Promise<void>}
     */
    async manualUpdate() {
        await this.tick();
    }
}

// =============================================
// EXPORTS
// =============================================

export default {
    BodyPhysicsSystem,
    normalizeQuaternion,
    applyAngularVelocity,
    G,
    MAX_VELOCITY,
    MIN_VELOCITY_THRESHOLD
};
